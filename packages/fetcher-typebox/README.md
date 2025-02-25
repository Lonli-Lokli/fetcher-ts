# TypeBox Fetcher

A strongly-typed fetch wrapper for TypeScript applications with runtime validation using TypeBox.

[![npm version](https://img.shields.io/npm/v/@lonli-lokli/fetcher-typebox.svg)](https://www.npmjs.com/package/@lonli-lokli/fetcher-typebox)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- ✅ Full TypeScript support with strict type checking
- ✅ Runtime validation of API responses using TypeBox
- ✅ Handle different response status codes with appropriate types
- ✅ Safe promise handling with `safeRun()` to avoid unhandled rejections
- ✅ Customizable response extraction (JSON, text, headers, etc.)
- ✅ Elegant chain-based API for defining response handlers
- ✅ Compatible with standard `fetch`

## Installation

```bash
npm install typebox-fetcher
# or
yarn add typebox-fetcher
# or
pnpm add typebox-fetcher
```

> Note: @sinclair/typebox is a peer dependency and must be installed separately.

## Usage

### Basic Example

```typescript
import { Type } from '@sinclair/typebox';
import { TypeboxFetcher } from '@lonli-lokli/fetcher-typebox';

// Define your API response types
type ApiResponse =
  | { code: 200; payload: { name: string; age: number } }
  | { code: 400; payload: string };

// Define TypeBox schema for validation
const UserSchema = Type.Object({
  name: Type.String(),
  age: Type.Number(),
});

// Make the request
const [result, errors] = await new TypeboxFetcher<ApiResponse, string>(
  '/api/user/123'
)
  .handle(200, (user) => `Hello, ${user.name}!`, UserSchema)
  .handle(400, (errorMessage) => `Error: ${errorMessage}`)
  .run();

// Handle the result
if (errors) {
  console.error('Validation errors:', errors);
} else {
  console.log(result); // Either "Hello, Name!" or "Error: Something went wrong"
}
```

### Safe Run with Error Handling

```typescript
import { Type } from '@sinclair/typebox';
import { TypeboxFetcher } from '@lonli-lokli/fetcher-typebox';

// Define your API response types
type ApiResponse =
  | { code: 200; payload: { name: string; age: number } }
  | { code: 400; payload: string };

// Define TypeBox schema for validation
const UserSchema = Type.Object({
  name: Type.String(),
  age: Type.Number(),
});

// Make the request with safe error handling
const result = await new TypeboxFetcher<ApiResponse, string>(
  '/api/user/123'
)
  .handle(200, (user) => `Hello, ${user.name}!`, UserSchema)
  .handle(400, (errorMessage) => `Error: ${errorMessage}`)
  .safeRun();

// Handle the result safely without try/catch
if (result.status === 'ok') {
  console.log(result.data); // "Hello, Name!" 
} else {
  console.error('Request failed:', result.error);
}
```

### Advanced Usage

```typescript
import { Type } from '@sinclair/typebox';
import { TypeboxFetcher, jsonExtractor, textExtractor } from '@lonli-lokli/fetcher-typebox';

// Define your API response types
type ApiResponse =
  | { code: 200; payload: User }
  | { code: 400; payload: string }
  | { code: 401; payload: string }
  | { code: 404; payload: string | null };

// Define your data types and schemas
type User = { id: number; name: string; email: string };
const UserSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  email: Type.String({ format: 'email' }),
});

// Custom request options
const requestOptions = {
  method: 'GET',
  headers: {
    Authorization: 'Bearer token123',
    'Content-Type': 'application/json',
  },
};

// Create a fetcher with multiple handlers
const fetcher = new TypeboxFetcher<ApiResponse, User>(
  '/api/users/1',
  requestOptions
)
  .handle(200, (user) => user, UserSchema)
  .handle(400, (message) => { throw new Error(`Bad request: ${message}`); })
  .handle(401, (message) => { throw new Error(`Authentication required: ${message}`); })
  .handle(
    404,
    () => { throw new Error('User not found'); },
    undefined,
    async (response) => {
      // Custom extractor that gets an error ID from headers
      const errorId = response.headers.get('x-error-id');
      return errorId ? `Error ID: ${errorId}` : null;
    }
  )
  .discardRestAsError(
    (response) => new Error(`Unhandled status code: ${response.status}`)
  );

// Get only the user's name safely
const nameResult = await fetcher
  .mapSafe(user => user.name)
  .safeRun();

if (nameResult.status === 'ok') {
  console.log('User name:', nameResult.data);
} else {
  console.error('Failed to get user name:', nameResult.error.message);
}
```

## API Reference

### `TypeboxFetcher<TResult, To>`

The main class for making API requests with TypeBox validation.

#### Constructor

```typescript
constructor(
  protected readonly input: RequestInfo,
  protected readonly init: RequestInit | undefined,
  protected readonly parser: <T extends TSchema>(schema: T, value: unknown) => ParsedResult<Static<T>> = defaultParser,
  protected readonly fetch: Fetch = crossFetch
)
```

- `input`: The URL or Request object to fetch
- `init`: Optional fetch options (method, headers, body, etc.)
- `parser`: Optional custom parser function for TypeBox schemas
- `fetch`: Optional fetch implementation (defaults to cross-fetch)

#### Methods

##### `handle<Code, HSchema>(code, handler, codec?, extractor?)`

Register a handler for a specific HTTP status code.

- `code`: The HTTP status code to handle
- `handler`: Function to process the response data
- `codec`: Optional TypeBox schema for response validation
- `extractor`: Optional function to extract data from the response

Returns the fetcher instance for chaining.

##### `discardRestAsError(restErrorHandler)`

Handle all unhandled status codes by rejecting with an error.

- `restErrorHandler`: Function that converts Response to an Error

##### `discardRestAsTo(restToHandler)`

Handle all unhandled status codes by returning a default value.

- `restToHandler`: Function that returns a default value

##### `run()`

Execute the fetch request and process the response.

Returns a Promise of a tuple containing:

- The processed result
- Validation errors (if any)

May throw exceptions for network errors or unhandled status codes.

##### `safeRun()`

Execute the fetch request and safely process the response without throwing exceptions.

Returns a Promise of a `SafeResult<To>`:

```typescript
type SafeResult<T> = OkResult<T> | ErrorResult;

type OkResult<T> = {
  readonly status: 'ok';
  readonly data: T;
};

type ErrorResult = {
  readonly status: 'error';
  readonly error: Error;
};
```

##### `mapSafe<B>(fn: (a: To) => B)`

Transform the result of this fetcher while maintaining safe error handling.

- `fn`: Transformation function for the successful result
- Returns a new TypeboxFetcher that transforms the successful result

### SafeResult Types

#### `SafeResult<T>`

A union type representing either a successful result or an error.

```typescript
type SafeResult<T> = OkResult<T> | ErrorResult;
```

#### `OkResult<T>`

Represents a successful operation with data.

```typescript
type OkResult<T> = {
  readonly status: 'ok';
  readonly data: T;
};
```

#### `ErrorResult`

Represents a failed operation with an error.

```typescript
type ErrorResult = {
  readonly status: 'error';
  readonly error: Error;
};
```

### Utility Functions

#### Helper Functions

- `ok<T>(data: T)`: Creates an OkResult with the provided data
- `err(error: Error)`: Creates an ErrorResult with the provided error

#### Extractors

- `defaultExtractor`: Extracts JSON if Content-Type is application/json, otherwise extracts text
- `jsonExtractor`: Always extracts JSON from the response
- `textExtractor`: Always extracts text from the response

#### Error Classes

- `HandlerNotSetError`: Thrown when no handler is registered for a status code
- `JsonDeserializationError`: Thrown when JSON deserialization fails
- `ValidationError`: Represents validation failures from TypeBox

## License

MIT
