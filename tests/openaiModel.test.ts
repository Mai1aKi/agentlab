import { describe, expect, it } from 'vitest';
import { OpenAiCompatibleModel } from '../src/agent/openaiModel';
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
