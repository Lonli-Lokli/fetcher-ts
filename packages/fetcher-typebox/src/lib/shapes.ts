import { Static, TSchema } from '@sinclair/typebox';
import crossFetch from 'cross-fetch';
import { FetcherError, ValidationError } from './errors.js';

export type SafeResult<T> = OkResult<T> | ErrorResult;

export type OkResult<T> = {
  readonly status: 'ok';
  readonly data: T;
};

export type ErrorResult = {
  readonly status: 'error';
  readonly error: FetcherError;
};

export type Fetch = typeof crossFetch;

export type Result<Code extends number, A> = { code: Code; payload: A };

export type Extractor<TResult, Code extends number> = (
  response: Response
) => Promise<Data<TResult, Code>>;

export type Handled<T, Code extends number> = T extends Result<infer C, infer D>
  ? C extends Code
    ? never
    : Result<C, D>
  : never;

export type Data<T, Code extends number> = T extends Result<infer C, infer D>
  ? C extends Code
    ? D
    : never
  : never;

export type StrictSchema<
  T extends TSchema,
  TResult extends Result<any, any>,
  TCode extends number
> = Static<T> extends Data<TResult, TCode> ? T : never;

export type HandlersMap<TResult extends Result<any, any>, To> = Map<
  TResult['code'],
  [
    (data: Data<TResult, TResult['code']>) => To,
    StrictSchema<TSchema, TResult, TResult['code']> | undefined,
    Extractor<TResult, TResult['code']>
  ]
>;

export type ValidationResult<T> = [T, Error[] | undefined];

export interface Validator<T> {
  decode(data: unknown): ValidationResult<T>;
}

export type ParsedResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };
