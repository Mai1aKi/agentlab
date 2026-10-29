// The agent runtime: a ReAct-style loop around a pluggable model.
//
//   user message
//     → model decides: final text, or one/more tool calls
//     → runtime executes the tool(s) in order, feeds the results back
//     → repeat until final text or maxSteps
//
// Every step is recorded as a TraceEvent — that trace is the product:
// it is what the UI visualizes and what tests assert against.

import { ToolRegistry } from './tools';
import type { ChatModel, Message, TraceEvent } from './types';

export interface AgentOptions {
  maxSteps?: number;
  systemPrompt?: string;
}

export interface RunResult {
  finalText: string;
  trace: TraceEvent[];
  steps: number;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are an agent in AgentLab. Use the available tools when they help, ' +
  'then answer the user in Chinese. You may request several tool calls in one turn; ' +
  'they will be executed in order and all results fed back together.';

export class Agent {
  private messages: Message[] = [];
  private readonly maxSteps: number;
  private readonly systemPrompt: string;

  constructor(
    private readonly model: ChatModel,
    private readonly registry: ToolRegistry,
    options: AgentOptions = {},
  ) {
    this.maxSteps = options.maxSteps ?? 8;
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.messages.push({ role: 'system', content: this.systemPrompt });
  }

  get history(): readonly Message[] {
    return this.messages;
  }

  async run(
    userText: string,
    onEvent?: (event: TraceEvent) => void,
  ): Promise<RunResult> {
    const trace: TraceEvent[] = [];
    const emit = (event: TraceEvent) => {
      trace.push(event);
      onEvent?.(event);
    };

    this.messages.push({ role: 'user', content: userText });
    emit({ type: 'user', content: userText });

    for (let step = 1; step <= this.maxSteps; step++) {
      const reply = await this.model.complete(this.messages, this.registry.listSpecs());
      emit({ type: 'modelReply', step, reply });

      if (reply.type === 'text') {
        this.messages.push({ role: 'assistant', content: reply.content });
        emit({ type: 'final', content: reply.content });
        return { finalText: reply.content, trace, steps: step };
      }

      // Tool call(s): one turn may carry several calls. Record them as a
      // single assistant message, execute sequentially in order, and feed
      // every result back before the model speaks again.
      const calls = reply.type === 'toolCalls' ? reply.calls : [reply.call];
      this.messages.push({
        role: 'assistant',
        content: '',
        toolCall: calls[0],
        toolCalls: calls,
      });
      for (const call of calls) {
        const outcome = await this.registry.execute(call);
        this.messages.push({
          role: 'tool',
          content: outcome.result,
          toolCallId: call.id,
          toolName: call.name,
        });
        emit({
          type: 'toolResult',
          call,
          result: outcome.result,
          isError: outcome.isError,
        });
      }
    }

    const reason = `达到最大步数 ${this.maxSteps}，已停止。`;
    emit({ type: 'stopped', reason });
    return { finalText: reason, trace, steps: this.maxSteps };
  }
}
