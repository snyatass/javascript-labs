export const PROTOCOL_VERSION = 1 as const;

export type EntityId = number & { readonly __brand: "EntityId" };
export type Sequence = number & { readonly __brand: "Sequence" };
export type Tick = number & { readonly __brand: "Tick" };

export function entityId(value: number): EntityId {
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new RangeError("Invalid EntityId");
  }
  return value as EntityId;
}

export function sequence(value: number): Sequence {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError("Invalid Sequence");
  }
  return value as Sequence;
}

export function tick(value: number): Tick {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError("Invalid Tick");
  }
  return value as Tick;
}

export interface NetInput {
  readonly seq: Sequence;
  readonly thrust: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly fire: boolean;
  readonly angle: number;
}

export type SnapshotEntity =
  | {
      readonly kind: "ship";
      readonly id: EntityId;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly vx: number;
      readonly vy: number;
      readonly hp: number;
    }
  | {
      readonly kind: "bullet";
      readonly owner: EntityId;
      readonly x: number;
      readonly y: number;
      readonly vx: number;
      readonly vy: number;
    };

export interface Snapshot {
  readonly tick: Tick;
  readonly ack: Sequence;
  readonly serverTime: number;
  readonly entities: readonly SnapshotEntity[];
}

export function encodeInput(input: NetInput): ArrayBuffer {
  const packet = new ArrayBuffer(8);
  const view = new DataView(packet);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint32(1, input.seq, true);
  let flags = 0;
  if (input.thrust) flags |= 1;
  if (input.left) flags |= 2;
  if (input.right) flags |= 4;
  if (input.fire) flags |= 8;
  view.setUint8(5, flags);
  view.setInt16(6, Math.round((input.angle * 32767) / Math.PI), true);
  return packet;
}

export function decodeInput(buffer: ArrayBuffer): NetInput | null {
  if (buffer.byteLength !== 8) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION) return null;
  const seq = view.getUint32(1, true);
  const flags = view.getUint8(5);
  const angle = (view.getInt16(6, true) / 32767) * Math.PI;
  if (!Number.isFinite(angle) || seq > 0xffffffff) return null;

  return {
    seq: sequence(seq),
    thrust: Boolean(flags & 1),
    left: Boolean(flags & 2),
    right: Boolean(flags & 4),
    fire: Boolean(flags & 8),
    angle,
  };
}

export function encodeSnapshot(
  world: {
    readonly tick: number;
    readonly ships: ReadonlyMap<EntityId, NetShip>;
    readonly bullets: readonly NetBullet[];
  },
  clientAck: Sequence,
): ArrayBuffer {
  const ships = [...world.ships.values()];
  const bullets = world.bullets;
  const byteLength = 17 + ships.length * 22 + bullets.length * 18;
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
    offset += 2;
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

export function decodeSnapshot(buffer: ArrayBuffer): Snapshot | null {
  if (buffer.byteLength < 17) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION) return null;

  const entities: SnapshotEntity[] = [];
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
    if (![x, y, vx, vy, angle].every(Number.isFinite) || hp < 0 || hp > 255) return null;
    entities.push({ kind: "ship", id: entityId(id), x, y, angle, vx, vy, hp });
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
    if (![x, y, vx, vy].every(Number.isFinite)) return null;
    entities.push({ kind: "bullet", owner: entityId(owner), x, y, vx, vy });
  }

  return {
    tick: tick(view.getUint32(1, true)),
    ack: sequence(view.getUint32(5, true)),
    serverTime: view.getUint32(9, true),
    entities,
  };
}

export interface NetShip {
  readonly id: EntityId;
  readonly name: string;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  hp: number;
  cooldown: number;
}

export interface NetBullet {
  owner: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
}

function performanceNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
