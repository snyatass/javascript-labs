import { wrapVector } from "./arena.js";
import { HomingBehavior } from "./behaviors.js";
import { Entity } from "./entity.js";

export class Bullet extends Entity {
  constructor({ pos, vel, angle, ownerId, ownerTeam, homing = false, damage = 1 } = {}) {
    super({ kind: "bullet", pos, vel, angle, radius: 4 });
    this.ownerId = ownerId;
    this.ownerTeam = ownerTeam;
    this.damage = damage;
    this.ttl = 2;
    this.homing = homing;

    if (homing) {
      this.components.set(
        "homing",
        new HomingBehavior({ targetKind: "asteroid", speed: 500, turnRate: 4.5 }),
      );
    }
  }

  update(dt, inputs, world) {
    super.update(dt, inputs, world);
    this.ttl -= dt;
    if (this.ttl <= 0) this.alive = false;
    this.pos = wrapVector(this.pos, world.bounds.width, world.bounds.height);
  }
}
