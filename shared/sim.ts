import { ObjectPool } from "./pool.ts";
import {
  type EntityId,
  type NetBullet,
  type NetInput,
  type NetShip,
  sequence,
} from "./protocol.ts";
import { SpatialHash } from "./spatial-hash.ts";

export interface NetWorld {
  width: number;
  height: number;
  readonly seed: number;
  tick: number;
  bullets: NetBullet[];
  ships: Map<EntityId, NetShip>;
  random: () => number;
  bulletPool: ObjectPool<NetBullet>;
  shipHash: SpatialHash<NetShip>;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNetWorld({
  width = 800,
  height = 600,
  seed = 1,
}: {
  width?: number;
  height?: number;
  seed?: number;
} = {}): NetWorld {
  const world: NetWorld = {
    width,
    height,
    seed,
    random: mulberry32(seed),
    tick: 0,
    bullets: [],
    ships: new Map(),
    bulletPool: createBulletPool(),
    shipHash: new SpatialHash<NetShip>(64),
  };
  return world;
}

export function addNetShip(world: NetWorld, id: EntityId, name = "Pilot"): NetShip {
  const index = world.ships.size;
  const ship: NetShip = {
    id,
    name,
    x: world.width * (index === 0 ? 0.35 : 0.65),
    y: world.height * 0.5,
    angle: index === 0 ? 0 : Math.PI,
    vx: 0,
    vy: 0,
    hp: 3,
    cooldown: 0,
  };
  world.ships.set(id, ship);
  return ship;
}

export function removeNetShip(world: NetWorld, id: EntityId): void {
  world.ships.delete(id);
}

export function stepNetWorld(
  world: NetWorld,
  inputs: ReadonlyMap<EntityId, NetInput>,
  dt = 1 / 30,
): NetWorld {
  world.tick++;
  for (const [id, ship] of world.ships) {
    const input = inputs.get(id) ?? {
      seq: sequenceZero(),
      thrust: false,
      left: false,
      right: false,
      fire: false,
      angle: 0,
    };
    if (input.left) ship.angle -= 3.8 * dt;
    if (input.right) ship.angle += 3.8 * dt;
    if (input.thrust) {
      ship.vx += Math.cos(ship.angle) * 520 * dt;
      ship.vy += Math.sin(ship.angle) * 520 * dt;
    }
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > 280) {
      ship.vx *= 280 / speed;
      ship.vy *= 280 / speed;
    }
    ship.vx *= 0.985 ** (dt * 30);
    ship.vy *= 0.985 ** (dt * 30);
    ship.x = wrapCoordinate(ship.x + ship.vx * dt, world.width);
    ship.y = wrapCoordinate(ship.y + ship.vy * dt, world.height);
    ship.cooldown = Math.max(0, ship.cooldown - dt);

    if (input.fire && ship.cooldown === 0) {
      ship.cooldown = 0.25;
      const bullet = world.bulletPool.acquire();
      bullet.owner = id;
      bullet.x = ship.x + Math.cos(ship.angle) * 18;
      bullet.y = ship.y + Math.sin(ship.angle) * 18;
      bullet.vx = ship.vx + Math.cos(ship.angle) * 520;
      bullet.vy = ship.vy + Math.sin(ship.angle) * 520;
      bullet.ttl = 2;
      world.bullets.push(bullet);
    }
  }

  world.shipHash.clear();
  for (const ship of world.ships.values()) {
    world.shipHash.insert(ship.x, ship.y, ship);
  }
  for (const bullet of world.bullets) {
    bullet.x = wrapCoordinate(bullet.x + bullet.vx * dt, world.width);
    bullet.y = wrapCoordinate(bullet.y + bullet.vy * dt, world.height);
    bullet.ttl -= dt;
    for (const ship of world.shipHash.nearby(bullet.x, bullet.y)) {
      if (ship.id === bullet.owner) continue;
      if (Math.hypot(ship.x - bullet.x, ship.y - bullet.y) < 18) {
        bullet.ttl = 0;
        ship.hp = Math.max(0, ship.hp - 1);
      }
    }
  }
  const alive: NetBullet[] = [];
  for (const bullet of world.bullets) {
    if (bullet.ttl > 0) alive.push(bullet);
    else world.bulletPool.release(bullet);
  }
  world.bullets = alive;
  return world;
}

function wrapCoordinate(value: number, extent: number): number {
  return ((value % extent) + extent) % extent;
}

function sequenceZero(): NetInput["seq"] {
  return sequence(0);
}

function createBulletPool(): ObjectPool<NetBullet> {
  return new ObjectPool(
    () => ({
      owner: 0 as EntityId,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ttl: 0,
    }),
    (bullet) => {
      bullet.owner = 0 as EntityId;
      bullet.x = 0;
      bullet.y = 0;
      bullet.vx = 0;
      bullet.vy = 0;
      bullet.ttl = 0;
    },
  );
}
