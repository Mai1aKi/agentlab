import { describe, expect, it } from 'vitest';
import { createParticles, stepParticles, type Particle } from '../src/particles';

describe('particles', () => {
  it('creates the requested number within bounds and speed limits', () => {
    const ps = createParticles(40, 800, 600, () => 0.5);
    expect(ps).toHaveLength(40);
    for (const p of ps) {
      expect(p.x).toBe(400);
      expect(p.y).toBe(300);
      expect(Math.abs(p.vx)).toBeLessThanOrEqual(0.11);
      expect(Math.abs(p.vy)).toBeLessThanOrEqual(0.11);
      expect(p.r).toBeGreaterThanOrEqual(0.6);
      expect(p.a).toBeGreaterThanOrEqual(0.08);
      expect(p.a).toBeLessThanOrEqual(0.28);
    }
  });

  it('steps positions by velocity', () => {
    const p: Particle = { x: 10, y: 10, vx: 0.2, vy: -0.1, r: 1, a: 0.2 };
    stepParticles([p], 800, 600);
    expect(p.x).toBeCloseTo(10.2);
    expect(p.y).toBeCloseTo(9.9);
  });

  it('wraps particles around the edges', () => {
    const p: Particle = { x: 803, y: -3, vx: 0.2, vy: -0.2, r: 1, a: 0.2 };
    p.x = 800 + 4.5;
    p.y = -4.5;
    stepParticles([p], 800, 600);
    expect(p.x).toBe(-4);
    expect(p.y).toBe(600 + 4);
  });
});
