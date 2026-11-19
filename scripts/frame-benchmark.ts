import { performance } from "node:perf_hooks";
import { entityId, sequence } from "../shared/protocol.ts";
import { addNetShip, createNetWorld, stepNetWorld } from "../shared/sim.ts";

const durationSeconds = 30;
const world = createNetWorld({ width: 800, height: 600, seed: 0x1ab7 });
const inputs = new Map();
for (let i = 0; i < 8; i++) {
  const id = entityId(i + 1);
  addNetShip(world, id, `Bot ${i + 1}`);
  inputs.set(id, {
    seq: sequence(i),
    thrust: i % 2 === 0,
    left: i % 3 === 0,
    right: i % 3 !== 0,
    fire: i % 4 === 0,
    angle: 0,
  });
}

const frameTimes: number[] = [];
const started = performance.now();
while (performance.now() - started < durationSeconds * 1000) {
  const frameStart = performance.now();
  stepNetWorld(world, inputs, 1 / 30);
  frameTimes.push(performance.now() - frameStart);
  await new Promise((resolve) => setTimeout(resolve, 1000 / 60));
}

frameTimes.sort((a, b) => a - b);
const percentile = (ratio: number) =>
  frameTimes[Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * ratio))] ?? 0;
console.log(
  JSON.stringify(
    {
      durationSeconds,
      bots: 8,
      p50: percentile(0.5).toFixed(3),
      p95: percentile(0.95).toFixed(3),
      p99: percentile(0.99).toFixed(3),
      rssMiB: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
    },
    null,
    2,
  ),
);
