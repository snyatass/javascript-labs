export function createLoop({ step = 1 / 60, simulate, render }) {
  let rafId = null;
  let running = false;
  let accumulator = 0;
  let lastTime = 0;

  let statsTimer = 0;
  let stepCount = 0;
  let frameCount = 0;
  const stats = {
    stepsPerSec: 0,
    framesPerSec: 0,
    frameTime: 0,
  };

  function frame(now) {
    if (!running) return;

    const rawDelta = (now - lastTime) / 1000;
    lastTime = now;

    const clampedDelta = Math.min(rawDelta, 0.25);
    accumulator += clampedDelta;

    const frameStart = performance.now();

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      stepCount++;
    }

    const alpha = accumulator / step;
    render(alpha, stats);

    stats.frameTime = performance.now() - frameStart;
    frameCount++;

    statsTimer += rawDelta;
    if (statsTimer >= 1) {
      stats.stepsPerSec = Math.round(stepCount / statsTimer);
      stats.framesPerSec = Math.round(frameCount / statsTimer);
      stepCount = 0;
      frameCount = 0;
      statsTimer = 0;
    }

    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      accumulator = 0;
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
