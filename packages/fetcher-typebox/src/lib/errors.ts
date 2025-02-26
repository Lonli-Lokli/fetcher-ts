export class FetcherError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = 'FetcherError';
  }
}
export class HandlerNotSetError extends FetcherError {
  constructor(code: number) {
    super(`No handler registered for status code ${code}`);
    this.name = 'HandlerNotSetError';
  }
}

/**
 * Error thrown when JSON deserialization fails
 */
export class JsonDeserializationError extends FetcherError {
  constructor(message: string) {
    super(message);
    this.name = 'JsonDeserializationError';
  }
}

export class ValidationError extends FetcherError {
  constructor(public readonly validationErrors: Error) {
    super(`Validation failed: ${validationErrors.message}`);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends FetcherError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'NetworkError';
  }
}
export class ParsingError extends FetcherError {
  constructor(message: string) {
    super(message);
    this.name = 'ParsingError';
  }
}
