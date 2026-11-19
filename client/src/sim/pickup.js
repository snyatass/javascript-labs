import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Pickup extends Entity {
  constructor({ pos = new Vector2(), effect = "shield" } = {}) {
    super({ kind: "pickup", pos, radius: 14 });
    if (!["shield", "rapid"].includes(effect)) {
      throw new RangeError(`Unsupported pickup effect: ${effect}`);
    }
    this.effect = effect;
    this.ttl = 20;
  }

  update(dt) {
    this.ttl -= dt;
    if (this.ttl <= 0) this.alive = false;
  }
}
