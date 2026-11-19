import { Vector2 } from "./vector.js";

export function wrapPosition(entity, width, height) {
  const wrap = (position, extent) =>
    extent > 0 ? ((position % extent) + extent) % extent : position;

  const x = wrap(entity.x, width);
  const y = wrap(entity.y, height);
  return { ...entity, x, y };
}

export function wrapVector(position, width, height) {
  const wrapped = wrapPosition(position, width, height);
  return new Vector2(wrapped.x, wrapped.y);
}
