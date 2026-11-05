import { describe, expect, it } from 'vitest';
import { OpenAiCompatibleModel, parseStreamLine } from '../src/agent/openaiModel';
import type { Message, ToolSpec } from '../src/agent/types';

const TOOLS: ToolSpec[] = [
  { name: 'calculator', description: 'math', parameters: { expression: 'string' } },
];

function fakeFetch(payload: unknown, ok = true, status = 200): typeof fetch {
  return (async () =>
    ({
      ok,
      status,
      json: async () => payload,
    }) as Response) as typeof fetch;
}

describe('OpenAiCompatibleModel', () => {
  it('maps a tool_calls response into a toolCall reply', async () => {
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: fakeFetch({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_9',
                  type: 'function',
                  function: { name: 'calculator', arguments: '{"expression":"2+2"}' },
                },
              ],
            },
          },
        ],
      }),
    });
    const messages: Message[] = [{ role: 'user', content: '计算 2+2' }];
    const reply = await model.complete(messages, TOOLS);
    expect(reply).toEqual({
      type: 'toolCall',
      call: { id: 'call_9', name: 'calculator', args: { expression: '2+2' } },
    });
  });

  it('maps multiple tool_calls into a toolCalls reply', async () => {
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: fakeFetch({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'calculator', arguments: '{"expression":"1+1"}' },
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: { name: 'clock', arguments: '{}' },
                },
              ],
            },
          },
        ],
      }),
    });
    const reply = await model.complete([{ role: 'user', content: '计算并报时' }], TOOLS);
    expect(reply).toEqual({
      type: 'toolCalls',
      calls: [
        { id: 'call_1', name: 'calculator', args: { expression: '1+1' } },
        { id: 'call_2', name: 'clock', args: {} },
      ],
    });
  });

  it('maps plain content into a text reply', async () => {
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: fakeFetch({
        choices: [{ message: { role: 'assistant', content: '你好！' } }],
      }),
    });
    const reply = await model.complete([{ role: 'user', content: 'hi' }], TOOLS);
    expect(reply).toEqual({ type: 'text', content: '你好！' });
  });

  it('sends tools in OpenAI function format', async () => {
    let sentBody: Record<string, unknown> | null = null;
    const capturingFetch = (async (_url: unknown, init: { body: string }) => {
      sentBody = JSON.parse(init.body) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
      } as Response;
    }) as unknown as typeof fetch;

    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1/',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: capturingFetch,
    });
    await model.complete([{ role: 'user', content: 'hi' }], TOOLS);
    const tools = (sentBody as unknown as { tools: { function: { name: string } }[] }).tools;
    expect(tools[0].function.name).toBe('calculator');
  });

  it('default fetch is bound (browser fetch rejects a foreign receiver)', async () => {
    // Simulate the browser constraint: native fetch throws
    // "Illegal invocation" unless its receiver is the global object.
    const strictFetch = function (this: unknown) {
      if (this !== globalThis && this !== undefined) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
      } as Response);
    };
    const original = globalThis.fetch;
    globalThis.fetch = strictFetch as unknown as typeof fetch;
    try {
      const model = new OpenAiCompatibleModel({
        baseUrl: 'https://example.test/v1',
        apiKey: 'sk-test',
        model: 'demo',
        // no fetchFn: the default path is what is under test
      });
      const reply = await model.complete([{ role: 'user', content: 'hi' }], TOOLS);
      expect(reply).toEqual({ type: 'text', content: 'ok' });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('retries on 503 and succeeds when the provider recovers', async () => {
    let calls = 0;
    const flakyFetch = (async () => {
      calls++;
      if (calls < 3) {
        return {
          ok: false,
          status: 503,
          json: async () => ({}),
          text: async () => 'high demand',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'recovered' } }] }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: flakyFetch,
      retryDelayMs: 1,
    });
    const reply = await model.complete([{ role: 'user', content: 'hi' }], TOOLS);
    expect(reply).toEqual({ type: 'text', content: 'recovered' });
    expect(calls).toBe(3);
  });

  it('gives up after 3 attempts on persistent 503', async () => {
    let calls = 0;
    const downFetch = (async () => {
      calls++;
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
        text: async () => 'still down',
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: downFetch,
      retryDelayMs: 1,
    });
    await expect(model.complete([{ role: 'user', content: 'hi' }], TOOLS)).rejects.toThrowError(
      /HTTP 503 — still down/,
    );
    expect(calls).toBe(3);
  });

  it('includes the provider error body in the thrown error', async () => {
    const bodyFetch = (async () =>
      ({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => '{"error":{"message":"models/nope is not found"}}',
      }) as unknown as Response) as typeof fetch;
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'nope',
      fetchFn: bodyFetch,
    });
    await expect(model.complete([{ role: 'user', content: 'hi' }], TOOLS)).rejects.toThrowError(
      /HTTP 404 — .*models\/nope is not found/,
    );
  });

  it('throws on HTTP errors', async () => {
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'bad',
      model: 'demo',
      fetchFn: fakeFetch({}, false, 401),
    });
    await expect(model.complete([{ role: 'user', content: 'hi' }], TOOLS)).rejects.toThrowError(
      /HTTP 401/,
    );
  });
});

