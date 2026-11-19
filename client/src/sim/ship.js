import { wrapVector } from "./arena.js";
import { Bullet } from "./bullet.js";
import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export const SHIP_CONFIG = {
  turnSpeed: 4.2,
  thrustAccel: 520,
  drag: 0.985,
  maxSpeed: 480,
};

export class Ship extends Entity {
  #hp;
  #fireCooldown = 0;

  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    angle = -Math.PI / 2,
    isPlayer = true,
    team = isPlayer ? "player" : "enemy",
    hp = isPlayer ? 3 : 2,
    invulnerableTime = 0,
  } = {}) {
    super({ kind: "ship", pos, vel, angle, radius: isPlayer ? 16 : 14 });
    this.isPlayer = isPlayer;
    this.team = team;
    this.maxHp = hp;
    this.#hp = hp;
    this.thrust = false;
    this.shieldTime = 0;
    this.rapidFireTime = 0;
    this.invulnerableTime = invulnerableTime;
  }

  get hp() {
    return this.#hp;
  }

  update(dt, inputs, world) {
    this.#fireCooldown = Math.max(0, this.#fireCooldown - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.rapidFireTime = Math.max(0, this.rapidFireTime - dt);
    this.invulnerableTime = Math.max(0, this.invulnerableTime - dt);

    if (this.isPlayer) {
      this.#updatePlayer(dt, inputs);
    } else {
      this.#updateEnemy(dt, world);
    }

    super.update(dt, inputs, world);
    this.pos = wrapVector(this.pos, world.bounds.width, world.bounds.height);
  }

  fire(world, { homing = false } = {}) {
    if (!this.alive || this.#fireCooldown > 0) return null;

    const direction = Vector2.fromAngle(this.angle);
    const bullet = new Bullet({
      pos: this.pos.add(direction.scale(this.radius + 5)),
      vel: this.vel.add(direction.scale(this.isPlayer ? 560 : 390)),
      angle: this.angle,
      ownerId: this.id,
      ownerTeam: this.team,
      homing,
    });

    this.#fireCooldown = this.isPlayer ? (this.rapidFireTime > 0 ? 0.12 : 0.28) : 0.9;
    return world.spawn(bullet);
  }

  takeDamage(amount = 1) {
    if (!this.alive || this.shieldTime > 0 || this.invulnerableTime > 0) return false;

    this.#hp = Math.max(0, this.#hp - amount);
    this.invulnerableTime = 0.45;
    if (this.#hp === 0) this.alive = false;
    return true;
  }

  applyPickup(effect) {
    if (effect === "shield") {
      this.shieldTime = 8;
    } else if (effect === "rapid") {
      this.rapidFireTime = 8;
    }
  }

  #updatePlayer(dt, inputs) {
    if (inputs?.isDown("ArrowLeft") || inputs?.isDown("KeyA")) {
      this.angle -= SHIP_CONFIG.turnSpeed * dt;
    }
    if (inputs?.isDown("ArrowRight") || inputs?.isDown("KeyD")) {
      this.angle += SHIP_CONFIG.turnSpeed * dt;
    }

    this.thrust = inputs?.isDown("ArrowUp") || inputs?.isDown("KeyW") || false;
    if (this.thrust) {
      this.vel = this.vel.add(Vector2.fromAngle(this.angle, SHIP_CONFIG.thrustAccel * dt));
    }

    this.vel = this.vel.scale(SHIP_CONFIG.drag ** (dt * 60));
    const speed = this.vel.length();
    if (speed > SHIP_CONFIG.maxSpeed) {
      this.vel = this.vel.scale(SHIP_CONFIG.maxSpeed / speed);
    }
  }

  #updateEnemy(dt, world) {
    const target = [...world.ofKind("ship")].find((ship) => ship.isPlayer);
    if (!target) {
      this.thrust = false;
      return;
    }

    const desiredAngle = Math.atan2(target.pos.y - this.pos.y, target.pos.x - this.pos.x);
    const angleDelta = normalizeAngle(desiredAngle - this.angle);
    const maxTurn = SHIP_CONFIG.turnSpeed * 0.45 * dt;
    this.angle += Math.max(-maxTurn, Math.min(maxTurn, angleDelta));
    this.vel = Vector2.fromAngle(this.angle, 48);
    this.thrust = false;

    const distance = this.pos.sub(target.pos).length();
    if (distance < Math.min(world.bounds.width, world.bounds.height) * 0.8) {
      this.fire(world);
    }
  }
}

function normalizeAngle(angle) {
  return ((((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}
