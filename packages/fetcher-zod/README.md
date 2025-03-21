# @lonli-lokli/fetcher-zod

A type-safe HTTP client for TypeScript using Zod for runtime validation.

[![npm version](https://img.shields.io/npm/v/@lonli-lokli/fetcher-zod.svg)](https://www.npmjs.com/package/@lonli-lokli/fetcher-zod)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔒 **Type-safe**: Full end-to-end type safety from HTTP responses to your application code
- ✅ **Runtime validation**: Validate API responses against Zod schemas
- 🧩 **Composable**: Handle different status codes with different data shapes
- 🔄 **Transformable**: Transform API responses into the shape your application needs
- 🌐 **Cross-platform**: Works in Node.js, browsers, and React Native

## Installation

```bash
npm install @lonli-lokli/fetcher-zod
# or
yarn add @lonli-lokli/fetcher-zod
# or
pnpm add @lonli-lokli/fetcher-zod
```

> Note: zod is a peer dependency and must be installed separately.

## Basic Usage

```typescript
import { ZodFetcher, Result } from '@lonli-lokli/fetcher-zod';
import { z } from 'zod';

// Define your API response types
type ApiResponses = 
  | Result<200, { data: string[] }>
  | Result<400, { error: string }>;

// Create schemas for validation
const successSchema = z.object({ data: z.array(z.string()) });
const errorSchema = z.object({ error: z.string() });

// Create a fetcher instance
const fetcher = new ZodFetcher<ApiResponses, string[]>(
  'https://api.example.com/data',
  { 
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  }
)
  // Handle 200 responses
  .handle(200, 
    response => response.data, // Extract the data array
    successSchema // Validate with Zod schema
  )
  // Handle 400 responses
  .handle(400, 
    response => [], // Return empty array on error
    errorSchema
  )
  // Handle any other status codes
  .discardRestAsError(response => 
    new Error(`Unexpected status code: ${response.status}`)
  );

// Execute the request
const [data, validationError] = await fetcher.run();
if (validationError) {
  console.error('Validation error:', validationError);
} else {
  console.log('Data:', data); // string[]
}
```

## Advanced Usage

### Custom Extractors

```typescript
import { ZodFetcher, Result, textExtractor } from '@lonli-lokli/fetcher-zod';
import { z } from 'zod';

type ApiResponses = 
  | Result<200, string>
  | Result<404, { message: string }>;

const fetcher = new ZodFetcher<ApiResponses, string>(
  'https://api.example.com/text',
  { method: 'GET' }
)
  // Use textExtractor for plain text responses
  .handle(200, 
    text => text.toUpperCase(), 
    z.string(),
    textExtractor
  )
  // Use default JSON extractor for JSON responses
  .handle(404, 
    error => `Error: ${error.message}`,
    z.object({ message: z.string() })
  );

const [result] = await fetcher.run();
```

### Transforming Results

```typescript
import { ZodFetcher, Result } from '@lonli-lokli/fetcher-zod';
import { z } from 'zod';

type User = { id: number; name: string; email: string };
type ApiResponses = Result<200, User[]> | Result<500, { message: string }>;

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

const fetcher = new ZodFetcher<ApiResponses, User[]>(
  'https://api.example.com/users',
  { method: 'GET' }
)
  .handle(200, users => users, z.array(userSchema))
  .handle(500, error => {
    console.error(error.message);
    return [];
  }, z.object({ message: z.string() }));

// Get only user names
const userNamesFetcher = fetcher.map(users => 
  users.map(user => user.name)
);

const [userNames] = await userNamesFetcher.run(); // string[]
```

### Custom Error Handling

```typescript
import { 
  ZodFetcher, 
  Result, 
  ValidationError, 
  JsonDeserializationError, 
  HandlerNotSetError,
  NetworkError,
  ParsingError
} from '@lonli-lokli/fetcher-zod';
import { z } from 'zod';

type ApiResponses = Result<200, { data: string }>;

const fetcher = new ZodFetcher<ApiResponses, string>(
  'https://api.example.com/data',
  { method: 'GET' }
)
  .handle(200, response => response.data, z.object({ data: z.string() }))
  .discardRestAsError(response => {
    if (response.status === 404) {
      return new Error('Resource not found');
    }
    if (response.status >= 500) {
      return new Error('Server error');
    }
    return new Error(`Unexpected status: ${response.status}`);
  });

try {
  const [data] = await fetcher.run();
  console.log('Success:', data);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Schema validation failed:', error.message);
    console.error('Invalid value:', error.value);
    console.error('Expected schema:', error.schema);
    console.error('Validation details:', error.validationError.message);
  } else if (error instanceof JsonDeserializationError) {
    console.error('Failed to parse JSON response:', error.message);
    console.error('Raw response:', error.responseText);
  } else if (error instanceof HandlerNotSetError) {
    console.error(`No handler for status code ${error.code}`);
  } else if (error instanceof NetworkError) {
    console.error('Network request failed:', error.message);
    console.error('Request details:', {
      url: error.request,
      options: error.requestInit
    });
  } else if (error instanceof ParsingError) {
    console.error('Error processing response data:', error.message);
    console.error('Raw data:', error.rawData);
    console.error('Handler name:', error.handlerName);
  } else {
    console.error('Error:', error.message);
  }
}
```

### Error Handling with Offline Detection

```typescript
import { 
  ZodFetcher, 
  NetworkError 
} from '@lonli-lokli/fetcher-zod';

async function fetchWithOfflineDetection<T>(
  url: string, 
  options: RequestInit = {}
): Promise<T | null> {
  const result = await new ZodFetcher<{ code: 200; payload: T }, T>(url, options)
    .handle(200, data => data)
    .safeRun();
  
  if (result.status === 'error') {
    if (result.error instanceof NetworkError) {
      // Handle offline state
      const isOffline = !navigator.onLine;
      if (isOffline) {
        console.log('Device is offline. Please check your connection.');
        // Maybe update UI to show offline state
        // Or queue request for later when back online
      } else {
        console.error('Network request failed despite being online:', result.error.message);
      }
    }
    return null;
  }
  
  return result.data;
}
```

### Comprehensive SafeRun Example

```typescript
import { 
  ZodFetcher, 
  ValidationError, 
  JsonDeserializationError, 
  HandlerNotSetError,
  NetworkError,
  ParsingError
} from '@lonli-lokli/fetcher-zod';
import { z } from 'zod';

// Define your API response types
type ApiResponse =
  | { code: 200; payload: User }
  | { code: 400; payload: ErrorResponse }
  | { code: 404; payload: null };

// Define your data types and schemas
type User = { id: number; name: string; email: string };
type ErrorResponse = { message: string; code: string };

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

const ErrorResponseSchema = z.object({
  message: z.string(),
  code: z.string(),
});

async function fetchUserSafely(userId: number) {
  const result = await new ZodFetcher<ApiResponse, User | string | null>(
    `/api/users/${userId}`,
    { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }
  )
    .handle(200, user => user, UserSchema)
    .handle(400, error => `Error: ${error.message} (${error.code})`, ErrorResponseSchema)
    .handle(404, () => null)
    // Handle any other status code with a custom error
    .discardRestAsError(response => 
      new Error(`Unexpected status code: ${response.status}`)
    )
    .safeRun();

  // Handle all possible outcomes
  if (result.status === 'ok') {
    if (result.data === null) {
      console.log('User not found');
      return null;
    } else if (typeof result.data === 'string') {
      console.log('Request error:', result.data);
      return null;
    } else {
      console.log('User found:', result.data);
      return result.data;
    }
  } else {
    // Type-specific error handling
    if (result.error instanceof ValidationError) {
      console.error('Response validation failed:', result.error.message);
      // You can access the original validation error
      const originalError = result.error.validationError;
      console.error('Validation details:', originalError.message);
    } else if (result.error instanceof JsonDeserializationError) {
      console.error('Failed to parse JSON response:', result.error.message);
    } else if (result.error instanceof HandlerNotSetError) {
      console.error(`No handler defined for status code: ${result.error.message}`);
    } else if (result.error instanceof NetworkError) {
      console.error('Network connection failed:', result.error.message);
      // Handle offline state or retry logic
    } else if (result.error instanceof ParsingError) {
      console.error('Error processing response data:', result.error.message);
      // Handle data processing errors
    } else {
      console.error('Request failed:', result.error.message);
    }
    return null;
  }
}

// Usage
const user = await fetchUserSafely(123);
```

## API Reference

### `ZodFetcher<TResult, To>`

The main class for creating type-safe HTTP requests.

#### Constructor

```typescript
constructor(
  input: RequestInfo,
  init?: RequestInit,
  parser?: <T extends z.ZodType<any>>(schema: T, value: unknown) => ParsedResult<z.infer<T>>,
  fetch?: typeof fetch
)
```

#### Methods

- **`handle<Code>(code, handler, schema?, extractor?)`**: Register a handler for a specific status code
- **`discardRestAsError(handler)`**: Handle all unhandled status codes by throwing an error
- **`discardRestAsTo(handler)`**: Handle all unhandled status codes by returning a default value
- **`map<B>(fn)`**: Transform the result of this fetcher to a new type
- **`run()`**: Execute the HTTP request and process the response

## License

MIT
