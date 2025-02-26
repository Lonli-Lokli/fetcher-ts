import {
  FetcherError,
  ValidationError,
  NetworkError,
  ParsingError,
} from './errors.js';
import { OkResult, ErrorResult } from './shapes.js';

export function isFetcherError(error: unknown): error is FetcherError {
  return error instanceof FetcherError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isParsingError(error: unknown): error is ParsingError {
  return error instanceof ParsingError;
}

// Renamed helper functions
export const ok = <T>(data: T): OkResult<T> => ({
  status: 'ok',
  data,
});

export const err = (error: FetcherError): ErrorResult => ({
  status: 'error',
  error,
});



export const jsonExtractor = (response: Response) => response.json();

export const textExtractor = (response: Response) => response.text();

export function identity<A>(a: A): A {
  return a;
}

export const unsafeCoerce: <A, B>(a: A) => B = identity as any;
