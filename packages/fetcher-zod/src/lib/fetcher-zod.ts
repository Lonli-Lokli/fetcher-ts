import crossFetch from 'cross-fetch';
import { z } from 'zod';
import {
  jsonExtractor,
  ok,
  textExtractor,
  unsafeCoerce,
  err,
} from './helpers.js';
import {
  Data,
  Extractor,
  Fetch,
  Handled,
  HandlersMap,
  ParsedResult,
  Result,
  SafeResult,
  StrictSchema,
} from './shapes.js';
import {
  HandlerNotSetError,
  JsonDeserializationError,
  ValidationError,
  ParsingError,
  NetworkError,
  FetcherError,
} from './errors.js';

export const defaultExtractor = (response: Response) => {
  const contentType = response.headers.get('content-type');

  return contentType?.includes('application/json')
    ? jsonExtractor(response)
    : textExtractor(response);
};

/**
 * A type-safe HTTP client with Zod validation
 *
 * @template TResult The union type of possible API responses (e.g., Result<200, User> | Result<404, string>)
 * @template To The return type after processing the response
 *
 * @example
 * ```typescript
 * type ApiResponse =
 *   | Result<200, User>
 *   | Result<400, string>
 *   | Result<404, null>;
 *
 * const fetcher = new ZodFetcher<ApiResponse, string>('/api/users/1')
 *   .handle(200, user => `Found: ${user.name}`, UserSchema)
 *   .handle(400, error => `Error: ${error}`)
 *   .handle(404, () => 'Not found')
 *   .run();
 * ```
 */
export class ZodFetcher<TResult extends Result<any, any>, To> {
  private readonly handlers: HandlersMap<TResult, To> = new Map();
  private restToHandler?: () => To = void 0;
  private restErrorHandler?: (response: Response) => Error = void 0;

  /**
   * Creates a new ZodFetcher instance
   *
   * @param input The URL or Request object to fetch
   * @param init Optional fetch init options
   * @param parser Custom parser function (defaults to Zod validation)
   * @param fetch Custom fetch implementation (defaults to cross-fetch)
   *
   * @example
   * ```typescript
   * const fetcher = new ZodFetcher<ApiResponse, User>(
   *   'https://api.example.com/users/1',
   *   {
   *     method: 'GET',
   *     headers: { 'Authorization': 'Bearer token123' }
   *   }
   * );
   * ```
   */
  constructor(
    protected readonly input: RequestInfo,
    protected readonly init: RequestInit | undefined,
    protected readonly parser: <T extends z.ZodType<any>>(
      schema: T,
      value: unknown
    ) => ParsedResult<z.infer<T>> = defaultParser,
    protected readonly fetch: Fetch = crossFetch
  ) {}

  /**
   * Register a handler for a specific status code
   *
   * @template Code The HTTP status code to handle
   * @template HSchema The Zod schema type
   * @param code The HTTP status code
   * @param handler Function to process the response data
   * @param schema Optional Zod schema for validation
   * @param extractor Optional custom response extractor
   * @returns A new ZodFetcher with the handler registered
   *
   * @example
   * ```typescript
   * fetcher.handle(200,
   *   user => `User: ${user.name}`,
   *   z.object({
   *     id: z.number(),
   *     name: z.string(),
   *     email: z.string().email()
   *   })
   * )
   * ```
   */
  handle<Code extends TResult['code'], HSchema extends z.ZodType<any>>(
    code: Code,
    handler: (data: Data<TResult, Code>) => To,
    schema?: StrictSchema<HSchema, TResult, Code>,
    extractor: Extractor<TResult, Code> = defaultExtractor
  ): ZodFetcher<Handled<TResult, Code>, To> {
    this.handlers.set(code, [handler, schema, extractor]);

    return unsafeCoerce(this);
  }

  /**
   * Handle all unhandled response statuses by throwing a custom error
   *
   * @param restErrorHandler Function that returns an Error for unhandled status codes
   * @returns A new ZodFetcher with all status codes handled
   *
   * @example
   * ```typescript
   * fetcher.discardRestAsError(
   *   response => new Error(`Unexpected status: ${response.status}`)
   * )
   * ```
   */
  discardRestAsError(
    restErrorHandler: (r: Response) => Error
  ): ZodFetcher<Handled<TResult, never>, To> {
    this.restErrorHandler = restErrorHandler;

    return unsafeCoerce(this);
  }

  /**
   * Handle all unhandled response statuses by returning a default value
   *
   * @param restToHandler Function that returns a default value for unhandled status codes
   * @returns A new ZodFetcher with all status codes handled
   *
   * @example
   * ```typescript
   * fetcher.discardRestAsTo(
   *   () => 'Unknown response'
   * )
   * ```
   */
  discardRestAsTo(
    restToHandler: () => To
  ): ZodFetcher<Handled<TResult, never>, To> {
    this.restToHandler = restToHandler;

    return unsafeCoerce(this);
  }

