import { z } from 'zod';
import { ZodFetcher } from './fetcher-zod.js';
import { 
  ValidationError, 
  JsonDeserializationError, 
  NetworkError, 
  ParsingError
} from './errors.js';
import { describe, it, expect, vi } from 'vitest';

describe('ZodFetcher suite', () => {
  it('should handle simple 200 response with text data', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 200 })
    );

    const [res, errs] = await new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (_) => _, z.string())
      .run();

    expect(res).toStrictEqual('foo');
    expect(errs).toBeUndefined();
  });

  it('should handle simple 200 response with JSON data', async () => {
    type TestData = { foo: string; baz: number };
    const ZTestData = z.object({ foo: z.string(), baz: z.number() });
    type TestMethod = { code: 200; payload: TestData };
    const TEST_DATA = { foo: 'bar', baz: 42 };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(JSON.stringify(TEST_DATA), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    const [res, errs] = await new ZodFetcher<TestMethod, TestData>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (_) => _, ZTestData)
      .run();

    expect(res).toStrictEqual(TEST_DATA);
    expect(errs).toBeUndefined();
  });

  it('should handle simple 400 response', async () => {
    type TestMethod =
      | { code: 200; payload: number }
      | { code: 400; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('fooo', { status: 400 })
    );

    const [res, errs] = await new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (n) => n.toFixed(), z.number())
      .handle(400, (_) => _)
      .run();

    expect(res).toStrictEqual('fooo');
    expect(errs).toBeUndefined();
  });

  it('should validate incorrectly shaped responses', async () => {
    type TestData = { foo: string; baz: number };
    const TestDataSchema = z.object({ foo: z.string(), baz: z.number() });
    type TestMethod = { code: 200; payload: TestData };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(JSON.stringify({ foo: 'bar', baz: '42' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    const [_res, errs] = await new ZodFetcher<TestMethod, TestData>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (_) => _, TestDataSchema)
      .run();

    expect(errs).toBeDefined();
    expect(errs).toBeInstanceOf(ValidationError);
    expect(errs?.value).toBeDefined();
    expect(errs?.schema).toBeDefined();
    expect(errs?.validationError).toBeDefined();
  });

  it('should get data from headers via passed extractor', async () => {
    type TestMethod =
      | { code: 200; payload: number }
      | { code: 400; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(null, { status: 400, headers: { 'x-payload': 'fooo' } })
    );

    const [res, errs] = await new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (n) => n.toString(), z.number())
      .handle(
        400,
        (_) => _,
        z.string(),
        async (r) => r.headers.get('x-payload') || 'NOT FOUND'
      )
      .run();

    expect(res).toStrictEqual('fooo');
    expect(errs).toBeUndefined();
  });

  it('should handle multiple handlers from README', async () => {
    type ApiResponse =
      | { code: 200; payload: User }
      | { code: 400; payload: string }
      | { code: 401; payload: string }
      | { code: 404; payload: string | null };

    type User = { id: number; name: string; email: string };
    const UserSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    });

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('testcode', { status: 400, headers: { 'x-payload': 'fooo' } })
    );

    // Custom request options
    const requestOptions = {
      method: 'GET',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
    };

    const [res, errs] = await new ZodFetcher<ApiResponse, string>(
      '',
      requestOptions,
      undefined,
      fetchMock
    )
      .handle(
        200,
        (user) => `User found: ${user.name} (${user.email})`,
        UserSchema
      )
      .handle(400, (message) => `Bad request: ${message}`)
      .handle(401, (message) => `Authentication required: ${message}`)
      .handle(
        404,
        () => 'User not found',
        undefined,
        async (response) => {
          // Custom extractor that gets an error ID from headers
          const errorId = response.headers.get('x-error-id');
          return errorId ? `Error ID: ${errorId}` : null;
        }
      )
      .discardRestAsError(
        (response) => new Error(`Unhandled status code: ${response.status}`)
      )
      .run();

    expect(res).toStrictEqual('Bad request: testcode');
    expect(errs).toBeUndefined();
  });

  it('should handle discardRestAsTo', async () => {
    type TestMethod =
      | { code: 200; payload: number }
      | { code: 400; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(null, { status: 500 })
    );

    const [res, errs] = await new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (n) => n.toString(), z.number())
      .handle(400, (_) => _)
      .discardRestAsTo(() => 'fallback value')
      .run();

    expect(res).toStrictEqual('fallback value');
    expect(errs).toBeUndefined();
  });

  it('should throw HandlerNotSetError when no handler matches', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('error', { status: 500 })
    );

    const fetcher = new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(200, (_) => _, z.string());

    await expect(fetcher.run()).rejects.toThrow('No handler registered for status code 500');
  });

  it('should handle map transformation', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 200 })
    );

    const fetcher = new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(200, (_) => _, z.string());

    const mappedFetcher = fetcher.map(str => str.toUpperCase());
    
    const [res, errs] = await mappedFetcher.run();

    expect(res).toStrictEqual('FOO');
    expect(errs).toBeUndefined();
  });

  it('should handle map transformation with multiple handlers', async () => {
    type TestMethod = 
      | { code: 200; payload: string }
      | { code: 400; payload: number };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 200 })
    );

    const fetcher = new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, str => `Success: ${str}`, z.string())
      .handle(400, num => `Error: ${num}`, z.number());

    const mappedFetcher = fetcher.map(result => result.length);
    
    const [res, errs] = await mappedFetcher.run();

    expect(res).toStrictEqual(`Success: foo`.length);
    expect(errs).toBeUndefined();
  });

  it('should handle map transformation with discardRestAsTo', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 500 })
    );

    const fetcher = new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, str => str, z.string())
      .discardRestAsTo(() => 'fallback');

    const mappedFetcher = fetcher.map(str => str.toUpperCase());
    
    const [res, errs] = await mappedFetcher.run();

    expect(res).toStrictEqual('FALLBACK');
    expect(errs).toBeUndefined();
  });

  it('should handle JSON deserialization errors', async () => {
    type TestMethod = { code: 200; payload: { foo: string } };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('invalid json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    const fetcher = new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(200, (data) => data.foo, z.object({ foo: z.string() }));

    await expect(fetcher.run()).rejects.toThrow(JsonDeserializationError);
    const error = await fetcher.run().catch(e => e);
    expect(error.response).toBeDefined();
    expect(error.responseText).toBe('invalid json');
    expect(error.cause).toBeDefined();
  });

  it('should handle handler side errors', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 200 })
    );

    const fetcher = new ZodFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(
      200,
      () => {
        throw new Error('Handler error');
      },
      z.string()
    );

    await expect(fetcher.run()).rejects.toThrow(ParsingError);
    const error = await fetcher.run().catch(e => e);
    expect(error.rawData).toBe('foo');
    expect(error.handlerName).toBeDefined();
    expect(error.cause).toBeDefined();
  });

  it('should handle fetch errors', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) => {
        throw new Error('Network error');
      }
    );

    const fetcher = new ZodFetcher<TestMethod, string>(
      '',
      {},
      undefined,
      fetchMock
    ).handle(200, (_) => _, z.string());

    await expect(fetcher.run()).rejects.toThrow(NetworkError);
    const error = await fetcher.run().catch(e => e);
    expect(error.request).toBeDefined();
    expect(error.requestInit).toBeDefined();
    expect(error.cause).toBeDefined();
  });
});