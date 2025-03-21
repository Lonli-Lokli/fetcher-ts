import { ValueError } from "@sinclair/typebox/errors";

export class FetcherError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message, { cause });
    this.name = 'FetcherError';
  }
}

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
    public readonly responseText?: string,
    cause?: Error
  ) {
    super(`${message}${responseText ? `\nResponse text: ${responseText}` : ''}`, cause);
    this.name = 'JsonDeserializationError';
  }
}

export class ValidationError extends FetcherError {
  constructor(
    public readonly value: unknown,
    public readonly validationError: ValueError | undefined,
    public readonly schema?: unknown
  ) {
    super(
      `Validation failed: ${validationError?.message ?? 'Unknown error'}\n` +
      `Received value: ${JSON.stringify(value, null, 2)}\n` +
      (schema ? `Schema: ${JSON.stringify(schema, null, 2)}` : '')
    );
    this.name = 'ValidationError';
  }
}

export class NetworkError extends FetcherError {
  constructor(
    message: string,
    public readonly request: RequestInfo,
    public readonly requestInit?: RequestInit,
    cause?: Error
  ) {
    super(
      `${message}\n` +
      `Request URL: ${typeof request === 'string' ? request : request.url}\n` +
      (requestInit ? `Request options: ${JSON.stringify(requestInit, null, 2)}` : ''),
      cause
    );
    this.name = 'NetworkError';
  }
}

export class ParsingError extends FetcherError {
  constructor(
    message: string,
    public readonly rawData: unknown,
    public readonly handlerName: string,
    cause?: Error
  ) {
    super(
      `${message}\n` +
      `Handler: ${handlerName}\n` +
      `Raw data: ${JSON.stringify(rawData, null, 2)}`,
      cause
    );
    this.name = 'ParsingError';
  }
}
