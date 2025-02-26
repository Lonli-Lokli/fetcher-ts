
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
  

  
export class FetcherError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'FetcherError';
    }
  }
  
  export class ValidationError extends FetcherError {
    constructor(public readonly validationErrors: Error) {
      super(`Validation failed: ${validationErrors.message}`);
      this.name = 'ValidationError';
    }
  }
  
  export class NetworkError extends FetcherError {
    constructor(message: string) {
      super(message);
      this.name = 'NetworkError';
    }
  }
  export class ParsingError extends FetcherError {
    constructor(message: string) {
      super(message);
      this.name = 'ParsingError';
    }
  }
  
