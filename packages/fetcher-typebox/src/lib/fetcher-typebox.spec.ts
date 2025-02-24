import { Type } from '@sinclair/typebox';
import { TypeboxFetcher } from './fetcher-typebox.js';

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

  it("should handle simple 200 response with JSON data", async () => {
    type TestData = { foo: string; baz: number };
    const TTestData = Type.Object({ foo: Type.String(), baz: Type.Number() });
    type TestMethod = { code: 200; payload: TestData };
    const TEST_DATA = { foo: "bar", baz: 42 };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(JSON.stringify(TEST_DATA), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );

    const [res, errs] = await new TypeboxFetcher<TestMethod, TestData>(
      "",
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, _ => _, TTestData)
      .run();

    expect(res).toStrictEqual(TEST_DATA);
    expect(errs).toBeUndefined();
  });

  it("should handle simple 400 response", async () => {
    type TestMethod =
      | { code: 200; payload: number }
      | { code: 400; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response("fooo", { status: 400 })
    );

    const [res, errs] = await new TypeboxFetcher<TestMethod, string>(
      "",
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (n) => n.toFixed(), Type.Number())
      .handle(400, _ => _)
      .run();

    expect(res).toStrictEqual("fooo");
    expect(errs).toBeUndefined();
  });

  it("should validate incorrectly shaped responses", async () => {
    type TestData = { foo: string; baz: number };
    const TTestData = Type.Object({ foo: Type.String(), baz: Type.Number() });
    type TestMethod = { code: 200; payload: TestData };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(JSON.stringify({ foo: "bar", baz: "42" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );

    const [_res, errs] = await new TypeboxFetcher<TestMethod, TestData>(
      "",
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, _ => _, TTestData)
      .run();

    expect(errs).toBeDefined();
  });

  it("should get data from headers via passed extractor", async () => {
    type TestMethod =
      | { code: 200; payload: number }
      | { code: 400; payload: string };

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit | undefined) =>
        new Response(null, { status: 400, headers: { "x-payload": "fooo" } })
    );

    const [res, errs] = await new TypeboxFetcher<TestMethod, string>(
      "",
      undefined,
      undefined,
      fetchMock
    )
      .handle(200, (n) => n.toString(), Type.Number())
      .handle(
        400,
        _ => _,
        Type.String(),
        async (r) => r.headers.get("x-payload") || "NOT FOUND"
      )
      .run();

    expect(res).toStrictEqual("fooo");
    expect(errs).toBeUndefined();
  });

});
