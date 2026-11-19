import { Explosion } from "./explosion.js";

export function circleCollision(a, b, width = 0, height = 0) {
  if (!a.alive || !b.alive || a.radius <= 0 || b.radius <= 0) return false;
  const dx = shortestDelta(a.pos.x, b.pos.x, width);
  const dy = shortestDelta(a.pos.y, b.pos.y, height);
  const radius = a.radius + b.radius;
  return dx * dx + dy * dy <= radius * radius;
}

export function detectCollisionPairs(world) {
  const entities = [...world].filter((entity) => entity.radius > 0);
  const pairs = [];

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      if (circleCollision(a, b, world.bounds.width, world.bounds.height)) pairs.push([a, b]);
    }
  }

  return pairs;
}

export function resolveCollisions(world) {
  const pairs = detectCollisionPairs(world);

  for (const [a, b] of pairs) {
    if (!a.alive || !b.alive) continue;

    if (a.kind === "bullet" || b.kind === "bullet") {
      resolveBulletHit(world, a.kind === "bullet" ? a : b, a.kind === "bullet" ? b : a);
    } else if (a.kind === "ship" && b.kind === "pickup") {
      collectPickup(world, a, b);
    } else if (a.kind === "pickup" && b.kind === "ship") {
      collectPickup(world, b, a);
    } else if (a.kind === "ship" && b.kind === "asteroid") {
      damageShip(world, a, b.damage ?? 1, b.id, b.team);
    } else if (a.kind === "asteroid" && b.kind === "ship") {
      damageShip(world, b, a.damage ?? 1, a.id, a.team);
    }
  }

  return pairs;
}

function resolveBulletHit(world, bullet, target) {
  if (target.kind !== "ship" && target.kind !== "asteroid") return;
  if (target.kind === "ship" && bullet.ownerTeam === target.team) return;

  world.despawn(bullet.id);
  const accepted = target.takeDamage(bullet.damage);
  world.emit({
    type: "entity-hit",
    entityId: target.id,
    kind: target.kind,
    killerTeam: bullet.ownerTeam,
  });
  if (!accepted || target.alive) return;

  world.spawn(new Explosion(target.pos));
  world.emit({
    type: "entity-destroyed",
    entityId: target.id,
    kind: target.kind,
    position: target.pos,
    killerTeam: bullet.ownerTeam,
  });
}

function damageShip(world, ship, damage, attackerId, attackerTeam) {
  const accepted = ship.takeDamage(damage);
  if (!accepted) return;

  world.emit({ type: "entity-hit", entityId: ship.id, kind: ship.kind, killerTeam: attackerTeam });
  if (!ship.alive) {
    world.spawn(new Explosion(ship.pos));
    world.emit({
      type: "entity-destroyed",
      entityId: ship.id,
      kind: ship.kind,
      position: ship.pos,
      attackerId,
      killerTeam: attackerTeam,
    });
  }
}

function collectPickup(world, ship, pickup) {
  ship.applyPickup(pickup.effect);
  world.despawn(pickup.id);
  world.emit({ type: "pickup-collected", effect: pickup.effect, shipId: ship.id });
}

function shortestDelta(from, to, extent) {
  let delta = to - from;
  if (extent > 0 && delta > extent / 2) delta -= extent;
  if (extent > 0 && delta < -extent / 2) delta += extent;
  return delta;
}
