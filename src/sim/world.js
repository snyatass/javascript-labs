import { resolveCollisions } from "./collision.js";
import { Entity } from "./entity.js";

export class World {
  #entities = new Map();
  #pendingDespawn = new Set();
  #events = [];

  constructor(bounds = { width: 800, height: 600 }) {
    this.bounds = bounds;
  }

  spawn(entity) {
    if (!(entity instanceof Entity)) {
      throw new TypeError("World.spawn expects an Entity instance");
    }
    if (this.#entities.has(entity.id)) {
      throw new Error(`Entity ${entity.id} already exists in this world`);
    }

    entity.alive = true;
    this.#entities.set(entity.id, entity);
    return entity;
  }

  despawn(id) {
    const entity = this.#entities.get(id);
    if (!entity) return false;

    entity.alive = false;
    this.#pendingDespawn.add(id);
    return true;
  }

  get(id) {
    return this.#entities.get(id);
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  *ofKind(kind) {
    for (const entity of this.#entities.values()) {
      if (entity.alive && entity.kind === kind) yield entity;
    }
  }

  emit(event) {
    this.#events.push(event);
  }

  consumeEvents() {
    return this.#events.splice(0);
  }

  step(dt, inputs) {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new RangeError("World.step expects a non-negative finite delta");
    }

    const snapshot = [...this.#entities.values()];
    for (const entity of snapshot) {
      if (!entity.alive) continue;
      entity.previousPos = entity.pos;
      entity.previousAngle = entity.angle;
      entity.update(dt, inputs, this);
    }

    const pairs = resolveCollisions(this);
    for (const entity of this.#entities.values()) {
      if (!entity.alive) this.#pendingDespawn.add(entity.id);
    }
    for (const id of this.#pendingDespawn) this.#entities.delete(id);
    this.#pendingDespawn.clear();

    return pairs;
  }
}