  /**
   * Transform the result of this fetcher
   *
   * @template B The new return type
   * @param fn Transformation function
   * @returns A new ZodFetcher with transformed output
   *
   * @example
   * ```typescript
   * const userFetcher = fetcher.handle(200, user => user, UserSchema);
   * const nameFetcher = userFetcher.map(user => user.name);
   * // nameFetcher.run() will return a string (the user's name)
   * ```
   */
  map<B>(fn: (a: To) => B): ZodFetcher<TResult, B> {
    const newFetcher = new ZodFetcher<TResult, B>(
      this.input,
      this.init,
      this.parser,
      this.fetch
    );

    // Copy handlers with transformed output
    for (const [
      code,
      [handler, schema, extractor],
    ] of this.handlers.entries()) {
      (newFetcher.handlers as any).set(code, [
        (data: any) => fn(handler(data)),
        schema,
        extractor,
      ]);
    }

    // Transform rest handlers if they exist
    if (this.restToHandler) {
      newFetcher.restToHandler = () => fn(this.restToHandler!());
    }
    if (this.restErrorHandler) {
      newFetcher.restErrorHandler = this.restErrorHandler;
    }

    return newFetcher;
  }

  /**
   * Execute the HTTP request and process the response
   *
   * @returns A promise of a tuple containing the result and any validation errors
   *
   * @example
   * ```typescript
   * const [user, errors] = await fetcher.run();
   * if (errors) {
   *   console.error('Validation errors:', errors);
   * } else {
   *   console.log('User:', user);
   * }
   * ```
   */
  async run(): Promise<[To, ValidationError | undefined]> {
    try {
      const response = await this.fetch(this.input, this.init);

      const status = response.status as TResult['code'];
      const triplet = this.handlers.get(status);

      if (triplet != null) {
        const [handler, schema, extractor] = triplet;
        const clone = response.clone();
        try {
          const body = await extractor(response);

          try {
            if (schema) {
              const parsedResult = this.parser(schema, body);
              if (parsedResult.success === false) {
                return [
                  handler(body),
                  new ValidationError(
                    `Validation failed: ${parsedResult.error.message}`,
                    body,
                    schema,
                    parsedResult.error
                  ),
                ];
              }
              return [
                handler(parsedResult.data as Data<TResult, TResult['code']>),
                undefined,
              ];
            }

            return [handler(body), undefined];
          } catch (error) {
            return Promise.reject(
              new ParsingError(
                `Handler execution failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                body,
                handler.name || 'anonymous',
                error
              )
            );
          }
        } catch (jsonError) {
          const responseText = await clone.text();
          return Promise.reject(
            new JsonDeserializationError(
              `Could not deserialize response JSON: ${
                jsonError instanceof Error
                  ? jsonError.message
                  : String(jsonError)
              }`,
              response,
              responseText,
              jsonError
            )
          );
        }
      }

      if (this.restErrorHandler != null) {
        return Promise.reject(this.restErrorHandler(response));
      }

      if (this.restToHandler != null) {
        return [this.restToHandler(), undefined];
      }

      return Promise.reject(new HandlerNotSetError(status));
    } catch (error) {
      if (error instanceof FetcherError) {
        return Promise.reject(error);
      }
      return Promise.reject(
        new NetworkError(
          `Network request failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          this.input,
          this.init,
          error
        )
      );
    }
  }

  /**
   * Execute the HTTP request and safely process the response
   *
   * Returns a SafeResult type that represents success or failure
   * without throwing exceptions.
   *
   * @returns A promise that resolves to a SafeResult containing
   *          either the data or an error
   *
   * @example
   * ```typescript
   * const result = await fetcher.safeRun();
   *
   * if (result.status === 'ok') {
   *   const data = result.data;
   *   // Handle successful case with validated data
   * } else {
   *   // Handle any error case
   *   console.error(result.error);
   * }
   * ```
   */
  async safeRun(): Promise<SafeResult<To>> {
    try {
      const [data, validationError] = await this.run();

      if (validationError) {
        return err(validationError);
      }

      return ok(data);
    } catch (error) {
      return err(
        error instanceof Error ? error : new FetcherError(String(error))
      );
    }
  }
}

/**
 * Default parser for Zod schemas
 *
 * @param schema The Zod schema to validate against
 * @param value The value to validate
 * @returns A parsed result with either the validated data or an error
 */
const defaultParser = <T extends z.ZodType<any>>(
  schema: T,
  value: unknown
): ParsedResult<z.infer<T>> => {
  const result = schema.safeParse(value);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: new Error(result.error.message),
  };
};
