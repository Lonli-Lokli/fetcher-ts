// Errors and extractors
/**
 * Base error class for all fetcher errors
 */
export class FetcherError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'FetcherError';
  }
}

/**
 * Error thrown when no handler is registered for a status code
 */
export class HandlerNotSetError extends FetcherError {
  constructor(public readonly code: number) {
    super(`No handler registered for status code ${code}`);
    this.name = 'HandlerNotSetError';
  }
}

/**
 * Error thrown when JSON deserialization fails
 */
export class JsonDeserializationError extends FetcherError {
  constructor(
    message: string,
    public readonly response: Response,
    public readonly responseText: string,
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'JsonDeserializationError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends FetcherError {
  constructor(
    message: string,
    public readonly value: unknown,
    public readonly schema: unknown,
    public readonly validationError: Error,
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when network operations fail
 */
export class NetworkError extends FetcherError {
  constructor(
    message: string,
    public readonly request: RequestInfo,
    public readonly requestInit: RequestInit | undefined,
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when handler execution fails
 */
export class ParsingError extends FetcherError {
  constructor(
    message: string,
    public readonly rawData: unknown,
    public readonly handlerName: string,
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'ParsingError';
  }
}
  
