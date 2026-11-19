import { Vector2 } from "./vector.js";

export class HomingBehavior {
  constructor({ targetKind = "ship", speed = 420, turnRate = 4 } = {}) {
    this.targetKind = targetKind;
    this.speed = speed;
    this.turnRate = turnRate;
  }

  update(entity, world, dt) {
    if (!world) return;

    const target = [...world.ofKind(this.targetKind)]
      .filter((candidate) => candidate.id !== entity.id)
      .sort((a, b) => distanceSquared(entity.pos, a.pos) - distanceSquared(entity.pos, b.pos))[0];

    if (!target) return;

    const dx = shortestDelta(entity.pos.x, target.pos.x, world.bounds.width);
    const dy = shortestDelta(entity.pos.y, target.pos.y, world.bounds.height);
    const desiredAngle = Math.atan2(dy, dx);
    const angleDelta = normalizeAngle(desiredAngle - entity.angle);
    const maxTurn = this.turnRate * dt;

    entity.angle += Math.max(-maxTurn, Math.min(maxTurn, angleDelta));
    entity.vel = Vector2.fromAngle(entity.angle, this.speed);
  }
}

function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function shortestDelta(from, to, extent) {
  let delta = to - from;
  if (extent > 0 && delta > extent / 2) delta -= extent;
  if (extent > 0 && delta < -extent / 2) delta += extent;
  return delta;
}

function normalizeAngle(angle) {
  return ((((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}
