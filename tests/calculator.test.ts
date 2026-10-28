import { describe, expect, it } from 'vitest';
import { evaluateExpression } from '../src/agent/builtinTools';

describe('evaluateExpression', () => {
  it('respects operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
  });

  it('handles division, modulo and decimals', () => {
    expect(evaluateExpression('10 / 4')).toBe(2.5);
    expect(evaluateExpression('7 % 3')).toBe(1);
    expect(evaluateExpression('1.5 * 2')).toBe(3);
  });

  it('handles unary minus', () => {
    expect(evaluateExpression('-3 + 5')).toBe(2);
    expect(evaluateExpression('-(2 + 3)')).toBe(-5);
  });

  it('throws on division by zero', () => {
    expect(() => evaluateExpression('1 / 0')).toThrowError(/Division by zero/);
  });

  it('throws on malformed input', () => {
    expect(() => evaluateExpression('2 +')).toThrow();
    expect(() => evaluateExpression('hello')).toThrow();
    expect(() => evaluateExpression('(1 + 2')).toThrow();
    expect(() => evaluateExpression('1 2')).toThrow();
  });
});
