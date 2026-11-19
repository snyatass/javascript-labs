import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Explosion extends Entity {
  constructor(pos, { random = Math.random, count = 18 } = {}) {
    super({ kind: "explosion", pos });
    this.age = 0;
    this.duration = 0.65;
    this.particles = Array.from({ length: count }, () => {
      const angle = random() * Math.PI * 2;
      const speed = 35 + random() * 150;
      return {
        offset: new Vector2(),
        velocity: Vector2.fromAngle(angle, speed),
        ttl: 0.35 + random() * 0.3,
      };
    });
  }

  update(dt) {
    this.age += dt;
    for (const particle of this.particles) {
      particle.ttl -= dt;
      particle.offset = particle.offset.add(particle.velocity.scale(dt));
      particle.velocity = particle.velocity.scale(0.985);
    }
    if (this.age >= this.duration) this.alive = false;
  }
}
