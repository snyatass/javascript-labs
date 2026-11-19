import { createInput } from "./input.js";
import { createLoop } from "./loop.js";
import { setupCanvas } from "./render/canvas.js";
import { drawEntity, drawGrid, drawHud } from "./render/draw.js";
import { Game } from "./sim/game.js";

const canvas = document.getElementById("game");
const { ctx, size } = setupCanvas(canvas);
const input = createInput(window);
const game = new Game(size);

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return;

  event.preventDefault();
  game.player?.fire(game.world, { homing: event.shiftKey });
});

function simulate(dt) {
  game.step(dt, input);
  input.consumeJustPressed();
}

function render(alpha, stats) {
  ctx.clearRect(0, 0, size.width, size.height);
  drawGrid(ctx, size.width, size.height);

  for (const entity of game.world) {
    drawEntity(ctx, entity, alpha, size.width, size.height);
  }

  drawHud(ctx, stats, {
    score: game.score,
    player: game.player,
    respawnRemaining: game.respawnRemaining,
    message: game.message,
  });
}

const loop = createLoop({
  step: 1 / 60,
  simulate,
  render,
});

loop.start();
