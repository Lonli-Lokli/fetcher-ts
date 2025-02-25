import { Type } from '@sinclair/typebox';
import { TypeboxFetcher } from './fetcher-typebox.js';
import { describe, it, expect, vi } from 'vitest';

describe('TypeboxFetcher suite', () => {
  it('should handle simple 200 response with text data', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 200 })
    );

    const [res, errs] = await new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (_) => _, Type.String())
      .run();

    expect(res).toStrictEqual('foo');
    expect(errs).toBeUndefined();
  });

  it('should handle simple 200 response with JSON data', async () => {
    type TestData = { foo: string; baz: number };
    const TTestData = Type.Object({ foo: Type.String(), baz: Type.Number() });
    type TestMethod = { code: 200; payload: TestData };
    const TEST_DATA = { foo: 'bar', baz: 42 };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(JSON.stringify(TEST_DATA), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    const [res, errs] = await new TypeboxFetcher<TestMethod, TestData>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (_) => _, TTestData)
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

    const [res, errs] = await new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (n) => n.toFixed(), Type.Number())
      .handle(400, (_) => _)
      .run();

    expect(res).toStrictEqual('fooo');
    expect(errs).toBeUndefined();
  });

  it('should validate incorrectly shaped responses', async () => {
    type TestData = { foo: string; baz: number };
    const TTestData = Type.Object({ foo: Type.String(), baz: Type.Number() });
    type TestMethod = { code: 200; payload: TestData };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(JSON.stringify({ foo: 'bar', baz: '42' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    const [_res, errs] = await new TypeboxFetcher<TestMethod, TestData>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (_) => _, TTestData)
      .run();

    expect(errs).toBeDefined();
  });

  it('should get data from headers via passed extractor', async () => {
    type TestMethod =
      | { code: 200; payload: number }
      | { code: 400; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(null, { status: 400, headers: { 'x-payload': 'fooo' } })
    );

    const [res, errs] = await new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (n) => n.toString(), Type.Number())
      .handle(
        400,
        (_) => _,
        Type.String(),
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
    const UserSchema = Type.Object({
      id: Type.Number(),
      name: Type.String(),
      email: Type.String({ format: 'email' }),
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

    const [res, errs] = await new TypeboxFetcher<ApiResponse, string>(
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

    expect(res).toStrictEqual(`Bad request: testcode`);
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

    const [res, errs] = await new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (n) => n.toString(), Type.Number())
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

    const fetcher = new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(200, (_) => _, Type.String());

    await expect(fetcher.run()).rejects.toThrow(
      'No handler registered for status code 500'
    );
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

    const fetcher = new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(200, (data) => data.foo, Type.Object({ foo: Type.String() }));

    await expect(fetcher.run()).rejects.toThrow(
      'Could not deserialize response JSON'
    );
  });

  it('should handle handler side errors', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 200 })
    );

    const fetcher = new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(
      200,
      () => {
        throw new Error('Handler error');
      },
      Type.String()
    );

    await expect(fetcher.run()).rejects.toThrow('Handler side error');
  });

  it('should handle fetch errors', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) => {
        throw new Error('Network error');
      }
    );

    const fetcher = new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(200, (_) => _, Type.String());

    await expect(fetcher.run()).rejects.toThrow('Network error');
  });

  it('should handle map transformation', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 200 })
    );

    const fetcher = new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    ).handle(200, (_) => _, Type.String());

    const mappedFetcher = fetcher.map(str => str.toUpperCase());
    
    const [res, errs] = await mappedFetcher.run();

    expect(res).toStrictEqual('FOO');
    expect(errs).toBeUndefined();
  });

  it('should handle map transformation with multiple handlers', async () => {
    type TestMethod = 
      | { code: 200; payload: string }
      | { code: 400; payload: number };

    const input = 'foo';
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(input, { status: 200 })
    );

    const fetcher = new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, str => `OK: ${str}`, Type.String())
      .handle(400, num => `Error: ${num}`, Type.Number());

    const mappedFetcher = fetcher.map(result => result.length);
    
    const [res, errs] = await mappedFetcher.run();

    expect(res).toStrictEqual(`OK: ${input}`.length); // Length of "OK: foo"
    expect(errs).toBeUndefined();
  });

  it('should handle map transformation with discardRestAsTo', async () => {
    type TestMethod = { code: 200; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response('foo', { status: 500 })
    );

    const fetcher = new TypeboxFetcher<TestMethod, string>(
      '',
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, str => str, Type.String())
      .discardRestAsTo(() => 'fallback');

    const mappedFetcher = fetcher.map(str => str.toUpperCase());
    
    const [res, errs] = await mappedFetcher.run();

    expect(res).toStrictEqual('FALLBACK');
    expect(errs).toBeUndefined();
  });
});