describe('streaming (Day 8)', () => {
  /** A fetch stub whose response body streams the given text chunks —
   *  chunk boundaries deliberately need not align with SSE lines. */
  function sseFetch(chunks: string[], capture?: (init: { body: string }) => void): typeof fetch {
    return (async (_url: unknown, init: { body: string }) => {
      capture?.(init);
      const encoder = new TextEncoder();
      let i = 0;
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () =>
              i < chunks.length
                ? { done: false, value: encoder.encode(chunks[i++]) }
                : { done: true, value: undefined },
          }),
        },
        json: async () => ({}),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n`;

  it('parseStreamLine extracts content and tool-call fragments, ignores noise', () => {
    expect(parseStreamLine(sse({ choices: [{ delta: { content: '你' } }] }))).toEqual({
      content: '你',
    });
    expect(
      parseStreamLine(
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'c1', function: { name: 'clock', arguments: '{' } },
                ],
              },
            },
          ],
        }),
      ),
    ).toEqual({ toolCalls: [{ index: 0, id: 'c1', name: 'clock', arguments: '{' }] });
    expect(parseStreamLine('data: [DONE]')).toBeNull();
    expect(parseStreamLine('')).toBeNull();
    expect(parseStreamLine(sse({ choices: [{ delta: { role: 'assistant' } }] }))).toBeNull();
    expect(parseStreamLine('data: {oops')).toBeNull();
  });

  it('streams text per-word: deltas fire in order and the reply is the joined text', async () => {
    let sentBody: Record<string, unknown> | null = null;
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: sseFetch(
        [
          // first line split across two network chunks
          sse({ choices: [{ delta: { role: 'assistant' } }] }) +
            sse({ choices: [{ delta: { content: '你好' } }] }).slice(0, 20),
          sse({ choices: [{ delta: { content: '你好' } }] }).slice(20) +
            sse({ choices: [{ delta: { content: '，世界' } }] }),
          'data: [DONE]\n',
        ],
        (init) => {
          sentBody = JSON.parse(init.body) as Record<string, unknown>;
        },
      ),
    });
    const deltas: string[] = [];
    const reply = await model.complete([{ role: 'user', content: 'hi' }], TOOLS, (d) =>
      deltas.push(d),
    );
    expect(deltas).toEqual(['你好', '，世界']);
    expect(reply).toEqual({ type: 'text', content: '你好，世界' });
    expect((sentBody as unknown as { stream: boolean }).stream).toBe(true);
  });

  it('assembles streamed tool-call argument fragments by index', async () => {
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: sseFetch([
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_7', function: { name: 'calculator', arguments: '{"expr' } },
                ],
              },
            },
          ],
        }),
        sse({
          choices: [
            { delta: { tool_calls: [{ index: 0, function: { arguments: 'ession":"2+2"}' } }] } },
          ],
        }),
        'data: [DONE]\n',
      ]),
    });
    const reply = await model.complete([{ role: 'user', content: '计算 2+2' }], TOOLS, () => {});
    expect(reply).toEqual({
      type: 'toolCall',
      call: { id: 'call_7', name: 'calculator', args: { expression: '2+2' } },
    });
  });

  it('without a delta callback it stays one-shot (no stream flag)', async () => {
    let sentBody: Record<string, unknown> | null = null;
    const capturingFetch = (async (_url: unknown, init: { body: string }) => {
      sentBody = JSON.parse(init.body) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
      } as Response;
    }) as unknown as typeof fetch;
    const model = new OpenAiCompatibleModel({
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-test',
      model: 'demo',
      fetchFn: capturingFetch,
    });
    await model.complete([{ role: 'user', content: 'hi' }], TOOLS);
    expect((sentBody as unknown as { stream: boolean }).stream).toBe(false);
  });
});
