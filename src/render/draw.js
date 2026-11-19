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

  ctx.fillStyle = ship.color ?? "#4cc9f0";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawEntity(ctx, entity, alpha, width, height, sprites = null) {
  if (entity.kind === "explosion") {
    drawExplosion(ctx, entity);
    return;
  }

  const position = interpolateShip(
    {
      x: entity.previousPos.x,
      y: entity.previousPos.y,
      angle: entity.previousAngle,
      thrust: entity.thrust,
    },
    {
      x: entity.pos.x,
      y: entity.pos.y,
      angle: entity.angle,
      thrust: entity.thrust,
    },
    alpha,
    width,
    height,
  );

  if (entity.kind === "ship") {
    if (sprites) drawSpriteShip(ctx, sprites, position);
    else drawShip(ctx, { ...position, color: entity.team === "player" ? "#4cc9f0" : "#ff5d73" });
  } else if (entity.kind === "asteroid") {
    if (sprites) drawSpriteAsteroid(ctx, sprites, entity, position);
    else drawAsteroid(ctx, entity, position);
  } else if (entity.kind === "bullet") {
    if (sprites) drawSpriteBullet(ctx, sprites, entity, position);
    else drawBullet(ctx, entity, position);
  } else if (entity.kind === "pickup") {
    if (sprites) drawSpritePickup(ctx, sprites, position);
    else drawPickup(ctx, entity, position);
  }
}

function drawSprite(ctx, sprites, sourceX, position, sourceWidth = 64, sourceHeight = 64) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle ?? 0);
  ctx.drawImage(sprites, sourceX, 0, sourceWidth, sourceHeight, -32, -32, 64, 64);
  ctx.restore();
}

function drawSpriteShip(ctx, sprites, position) {
  drawSprite(ctx, sprites, 0, position);
}

function drawSpriteAsteroid(ctx, sprites, _asteroid, position) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);
  ctx.drawImage(sprites, 64, 0, 64, 64, -32, -32, 64, 64);
  ctx.restore();
}

function drawSpriteBullet(ctx, sprites, bullet, position) {
  drawSprite(ctx, sprites, 128, { ...position, angle: bullet.angle });
}

function drawSpritePickup(ctx, sprites, position) {
  drawSprite(ctx, sprites, 192, position);
}

function drawAsteroid(ctx, asteroid, position) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.rotate(position.angle);
  ctx.beginPath();
  asteroid.vertices.forEach((vertex, index) => {
    const x = Math.cos(vertex.angle) * vertex.radius;
    const y = Math.sin(vertex.angle) * vertex.radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "#303849";
  ctx.strokeStyle = asteroid.components.has("homing") ? "#ff8c42" : "#91a0b7";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBullet(ctx, bullet, position) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.fillStyle = bullet.homing ? "#c77dff" : bullet.ownerTeam === "player" ? "#ffe66d" : "#ff6b81";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPickup(ctx, pickup, position) {
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.strokeStyle = pickup.effect === "shield" ? "#62e6a7" : "#ffe66d";
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pickup.effect === "shield" ? "S" : "R", 0, 0);
  ctx.restore();
}

function drawExplosion(ctx, explosion) {
  ctx.save();
  for (const particle of explosion.particles) {
    if (particle.ttl <= 0) continue;
    ctx.globalAlpha = Math.min(1, particle.ttl / 0.25);
    ctx.fillStyle = "#ffb347";
    ctx.beginPath();
    ctx.arc(
      explosion.pos.x + particle.offset.x,
      explosion.pos.y + particle.offset.y,
      2 + particle.ttl * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

export function drawHud(ctx, stats, gameState = null) {
  ctx.save();
  ctx.fillStyle = "rgba(11, 14, 20, 0.75)";
  ctx.fillRect(12, 12, gameState ? 270 : 185, gameState ? 174 : 76);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "13px monospace";
  ctx.fillText(`steps/s:  ${stats.stepsPerSec}`, 22, 34);
  ctx.fillText(`frames/s: ${stats.framesPerSec}`, 22, 54);
  ctx.fillText(`frame ms: ${stats.frameTime.toFixed(2)}`, 22, 74);

  if (gameState) {
    const playerStatus = gameState.player
      ? `HP: ${gameState.player.hp}/${gameState.player.maxHp}`
      : `RESPAWN: ${gameState.respawnRemaining.toFixed(1)}s`;
    ctx.fillText(`score:    ${gameState.score}`, 22, 98);
    ctx.fillText(playerStatus, 22, 118);
    if (gameState.player?.shieldTime > 0) {
      ctx.fillText(`shield:   ${gameState.player.shieldTime.toFixed(1)}s`, 22, 138);
    } else if (gameState.player?.rapidFireTime > 0) {
      ctx.fillText(`rapid:    ${gameState.player.rapidFireTime.toFixed(1)}s`, 22, 138);
    } else {
      ctx.fillText("WASD/Arrows • Space fire", 22, 138);
    }
    ctx.fillText(gameState.message || "Shift+Space: homing shot", 22, 158);
  }

  ctx.restore();
}
