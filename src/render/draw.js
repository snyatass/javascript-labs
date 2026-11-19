function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function lerpWrapped(a, b, t, extent) {
  if (extent <= 0) return lerp(a, b, t);

  let diff = b - a;
  if (diff > extent / 2) diff -= extent;
  if (diff < -extent / 2) diff += extent;

  const position = a + diff * t;
  return ((position % extent) + extent) % extent;
}

export function interpolateShip(prev, curr, alpha, width, height) {
  return {
    x: lerpWrapped(prev.x, curr.x, alpha, width),
    y: lerpWrapped(prev.y, curr.y, alpha, height),
    angle: lerpAngle(prev.angle, curr.angle, alpha),
    thrust: curr.thrust,
  };
}

export function drawGrid(ctx, width, height, step = 60) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x <= width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawShip(ctx, ship) {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  if (ship.thrust) {
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-22 - Math.random() * 6, 0);
    ctx.lineTo(-12, 5);
    ctx.closePath();
    ctx.fillStyle = "#ff7b29";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-14, -11);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-14, 11);
  ctx.closePath();

  ctx.fillStyle = "#4cc9f0";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawHud(ctx, stats) {
  ctx.save();
  ctx.fillStyle = "rgba(11, 14, 20, 0.75)";
  ctx.fillRect(12, 12, 185, 76);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "13px monospace";
  ctx.fillText(`steps/s:  ${stats.stepsPerSec}`, 22, 34);
  ctx.fillText(`frames/s: ${stats.framesPerSec}`, 22, 54);
  ctx.fillText(`frame ms: ${stats.frameTime.toFixed(2)}`, 22, 74);
  ctx.restore();
}
