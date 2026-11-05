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
  /** Base delay between retries on 429/503, in ms. Default 900. */
  retryDelayMs?: number;
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

/** One useful piece of a streaming (SSE) response (Day 8): a fragment
 *  of text, and/or fragments of tool calls keyed by their `index`. */
export interface StreamDelta {
  content?: string;
  toolCalls?: { index: number; id?: string; name?: string; arguments?: string }[];
}

/** Parse one SSE line from a streaming chat response. Returns null for
 *  anything that carries no answer content: blank lines, the `[DONE]`
 *  sentinel, role-only opening chunks, and malformed JSON. Pure, so the
 *  streaming protocol can be unit-tested without a network or a body. */
export function parseStreamLine(line: string): StreamDelta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice('data:'.length).trim();
  if (!payload || payload === '[DONE]') return null;
  let chunk: {
    choices?: {
      delta?: {
        content?: string | null;
        tool_calls?: {
          index: number;
          id?: string;
          function?: { name?: string; arguments?: string };
        }[];
      };
    }[];
  };
  try {
    chunk = JSON.parse(payload) as typeof chunk;
  } catch {
    return null;
  }
  const delta = chunk.choices?.[0]?.delta;
  if (!delta) return null;
  const toolCalls = (delta.tool_calls ?? []).map((tc) => ({
    index: tc.index,
    id: tc.id,
    name: tc.function?.name,
    arguments: tc.function?.arguments,
  }));
  if (!delta.content && toolCalls.length === 0) return null;
  return { content: delta.content ?? undefined, toolCalls: toolCalls.length ? toolCalls : undefined };
}

export class OpenAiCompatibleModel implements ChatModel {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly fetchFn: typeof fetch;
  private readonly retryDelayMs: number;

  constructor(options: OpenAiModelOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.modelId = options.model;
    this.name = `byok:${options.model}`;
    // Bind the global fetch: stored unbound and later invoked as
    // this.fetchFn(...), a browser fetch throws "Illegal invocation"
    // because its receiver is the model instance instead of Window.
    // (Node's fetch does not care, which is why unit tests missed it —
    // there is a regression test with a receiver-strict fetch stub.)
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.retryDelayMs = options.retryDelayMs ?? 900;
  }

  async complete(
    messages: Message[],
    tools: ToolSpec[],
    onTextDelta?: (delta: string) => void,
  ): Promise<ModelReply> {
    // Day 8 · Streaming: only when the caller wants per-word display.
    // Without a callback the classic one-shot request is unchanged.
    const streaming = typeof onTextDelta === 'function';
    const requestBody = JSON.stringify({
        model: this.modelId,
        stream: streaming,
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
    });

    // Free-tier endpoints often answer 429/503 under load spikes; those
    // are transient, so retry a couple of times with growing delays
    // before surfacing the error.
    const MAX_ATTEMPTS = 3;
    let response: Response | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: requestBody,
      });
      const retryable = response.status === 429 || response.status === 503;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
    }
    if (!response) throw new Error('Model API request did not run');

    if (!response.ok) {
      // Surface the provider's own explanation — a bare "HTTP 404" does
      // not say whether the base URL, the model name, or the key is wrong,
      // and providers do say it in the body.
      let detail = '';
      try {
        detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
      } catch {
        // body unreadable — the status alone will have to do
      }
      throw new Error(`Model API error: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
    }

    if (streaming) return this.consumeStream(response, onTextDelta);

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

  /** Day 8 · Read an SSE streaming response: feed each text fragment to
   *  `onTextDelta` as it arrives, assemble tool-call fragments by index,
   *  and return the same ModelReply shapes as the one-shot path. Lines
   *  may be split across network chunks, so parsing is line-buffered;
   *  a body without a reader falls back to splitting the full text. */
  private async consumeStream(
    response: Response,
    onTextDelta: (delta: string) => void,
  ): Promise<ModelReply> {
    let content = '';
    const callsByIndex = new Map<number, { id: string; name: string; argsText: string }>();
    const handleLine = (line: string) => {
      const delta = parseStreamLine(line);
      if (!delta) return;
      if (delta.content) {
        content += delta.content;
        onTextDelta(delta.content);
      }
      for (const tc of delta.toolCalls ?? []) {
        const slot = callsByIndex.get(tc.index) ?? { id: '', name: '', argsText: '' };
        if (tc.id) slot.id = tc.id;
        if (tc.name) slot.name = tc.name;
        if (tc.arguments) slot.argsText += tc.arguments;
        callsByIndex.set(tc.index, slot);
      }
    };

    const reader = response.body?.getReader?.();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf('\n');
        while (nl >= 0) {
          handleLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf('\n');
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
    } else {
      for (const line of (await response.text()).split('\n')) handleLine(line);
    }

    if (callsByIndex.size > 0) {
      const calls = [...callsByIndex.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, slot], i) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(slot.argsText || '{}') as Record<string, unknown>;
          } catch {
            args = {};
          }
          return { id: slot.id || `call_${i + 1}`, name: slot.name, args };
        });
      return calls.length === 1
        ? { type: 'toolCall', call: calls[0] }
        : { type: 'toolCalls', calls };
    }
    return { type: 'text', content };
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
