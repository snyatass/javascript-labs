export const PROTOCOL_VERSION = 1;

export function encodeInput({
  seq,
  thrust = false,
  left = false,
  right = false,
  fire = false,
  angle = 0,
}) {
  const packet = new ArrayBuffer(8);
  const view = new DataView(packet);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint32(1, seq >>> 0, true);
  let flags = 0;
  if (thrust) flags |= 1;
  if (left) flags |= 2;
  if (right) flags |= 4;
  if (fire) flags |= 8;
  view.setUint8(5, flags);
  view.setInt16(6, Math.round((angle * 32767) / Math.PI), true);
  return packet;
}

export function decodeInput(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== 8) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION) return null;
  const flags = view.getUint8(5);
  return {
    seq: view.getUint32(1, true),
    thrust: Boolean(flags & 1),
    left: Boolean(flags & 2),
    right: Boolean(flags & 4),
    fire: Boolean(flags & 8),
    angle: (view.getInt16(6, true) / 32767) * Math.PI,
  };
}

export function encodeSnapshot(world, clientAck = 0) {
  const ships = [...world.ships.values()];
  const bullets = world.bullets;
  const byteLength = 15 + ships.length * 22 + 2 + bullets.length * 18;
  const packet = new ArrayBuffer(byteLength);
  const view = new DataView(packet);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint32(1, world.tick >>> 0, true);
  view.setUint32(5, clientAck >>> 0, true);
  view.setUint32(9, Math.round(performanceNowMs()) >>> 0, true);
  view.setUint16(13, ships.length, true);

  let offset = 15;
  for (const ship of ships) {
    view.setUint16(offset, ship.id, true);
    offset += 2;
    view.setFloat32(offset, ship.x, true);
    offset += 4;
    view.setFloat32(offset, ship.y, true);
    offset += 4;
    view.setInt16(offset, Math.round((ship.angle * 32767) / Math.PI), true);
    offset += 2;
    view.setFloat32(offset, ship.vx, true);
    offset += 4;
    view.setFloat32(offset, ship.vy, true);
    offset += 4;
    view.setUint8(offset, ship.hp);
    offset += 1;
    view.setUint8(offset, 0);
    offset += 1;
  }

  view.setUint16(offset, bullets.length, true);
  offset += 2;
  for (const bullet of bullets) {
    view.setUint16(offset, bullet.owner, true);
    offset += 2;
    view.setFloat32(offset, bullet.x, true);
    offset += 4;
    view.setFloat32(offset, bullet.y, true);
    offset += 4;
    view.setFloat32(offset, bullet.vx, true);
    offset += 4;
    view.setFloat32(offset, bullet.vy, true);
    offset += 4;
  }
  return packet;
}

export function decodeSnapshot(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 17) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION) return null;

  const result = {
    tick: view.getUint32(1, true),
    ack: view.getUint32(5, true),
    serverTime: view.getUint32(9, true),
    ships: [],
    bullets: [],
  };
  const shipCount = view.getUint16(13, true);
  let offset = 15;

  for (let i = 0; i < shipCount; i++) {
    if (offset + 20 > buffer.byteLength) return null;
    const id = view.getUint16(offset, true);
    offset += 2;
    const x = view.getFloat32(offset, true);
    offset += 4;
    const y = view.getFloat32(offset, true);
    offset += 4;
    const angle = (view.getInt16(offset, true) / 32767) * Math.PI;
    offset += 2;
    const vx = view.getFloat32(offset, true);
    offset += 4;
    const vy = view.getFloat32(offset, true);
    offset += 4;
    const hp = view.getUint8(offset);
    offset += 2;
    result.ships.push({ id, x, y, angle, vx, vy, hp });
  }

  if (offset + 2 > buffer.byteLength) return null;
  const bulletCount = view.getUint16(offset, true);
  offset += 2;
  for (let i = 0; i < bulletCount; i++) {
    if (offset + 18 > buffer.byteLength) return null;
    const owner = view.getUint16(offset, true);
    offset += 2;
    const x = view.getFloat32(offset, true);
    offset += 4;
    const y = view.getFloat32(offset, true);
    offset += 4;
    const vx = view.getFloat32(offset, true);
    offset += 4;
    const vy = view.getFloat32(offset, true);
    offset += 4;
    result.bullets.push({ owner, x, y, vx, vy });
  }
  return result;
}

function performanceNowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}
