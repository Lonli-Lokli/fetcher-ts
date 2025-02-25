import { fetch as crossFetch } from 'cross-fetch';
import { TypeCheck, TypeCompiler } from '@sinclair/typebox/compiler';
import { Static, TSchema } from '@sinclair/typebox';
import { Value as TypeValue } from '@sinclair/typebox/value';

type Fetch = typeof fetch;

export type Result<Code extends number, A> = { code: Code; payload: A };

export type Extractor<TResult, Code extends number> = (
  response: Response
) => Promise<Data<TResult, Code>>;

type Handled<T, Code extends number> = T extends Result<infer C, infer D>
  ? C extends Code
    ? never
    : Result<C, D>
  : never;

export type Data<T, Code extends number> = T extends Result<infer C, infer D>
  ? C extends Code
    ? D
    : never
  : never;

type StrictSchema<
  T extends TSchema,
  TResult extends Result<any, any>,
  TCode extends number
> = Static<T> extends Data<TResult, TCode> ? T : never;

type HandlersMap<TResult extends Result<any, any>, To> = Map<
  TResult['code'],
  [
    (data: Data<TResult, TResult['code']>) => To,
    StrictSchema<TSchema, TResult, TResult['code']> | undefined,
    Extractor<TResult, TResult['code']>
  ]
>;

export const defaultExtractor = (response: Response) => {
  const contentType = response.headers.get('content-type');

  return contentType?.includes('application/json')
    ? response.json()
    : response.text();
};

export type ValidationResult<T> = [T, Error[] | undefined];

export interface Validator<T> {
  decode(data: unknown): ValidationResult<T>;
}

export const jsonExtractor = (response: Response) => response.json();

export const textExtractor = (response: Response) => response.text();

/**
 * A type-safe HTTP client with TypeBox validation
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
 * const fetcher = new TypeboxFetcher<ApiResponse, string>('/api/users/1')
 *   .handle(200, user => `Found: ${user.name}`, UserSchema)
 *   .handle(400, error => `Error: ${error}`)
 *   .handle(404, () => 'Not found')
 *   .run();
 * ```
 */
export class TypeboxFetcher<TResult extends Result<any, any>, To> {
  private readonly handlers: HandlersMap<TResult, To> = new Map();
  private restToHandler?: () => To = void 0;
  private restErrorHandler?: (response: Response) => Error = void 0;

  /**
   * Creates a new TypeboxFetcher instance
   * 
   * @param input The URL or Request object to fetch
   * @param init Optional fetch init options
   * @param parser Custom parser function (defaults to TypeBox validation)
   * @param fetch Custom fetch implementation (defaults to cross-fetch)
   * 
   * @example
   * ```typescript
   * const fetcher = new TypeboxFetcher<ApiResponse, User>(
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
    protected readonly parser: <T extends TSchema>(
      schema: T,
      value: unknown
    ) => ParsedResult<Static<T>> = defaultParser,
    protected readonly fetch: Fetch = crossFetch
  ) {}

  /**
   * Register a handler for a specific status code
   *
   * @template Code The HTTP status code to handle
   * @template HSchema The TypeBox schema type
   * @param code The HTTP status code
   * @param handler Function to process the response data
   * @param schema Optional TypeBox schema for validation
   * @param extractor Optional custom response extractor
   * @returns A new TypeboxFetcher with the handler registered
   * 
   * @example
   * ```typescript
   * fetcher.handle(200, 
   *   user => `User: ${user.name}`,
   *   Type.Object({
   *     id: Type.Number(),
   *     name: Type.String(),
   *     email: Type.String({ format: 'email' })
   *   })
   * )
   * ```
   */
  handle<Code extends TResult['code'], HSchema extends TSchema>(
    code: Code,
    handler: (data: Data<TResult, Code>) => To,
    schema?: StrictSchema<HSchema, TResult, Code>,
    extractor: Extractor<TResult, Code> = defaultExtractor
  ): TypeboxFetcher<Handled<TResult, Code>, To> {
    this.handlers.set(code, [handler, schema, extractor]);

    return unsafeCoerce(this);
  }

