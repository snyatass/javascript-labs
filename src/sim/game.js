import { Asteroid } from "./asteroid.js";
import { Pickup } from "./pickup.js";
import { Ship } from "./ship.js";
import { Vector2 } from "./vector.js";
import { World } from "./world.js";

export class Game {
  #playerId;
  #respawnTimer = 0;
  #pickupTimer = 0;
  #random;
  events = [];

  constructor(bounds, { random = Math.random, asteroidCount = 7, spawnEnemy = true } = {}) {
    this.world = new World(bounds);
    this.score = 0;
    this.message = "";
    this.messageTime = 0;
    this.#random = random;

    const center = new Vector2(bounds.width / 2, bounds.height / 2);
    this.#playerId = this.world.spawn(new Ship({ pos: center, invulnerableTime: 1.5 })).id;

    if (spawnEnemy) {
      this.world.spawn(
        new Ship({
          pos: new Vector2(bounds.width * 0.78, bounds.height * 0.25),
          angle: Math.PI / 2,
          isPlayer: false,
          hp: 2,
        }),
      );
    }

    const orbitRadius = Math.min(bounds.width, bounds.height) * 0.36;
    for (let index = 0; index < asteroidCount; index++) {
      const angle = (Math.PI * 2 * index) / Math.max(asteroidCount, 1);
      const position = new Vector2(
        wrapCoordinate(center.x + Math.cos(angle) * orbitRadius, bounds.width),
        wrapCoordinate(center.y + Math.sin(angle) * orbitRadius, bounds.height),
      );
      const velocityAngle = this.#random() * Math.PI * 2;
      const velocity = Vector2.fromAngle(velocityAngle, 25 + this.#random() * 45);
      const asteroid = new Asteroid({
        pos: position,
        vel: velocity,
        radius: 19 + this.#random() * 12,
        homing: index === 0,
      });

      this.world.spawn(asteroid);
    }

    this.world.spawn(new Pickup({ pos: new Vector2(bounds.width * 0.2, bounds.height * 0.25) }));
    this.world.spawn(
      new Pickup({ pos: new Vector2(bounds.width * 0.8, bounds.height * 0.75), effect: "rapid" }),
    );
  }

  get player() {
    return this.world.get(this.#playerId) ?? null;
  }

  get respawnRemaining() {
    return this.#respawnTimer;
  }

  step(dt, inputs) {
    this.world.step(dt, inputs);

    if (this.#respawnTimer > 0) {
      this.#respawnTimer = Math.max(0, this.#respawnTimer - dt);
      if (this.#respawnTimer === 0 && !this.player) this.#spawnPlayer();
    }

    if (this.messageTime > 0) {
      this.messageTime = Math.max(0, this.messageTime - dt);
      if (this.messageTime === 0) this.message = "";
    }

    this.events = this.world.consumeEvents();
    for (const event of this.events) {
      if (event.type === "entity-destroyed") {
        if (event.kind === "asteroid" && event.killerTeam === "player") this.score += 100;
        if (event.kind === "ship" && event.killerTeam === "player") this.score += 250;
        if (event.entityId === this.#playerId) this.#respawnTimer = 2;
      } else if (event.type === "pickup-collected") {
        this.score += 25;
        this.message = event.effect === "shield" ? "SHIELD +8s" : "RAPID FIRE +8s";
        this.messageTime = 1.5;
      }
    }

    this.#maintainPickups(dt);
  }

  #spawnPlayer() {
    const position = this.#findSafePosition();
    const player = new Ship({ pos: position, invulnerableTime: 2 });
    this.#playerId = this.world.spawn(player).id;
    this.message = "SHIP RESPAWNED";
    this.messageTime = 1.5;
  }

  #findSafePosition() {
    const { width, height } = this.world.bounds;
    const obstacles = [...this.world].filter(
      (entity) => entity.kind === "asteroid" || entity.kind === "ship",
    );

    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = new Vector2(this.#random() * width, this.#random() * height);
      const isSafe = obstacles.every((entity) => {
        const dx = shortestDelta(candidate.x, entity.pos.x, width);
        const dy = shortestDelta(candidate.y, entity.pos.y, height);
        return Math.hypot(dx, dy) > entity.radius + 100;
      });
      if (isSafe) return candidate;
    }

    return new Vector2(width / 2, height / 2);
  }

  #maintainPickups(dt) {
    this.#pickupTimer += dt;
    if (this.#pickupTimer < 5 || [...this.world.ofKind("pickup")].length >= 2) return;

    this.#pickupTimer = 0;
    const { width, height } = this.world.bounds;
    this.world.spawn(
      new Pickup({
        pos: new Vector2(this.#random() * width, this.#random() * height),
        effect: this.#random() < 0.5 ? "shield" : "rapid",
      }),
    );
  }
}

function wrapCoordinate(position, extent) {
  return extent > 0 ? ((position % extent) + extent) % extent : position;
}

function shortestDelta(from, to, extent) {
  let delta = to - from;
  if (extent > 0 && delta > extent / 2) delta -= extent;
  if (extent > 0 && delta < -extent / 2) delta += extent;
  return delta;
}
