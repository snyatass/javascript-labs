import { Vector2 } from "./vector.js";

export class Entity {
  static #nextId = 1;

  constructor({
    kind = "entity",
    pos = new Vector2(),
    vel = new Vector2(),
    angle = 0,
    radius = 0,
  } = {}) {
    this.id = Entity.#nextId++;
    this.kind = kind;
    this.pos = new Vector2(pos.x, pos.y);
    this.vel = new Vector2(vel.x, vel.y);
    this.previousPos = this.pos;
    this.angle = angle;
    this.previousAngle = angle;
    this.radius = radius;
    this.alive = true;
    this.components = new Map();
  }

  update(dt, inputs, world) {
    for (const component of this.components.values()) {
      component.update?.(this, world, dt, inputs);
    }

    this.pos = this.pos.add(this.vel.scale(dt));
  }
}
