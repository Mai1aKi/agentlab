// BYOK model: talks to any OpenAI-compatible /chat/completions endpoint
// with function calling. The API key is supplied by the UI and only ever
// lives in the user's browser — it is never stored in this repository.

import type { ChatModel, Message, ModelReply, ToolSpec } from './types';

export interface OpenAiModelOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: string;
  content: string | null;
  tool_calls?: OpenAiToolCall[];
}

export class OpenAiCompatibleModel implements ChatModel {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenAiModelOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.modelId = options.model;
    this.name = `byok:${options.model}`;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async complete(messages: Message[], tools: ToolSpec[]): Promise<ModelReply> {
    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: messages.map(toOpenAiMessage),
        tools: tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: {
              type: 'object',
              properties: Object.fromEntries(
                Object.entries(t.parameters).map(([param, type]) => [
                  param,
                  { type: type.replace('?', '') },
                ]),
              ),
              required: Object.entries(t.parameters)
                .filter(([, type]) => !type.endsWith('?'))
                .map(([param]) => param),
            },
          },
        })),
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`Model API error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: { message: OpenAiMessage }[];
    };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('Model API returned no choices');

    const rawCalls = message.tool_calls ?? [];
    if (rawCalls.length > 0) {
      const calls = rawCalls.map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }
        return { id: tc.id, name: tc.function.name, args };
      });
      // One call keeps the classic shape; several become a toolCalls reply.
      return calls.length === 1
        ? { type: 'toolCall', call: calls[0] }
        : { type: 'toolCalls', calls };
    }
    return { type: 'text', content: message.content ?? '' };
  }
}

function toOpenAiMessage(m: Message): Record<string, unknown> {
  const batch = m.toolCalls ?? (m.toolCall ? [m.toolCall] : []);
  if (m.role === 'assistant' && batch.length > 0) {
    return {
      role: 'assistant',
      content: '',
      tool_calls: batch.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
  }
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
  }
  return { role: m.role, content: m.content };
}
