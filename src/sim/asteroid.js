import { HomingBehavior } from "./behaviors.js";
import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Asteroid extends Entity {
  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    radius = 24,
    hp = 2,
    homing = false,
  } = {}) {
    super({ kind: "asteroid", pos, vel, radius });
    this.hp = hp;
    this.rotationSpeed = ((this.id % 5) - 2) * 0.35;
    this.vertices = Array.from({ length: 10 }, (_, index) => {
      const variation = ((this.id * 17 + index * 31) % 29) / 100;
      return {
        angle: (Math.PI * 2 * index) / 10,
        radius: radius * (0.78 + variation),
      };
    });

    if (homing) {
      this.components.set(
        "homing",
        new HomingBehavior({ targetKind: "ship", speed: 42, turnRate: 0.55 }),
      );
    }
  }

  update(dt, inputs, world) {
    super.update(dt, inputs, world);
    this.angle += this.rotationSpeed * dt;

    const { width, height } = world.bounds;
    let { x, y } = this.pos;
    let { x: vx, y: vy } = this.vel;

    if (x < this.radius || x > width - this.radius) {
      x = Math.max(this.radius, Math.min(width - this.radius, x));
      vx *= -1;
    }
    if (y < this.radius || y > height - this.radius) {
      y = Math.max(this.radius, Math.min(height - this.radius, y));
      vy *= -1;
    }

    this.pos = new Vector2(x, y);
    this.vel = new Vector2(vx, vy);
  }

  takeDamage(amount = 1) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.alive = false;
    return true;
  }
}
