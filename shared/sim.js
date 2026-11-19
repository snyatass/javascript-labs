export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNetWorld({ width = 800, height = 600, seed = 1 } = {}) {
  return {
    width,
    height,
    seed,
    random: mulberry32(seed),
    tick: 0,
    bullets: [],
    ships: new Map(),
  };
}

export function addNetShip(world, id, name = "Pilot") {
  const index = world.ships.size;
  world.ships.set(id, {
    id,
    name,
    x: world.width * (index === 0 ? 0.35 : 0.65),
    y: world.height * 0.5,
    vx: 0,
    vy: 0,
    angle: index === 0 ? 0 : Math.PI,
    hp: 3,
    cooldown: 0,
  });
}

export function removeNetShip(world, id) {
  world.ships.delete(id);
}

export function stepNetWorld(world, inputs, dt = 1 / 30) {
  world.tick++;
  for (const [id, ship] of world.ships) {
    const input = inputs.get(id) ?? { thrust: false, left: false, right: false, fire: false };
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
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    ship.cooldown = Math.max(0, ship.cooldown - dt);
    wrapShip(ship, world.width, world.height);

    if (input.fire && ship.cooldown === 0) {
      ship.cooldown = 0.25;
      world.bullets.push({
        x: ship.x + Math.cos(ship.angle) * 18,
        y: ship.y + Math.sin(ship.angle) * 18,
        vx: ship.vx + Math.cos(ship.angle) * 520,
        vy: ship.vy + Math.sin(ship.angle) * 520,
        ttl: 2,
        owner: id,
      });
    }
  }

  for (const bullet of world.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.ttl -= dt;
    bullet.x = wrapCoordinate(bullet.x, world.width);
    bullet.y = wrapCoordinate(bullet.y, world.height);

    for (const ship of world.ships.values()) {
      if (ship.id === bullet.owner) continue;
      if (Math.hypot(ship.x - bullet.x, ship.y - bullet.y) < 18) {
        bullet.ttl = 0;
        ship.hp = Math.max(0, ship.hp - 1);
      }
    }
  }
  world.bullets = world.bullets.filter((bullet) => bullet.ttl > 0);
  return world;
}

export function cloneNetWorld(world) {
  return {
    ...world,
    ships: new Map([...world.ships].map(([id, ship]) => [id, { ...ship }])),
    bullets: world.bullets.map((bullet) => ({ ...bullet })),
  };
}

function wrapCoordinate(value, extent) {
  return ((value % extent) + extent) % extent;
}

function wrapShip(ship, width, height) {
  ship.x = wrapCoordinate(ship.x, width);
  ship.y = wrapCoordinate(ship.y, height);
}
