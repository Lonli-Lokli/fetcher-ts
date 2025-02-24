import { fetch as crossFetch } from 'cross-fetch';
import { z } from 'zod';

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
  T extends z.ZodType<any>,
  TResult extends Result<any, any>,
  TCode extends number
> = z.infer<T> extends Data<TResult, TCode> ? T : never;

type HandlersMap<TResult extends Result<any, any>, To> = Map<
  TResult['code'],
  [
    (data: Data<TResult, TResult['code']>) => To,
    StrictSchema<z.ZodType<any>, TResult, TResult['code']> | undefined,
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

export class ZodFetcher<TResult extends Result<any, any>, To> {
  private readonly handlers: HandlersMap<TResult, To> = new Map();
  private restToHandler?: () => To = void 0;
  private restErrorHandler?: (response: Response) => Error = void 0;

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
   * Register a handler for given code
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
   * Handle all not handled explicitly response statuses using a provided fallback error thunk
   */
  discardRestAsError(
    restErrorHandler: (r: Response) => Error
  ): ZodFetcher<Handled<TResult, never>, To> {
    this.restErrorHandler = restErrorHandler;

    return unsafeCoerce(this);
  }

  /**
   * Handle all not handled explicitly response statuses using a provided fallback thunk
   */
  discardRestAsTo(
    restToHandler: () => To
  ): ZodFetcher<Handled<TResult, never>, To> {
    this.restToHandler = restToHandler;

    return unsafeCoerce(this);
  }

  /**
   * Actually performs fetch request and executes suitable handlers.
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

type ParsedResult<T> =
  | { success: true; data: T }
  | { success: false; error: Error };

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

// Errors and extractors
export class HandlerNotSetError extends Error {
  constructor(code: number) {
    super(`No handler registered for status code ${code}`);
    this.name = 'HandlerNotSetError';
  }
}

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