  /**
   * Handle all unhandled response statuses by throwing a custom error
   *
   * @param restErrorHandler Function that returns an Error for unhandled status codes
   * @returns A new TypeboxFetcher with all status codes handled
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
  ): TypeboxFetcher<Handled<TResult, never>, To> {
    this.restErrorHandler = restErrorHandler;

    return unsafeCoerce(this);
  }

  /**
   * Handle all unhandled response statuses by returning a default value
   *
   * @param restToHandler Function that returns a default value for unhandled status codes
   * @returns A new TypeboxFetcher with all status codes handled
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
  ): TypeboxFetcher<Handled<TResult, never>, To> {
    this.restToHandler = restToHandler;

    return unsafeCoerce(this);
  }

  /**
   * Transform the result of this fetcher
   * 
   * @template B The new return type
   * @param fn Transformation function
   * @returns A new TypeboxFetcher with transformed output
   * 
   * @example
   * ```typescript
   * const userFetcher = fetcher.handle(200, user => user, UserSchema);
   * const nameFetcher = userFetcher.map(user => user.name);
   * // nameFetcher.run() will return a string (the user's name)
   * ```
   */
  map<B>(fn: (a: To) => B): TypeboxFetcher<TResult, B> {
    const newFetcher = new TypeboxFetcher<TResult, B>(
      this.input,
      this.init,
      this.parser,
      this.fetch
    );
    
    // Copy handlers with transformed output
    for (const [code, [handler, schema, extractor]] of this.handlers.entries()) {
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
  async run(): Promise<[To, Error | undefined]> {
    try {
      const response = await this.fetch(this.input, this.init);

      const status = response.status as TResult['code'];
      const triplet = this.handlers.get(status);

      if (triplet != null) {
        const [handler, schema, extractor] = triplet;

        try {
          const body = await extractor(response);

          try {
            if (schema) {
              const parsedResult = this.parser(schema, body);
              if (parsedResult.success === false) {
                return [handler(body), parsedResult.error];
              }
              return [
                handler(parsedResult.data as Data<TResult, TResult['code']>),
                undefined,
              ];
            }

            return [handler(body), undefined];
          } catch (error) {
            return Promise.reject(
              new Error(`Handler side error, details: ${error}`)
            );
          }
        } catch (jsonError) {
          return Promise.reject(
            new JsonDeserializationError(
              `Could not deserialize response JSON, details: ${jsonError}`
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
      return Promise.reject(error);
    }
  }
}

const compiledSchemas = new Map<TSchema, TypeCheck<TSchema>>();

type ParsedResult<T> =
  | { success: true; data: T }
  | { success: false; error: Error };

/**
 * Default parser for TypeBox schemas
 * 
 * @param schema The TypeBox schema to validate against
 * @param value The value to validate
 * @returns A parsed result with either the validated data or an error
 */
const defaultParser = <T extends TSchema>(
  schema: T,
  value: unknown
): ParsedResult<Static<T>> => {
  const compiledSchema =
    (compiledSchemas.get(schema) as TypeCheck<T> | undefined) ??
    TypeCompiler.Compile(schema);
  if (!compiledSchemas.has(schema)) {
    compiledSchemas.set(schema, compiledSchema as any);
  }

  if (compiledSchema.Check(value)) {
    return {
      success: true,
      data: TypeValue.Cast({ ...schema, additionalProperties: false }, value),
    };
  }
  const firstError = compiledSchema.Errors(value).First();
  return {
    success: false,
    error: new Error(
      `Error at ${firstError?.path}: ${firstError?.message}, got ${value}`
    ),
  };
};

// Errors and extractors
/**
 * Error thrown when no handler is registered for a status code
 */
export class HandlerNotSetError extends Error {
  constructor(code: number) {
    super(`No handler registered for status code ${code}`);
    this.name = 'HandlerNotSetError';
  }
}

/**
 * Error thrown when JSON deserialization fails
 */
export class JsonDeserializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonDeserializationError';
  }
}

function identity<A>(a: A): A {
  return a;
}

const unsafeCoerce: <A, B>(a: A) => B = identity as any;
