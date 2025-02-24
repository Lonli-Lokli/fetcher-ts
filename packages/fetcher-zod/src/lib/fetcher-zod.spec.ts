import { z } from 'zod';
import { ZodFetcher } from './fetcher-zod.js';
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
    const ZTestData = z.object({ foo: z.string(), baz: z.number() });
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
      .handle(200, (_) => _, ZTestData)
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
        new Response(null, { status: 400, headers: { 'x-payload': 'fooo' } })
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
      '/api/users/1',
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

    expect(res).toStrictEqual('fooo');
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

});