import assert from "node:assert/strict";
import test from "node:test";
import { Asteroid } from "../src/sim/asteroid.js";
import { Bullet } from "../src/sim/bullet.js";
import { Entity } from "../src/sim/entity.js";
import { Explosion } from "../src/sim/explosion.js";
import { Game } from "../src/sim/game.js";
import { Pickup } from "../src/sim/pickup.js";
import { SHIP_CONFIG, Ship } from "../src/sim/ship.js";
import { Vector2 } from "../src/sim/vector.js";
import { World } from "../src/sim/world.js";

test("Vector2 operations return new vectors and preserve their operands", () => {
  const vector = new Vector2(3, 4);
  const other = new Vector2(1, -2);

  assert.deepEqual(vector.add(other), new Vector2(4, 2));
  assert.deepEqual(vector.sub(other), new Vector2(2, 6));
  assert.deepEqual(vector.scale(2), new Vector2(6, 8));
  assert.equal(vector.length(), 5);
  const normalized = vector.normalize();
  assert.ok(Math.abs(normalized.x - 0.6) < 1e-10);
  assert.ok(Math.abs(normalized.y - 0.8) < 1e-10);
  assert.deepEqual(new Vector2().normalize(), new Vector2());
  assert.ok(Math.abs(vector.rotate(Math.PI / 2).x + 4) < 1e-10);
  assert.equal(vector.dot(other), -5);
  assert.deepEqual(vector, new Vector2(3, 4));
});

test("Ship extends Entity and updates its movement at a fixed timestep", () => {
  const world = new World({ width: 800, height: 600 });
  const ship = world.spawn(new Ship({ pos: new Vector2(400, 300) }));
  const inputs = {
    isDown: (code) => code === "ArrowRight" || code === "ArrowUp",
  };

  assert.equal(Object.getPrototypeOf(Ship.prototype), Entity.prototype);
  world.step(1 / 60, inputs);

  assert.equal(ship.angle, -Math.PI / 2 + SHIP_CONFIG.turnSpeed / 60);
  assert.ok(ship.vel.x > 0);
  assert.ok(ship.vel.y < 0);
  assert.ok(ship.pos.x > 400);
});

test("Ship clamps speed and exposes damage only through its hp getter", () => {
  const world = new World({ width: 800, height: 600 });
  const ship = world.spawn(new Ship({ pos: new Vector2(400, 300) }));
  ship.vel = new Vector2(1000, 0);
  world.step(1 / 60, { isDown: () => false });

  assert.equal(ship.hp, 3);
  assert.ok(ship.vel.length() <= SHIP_CONFIG.maxSpeed);
  assert.equal(ship.takeDamage(), true);
  assert.equal(ship.hp, 2);
  assert.equal(ship.takeDamage(), false);
  assert.equal(ship.hp, 2);
});

test("Ship.fire spawns a bullet at the nose with inherited velocity", () => {
  const world = new World({ width: 500, height: 400 });
  const ship = world.spawn(
    new Ship({ pos: new Vector2(100, 100), vel: new Vector2(10, 0), angle: 0 }),
  );
  const bullet = ship.fire(world);

  assert.ok(bullet instanceof Bullet);
  assert.equal(bullet.ownerId, ship.id);
  assert.equal(bullet.ownerTeam, "player");
  assert.deepEqual(bullet.pos, new Vector2(121, 100));
  assert.deepEqual(bullet.vel, new Vector2(570, 0));
  assert.equal(ship.fire(world), null);
});

test("detaching Ship.fire loses its this binding while a closure preserves it", () => {
  const world = new World({ width: 500, height: 400 });
  const ship = new Ship({ pos: new Vector2(100, 100) });
  const detachedFire = ship.fire;

  assert.throws(() => detachedFire(world), TypeError);
  assert.ok((() => ship.fire(world))());
});

test("bullets expire after their TTL", () => {
  const world = new World({ width: 500, height: 400 });
  const bullet = world.spawn(
    new Bullet({
      pos: new Vector2(100, 100),
      vel: new Vector2(),
      ownerId: 1,
      ownerTeam: "player",
    }),
  );

  world.step(2, { isDown: () => false });
  assert.equal(world.get(bullet.id), undefined);
});

test("asteroids bounce off the arena edges", () => {
  const world = new World({ width: 100, height: 100 });
  const asteroid = world.spawn(
    new Asteroid({
      pos: new Vector2(80, 50),
      vel: new Vector2(20, 0),
      radius: 10,
    }),
  );

  world.step(1, { isDown: () => false });
  assert.equal(asteroid.pos.x, 90);
  assert.equal(asteroid.vel.x, -20);
});

test("pickups stay stationary and explosions contain short-lived particles", () => {
  const world = new World({ width: 500, height: 400 });
  const pickup = world.spawn(new Pickup({ pos: new Vector2(40, 50) }));
  const explosion = world.spawn(
    new Explosion(new Vector2(200, 200), { random: () => 0.5, count: 4 }),
  );
  const pickupPosition = pickup.pos;

  world.step(0.2, { isDown: () => false });
  assert.equal(pickup.pos, pickupPosition);
  assert.equal(explosion.particles.length, 4);
  assert.ok(explosion.particles.every((particle) => particle.ttl < 0.65));
});

test("homing behavior composes onto both bullets and asteroids", () => {
  const world = new World({ width: 500, height: 400 });
  world.spawn(new Ship({ pos: new Vector2(100, 200) }));
  const asteroid = world.spawn(
    new Asteroid({ pos: new Vector2(200, 100), homing: true, radius: 10 }),
  );
  const targetAsteroid = world.spawn(new Asteroid({ pos: new Vector2(300, 300), radius: 10 }));
  const bullet = world.spawn(
    new Bullet({
      pos: new Vector2(250, 250),
      vel: new Vector2(100, 0),
      ownerId: 1,
      ownerTeam: "player",
      homing: true,
    }),
  );

  world.step(0.1, { isDown: () => false });

  assert.ok(asteroid.components.has("homing"));
  assert.ok(bullet.components.has("homing"));
  assert.ok(asteroid.angle > 0);
  assert.ok(bullet.angle > 0);
  assert.equal(world.get(targetAsteroid.id), targetAsteroid);
});

test("Game awards score for a destroyed asteroid and respawns the player after two seconds", () => {
  const game = new Game(
    { width: 500, height: 400 },
    { random: () => 0.25, asteroidCount: 0, spawnEnemy: false },
  );
  const player = game.player;
  const asteroid = game.world.spawn(
    new Asteroid({ pos: new Vector2(300, 200), hp: 1, radius: 20 }),
  );

  game.world.spawn(
    new Bullet({
      pos: asteroid.pos,
      vel: new Vector2(),
      ownerId: player.id,
      ownerTeam: "player",
    }),
  );
  game.step(0, { isDown: () => false });
  assert.equal(game.score, 100);
  assert.equal(game.world.get(asteroid.id), undefined);

  for (let hit = 0; hit < 3; hit++) {
    player.invulnerableTime = 0;
    game.world.spawn(
      new Bullet({
        pos: player.pos,
        vel: new Vector2(),
        ownerId: -1,
        ownerTeam: "enemy",
      }),
    );
    game.step(0, { isDown: () => false });
  }

  assert.equal(game.player, null);
  assert.equal(game.respawnRemaining, 2);
  game.step(2, { isDown: () => false });
  assert.ok(game.player instanceof Ship);
  assert.equal(game.player.hp, 3);
});
