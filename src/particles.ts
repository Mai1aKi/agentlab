// Ambient background particles — deliberately restrained.
// A slow starfield of faint zinc dots with hair-thin links between
// near neighbours. It should make the console feel alive, never busy:
// no colors, no glow, low alpha, gentle speed. Honors
// prefers-reduced-motion with a single static frame.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
}

export const LINK_DISTANCE = 110;

export function createParticles(
  count: number,
  width: number,
  height: number,
  rand: () => number = Math.random,
): Particle[] {
  return Array.from({ length: count }, () => ({
    x: rand() * width,
    y: rand() * height,
    vx: (rand() - 0.5) * 0.22,
    vy: (rand() - 0.5) * 0.22,
    r: 0.6 + rand() * 1.1,
    a: 0.08 + rand() * 0.2,
  }));
}

/** Advance one frame; particles wrap around the edges. */
export function stepParticles(particles: Particle[], width: number, height: number): void {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -4) p.x = width + 4;
    else if (p.x > width + 4) p.x = -4;
    if (p.y < -4) p.y = height + 4;
    else if (p.y > height + 4) p.y = -4;
  }
}

export function initParticles(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let particles: Particle[] = [];

  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(72, Math.max(18, Math.floor((w * h) / 32000)));
    particles = createParticles(count, w, h);
  };
  resize();
  window.addEventListener('resize', resize);

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DISTANCE * LINK_DISTANCE) {
          const alpha = (1 - Math.sqrt(d2) / LINK_DISTANCE) * 0.04;
          ctx.strokeStyle = `rgba(205, 205, 220, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(238, 238, 244, ${p.a.toFixed(3)})`;
      ctx.fill();
    }
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    draw();
    return;
  }

  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
  });
  const tick = () => {
    if (running) {
      stepParticles(particles, w, h);
      draw();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
