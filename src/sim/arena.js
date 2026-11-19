export function wrapPosition(entity, width, height) {
  const wrap = (position, extent) =>
    extent > 0 ? ((position % extent) + extent) % extent : position;

  const x = wrap(entity.x, width);
  const y = wrap(entity.y, height);
  return { ...entity, x, y };
}
