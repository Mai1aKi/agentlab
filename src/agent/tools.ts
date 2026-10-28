// Tool registry: tools are described once (spec for the model) and
// executed through a single validated path (args checked before run).

import type { ToolCall, ToolSpec } from './types';

export interface Tool {
  spec: ToolSpec;
  run: (args: Record<string, unknown>) => string | Promise<string>;
}

export interface ToolOutcome {
  result: string;
  isError: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): this {
    if (this.tools.has(tool.spec.name)) {
      throw new Error(`Tool "${tool.spec.name}" is already registered`);
    }
    this.tools.set(tool.spec.name, tool);
    return this;
  }

  listSpecs(): ToolSpec[] {
    return [...this.tools.values()].map((t) => t.spec);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Execute one call. Never throws: failures come back as error results,
   *  so the model can see what went wrong and react — like real runtimes. */
  async execute(call: ToolCall): Promise<ToolOutcome> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return { result: `Error: unknown tool "${call.name}"`, isError: true };
    }
    const validationError = validateArgs(tool.spec, call.args);
    if (validationError) {
      return { result: `Error: ${validationError}`, isError: true };
    }
    try {
      const result = await tool.run(call.args);
      return { result: String(result), isError: false };
    } catch (e) {
      return { result: `Error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    }
  }
}

function validateArgs(spec: ToolSpec, args: Record<string, unknown>): string | null {
  for (const [param, typeDecl] of Object.entries(spec.parameters)) {
    const optional = typeDecl.endsWith('?');
    const type = optional ? typeDecl.slice(0, -1) : typeDecl;
    const value = args[param];
    if (value === undefined || value === null) {
      if (!optional) return `tool "${spec.name}" is missing required argument "${param}"`;
      continue;
    }
    if (type === 'string' && typeof value !== 'string') {
      return `argument "${param}" of tool "${spec.name}" must be a string`;
    }
    if (type === 'number' && typeof value !== 'number') {
      return `argument "${param}" of tool "${spec.name}" must be a number`;
    }
    if (type === 'boolean' && typeof value !== 'boolean') {
      return `argument "${param}" of tool "${spec.name}" must be a boolean`;
    }
  }
  return null;
}
