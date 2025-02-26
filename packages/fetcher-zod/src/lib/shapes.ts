import crossFetch from 'cross-fetch';
import { FetcherError } from './errors.js';
import { z } from 'zod';

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
  T extends z.ZodType<any>,
  TResult extends Result<any, any>,
  TCode extends number
> = z.infer<T> extends Data<TResult, TCode> ? T : never;

export type HandlersMap<TResult extends Result<any, any>, To> = Map<
  TResult['code'],
  [
    (data: Data<TResult, TResult['code']>) => To,
    StrictSchema<z.ZodType<any>, TResult, TResult['code']> | undefined,
    Extractor<TResult, TResult['code']>
  ]
>;

export type ValidationResult<T> = [T, Error[] | undefined];

export interface Validator<T> {
  decode(data: unknown): ValidationResult<T>;
}

export type ParsedResult<T> =
  | { success: true; data: T }
  | { success: false; error: Error };
