import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { setupCanvas } from "./render/canvas.js";
import { drawGrid, drawHud, drawShip, interpolateShip } from "./render/draw.js";
import { wrapPosition } from "./sim/arena.js";
import { createShip, integrate } from "./sim/ship.js";

const canvas = document.getElementById("game");
const { ctx, size } = setupCanvas(canvas);
const input = createInput(window);

let currentShip = createShip(size.width / 2, size.height / 2);
let previousShip = { ...currentShip };

function simulate(dt) {
  previousShip = { ...currentShip };
  const next = integrate(currentShip, input, dt);
  currentShip = wrapPosition(next, size.width, size.height);
  input.consumeJustPressed();
}

function render(alpha, stats) {
  ctx.clearRect(0, 0, size.width, size.height);
  drawGrid(ctx, size.width, size.height);

  const interpolated = interpolateShip(previousShip, currentShip, alpha, size.width, size.height);
  drawShip(ctx, interpolated);
  drawHud(ctx, stats);
}

const loop = createLoop({
  step: 1 / 60,
  simulate,
  render,
});

loop.start();
