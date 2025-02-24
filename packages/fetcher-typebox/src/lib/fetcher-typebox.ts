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

export class TypeboxFetcher<TResult extends Result<any, any>, To> {
  private readonly handlers: HandlersMap<TResult, To> = new Map();
  private restToHandler?: () => To = void 0;
  private restErrorHandler?: (response: Response) => Error = void 0;

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
   * Register a handler for given code
   *
   * @template Code Type-level HTTP code literal – optional, inferrable
   * @param {Code} code HTTP code. Must be present in `TResult` sum type parameter of @see Fetcher
   * @param {(data: Data<TResult, Code>) => To} handler Handler for the given code
   * @param {io.Type<Data<TResult, Code>>} [codec] Optional codec for `To` type, used for validation
   * @returns {Fetcher<Handled<TResult, Code>, To>} A fetcher will `code` being handled
   * (so it's not possible to register another handler for it)
   * @memberof Fetcher
   */
  handle<Code extends TResult['code'], HSchema extends TSchema>(
    code: Code,
    handler: (data: Data<TResult, Code>) => To,
    codec?: StrictSchema<HSchema, TResult, Code>,
    extractor: Extractor<TResult, Code> = defaultExtractor
  ): TypeboxFetcher<Handled<TResult, Code>, To> {
    this.handlers.set(code, [handler, codec, extractor]);

    return unsafeCoerce(this);
  }

  /**
   * Handle all not handled explicitly response statuses using a provided fallback error thunk
   *
   * @param {(Response) => Error} restHandler Thunk of a `Error` type. Will be called if no suitable handles are found
   * for the response status code
   * @returns {Fetcher<Handled<TResult, never>, To>} Fetcher with ALL status codes being handled.
   * Note that you won't be able to add any additional handlers to the chain after a call to this method!
   * @memberof Fetcher
   */
  discardRestAsError(
    restErrorHandler: (r: Response) => Error
  ): TypeboxFetcher<Handled<TResult, never>, To> {
    this.restErrorHandler = restErrorHandler;

    return unsafeCoerce(this);
  }

  /**
   * Handle all not handled explicitly response statuses using a provided fallback thunk
   *
   * @param {() => To} restHandler Thunk of a `To` type. Will be called if no suitable handles are found
   * for the response status code
   * @returns {Fetcher<Handled<TResult, never>, To>} Fetcher with ALL status codes being handled.
   * Note that you won't be able to add any additional handlers to the chain after a call to this method!
   * @memberof Fetcher
   */
  discardRestAsTo(
    restToHandler: () => To
  ): TypeboxFetcher<Handled<TResult, never>, To> {
    this.restToHandler = restToHandler;

    return unsafeCoerce(this);
  }

  /**
   * Actually performs @external fetch request and executes and suitable handlers.
   *
   * @returns {Promise<[To, Option<io.Errors>]>} A promise of a pair of result and possible validation errors
   * @memberof Fetcher
   */
  async run(): Promise<[To, Error | undefined]> {
    try {
      const response = await this.fetch(this.input, this.init);

      const status = response.status as TResult['code'];
      const triplet = this.handlers.get(status);

      if (triplet != null) {
        const [handler, codec, extractor] = triplet;

        try {
          const body = await extractor(response);

          try {
            if (codec) {
              const parsedResult = this.parser(codec, body);
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
