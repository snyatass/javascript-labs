import {
  decodeSnapshot,
  type EntityId,
  encodeInput,
  type NetInput,
  type NetShip,
  type Snapshot,
  sequence,
} from "../../shared/protocol.ts";
import { createNetWorld, stepNetWorld } from "../../shared/sim.ts";

interface SocketLike {
  send(message: unknown): void;
}

interface InputLike {
  isDown(code: string): boolean;
}

interface JsonSnapshot {
  readonly type: "snapshot";
  readonly tick: number;
  readonly ack: number;
  readonly ships: readonly ShipSnapshot[];
  readonly bullets: readonly BulletSnapshot[];
}

interface ShipSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly vx: number;
  readonly vy: number;
  readonly hp: number;
}

interface BulletSnapshot {
  readonly owner: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

interface StoredSnapshot {
  readonly receivedAt: number;
  readonly ships: readonly ShipSnapshot[];
  readonly bullets: readonly BulletSnapshot[];
}

export class RealtimeClient {
  readonly socket: SocketLike;
  readonly world = createNetWorld({ seed: 1 });
  localId: EntityId | null = null;
  seq = 0;
  pending: NetInput[] = [];
  readonly snapshots: StoredSnapshot[] = [];
  rtt = 0;
  bytesPerSec = 0;
  byteWindow = 0;
  byteTimer = performance.now();
  readonly latency: number;
  readonly jitter: number;
  readonly loss: number;
  readonly protocol: "json" | "binary";
  lastSnapshotAt = 0;
  correction = 0;
  private lastInputAt = 0;
  private serverTargetX = 0;
  private serverTargetY = 0;
  private serverTargetAngle = 0;
  private correctionActive = false;
  private readonly renderShips = new Map<
    EntityId,
    { x: number; y: number; angle: number; lastAt: number }
  >();

  constructor(socket: SocketLike, bounds: { width: number; height: number }) {
    this.socket = socket;
    this.world.width = bounds.width;
    this.world.height = bounds.height;
    const params = new URLSearchParams(location.search);
    this.latency = Number(params.get("latency") ?? 0);
    this.jitter = Number(params.get("jitter") ?? 0);
    this.loss = Math.max(0, Math.min(1, Number(params.get("loss") ?? 0)));
    this.protocol = params.get("protocol") === "json" ? "json" : "binary";
  }

  join(playerId: number): void {
    this.localId = playerId as EntityId;
  }

  handleSocketMessage(value: unknown): boolean {
    if (isJsonSnapshot(value)) {
      if (Math.random() < this.loss) return true;
      this.byteWindow += JSON.stringify(value).length;
      this.reconcileJson(value);
      this.lastSnapshotAt = performance.now();
      return true;
    }
    if (!(value instanceof ArrayBuffer)) return false;
    if (Math.random() < this.loss) return true;
    const receive = (): void => {
      const snapshot = decodeSnapshot(value);
      if (!snapshot) return;
      this.byteWindow += value.byteLength;
      this.lastSnapshotAt = performance.now();
      this.reconcile(snapshot);
    };
    if (this.latency > 0) {
      const jitter = this.jitter ? (Math.random() * 2 - 1) * this.jitter : 0;
      setTimeout(receive, Math.max(0, this.latency + jitter));
    } else {
      receive();
    }
    return true;
  }

  reconcile(snapshot: Snapshot): void {
    this.pending = this.pending.filter((input) => input.seq > snapshot.ack);
    const ships: ShipSnapshot[] = [];
    const bullets: BulletSnapshot[] = [];
    for (const entity of snapshot.entities) {
      switch (entity.kind) {
        case "ship":
          ships.push(entity);
          break;
        case "bullet":
          bullets.push(entity);
          break;
        default:
          assertNever(entity);
      }
    }
    this.storeSnapshot(ships, bullets);
  }

  private reconcileJson(value: JsonSnapshot): void {
    this.pending = this.pending.filter((input) => input.seq > sequence(value.ack));
    this.storeSnapshot(value.ships, value.bullets);
  }

  private storeSnapshot(ships: readonly ShipSnapshot[], bullets: readonly BulletSnapshot[]): void {
    this.snapshots.push({ receivedAt: performance.now(), ships, bullets });
    if (this.snapshots.length > 20) this.snapshots.shift();

    for (const snapshotShip of ships) {
      const id = snapshotShip.id as EntityId;
      let local = this.world.ships.get(id);
      if (!local) {
        local = {
          id,
          name: "Remote",
          x: snapshotShip.x,
          y: snapshotShip.y,
          angle: snapshotShip.angle,
          vx: snapshotShip.vx,
          vy: snapshotShip.vy,
          hp: snapshotShip.hp,
          cooldown: 0,
        };
        this.world.ships.set(id, local);
      }
      if (id === this.localId) {
        const correctedX = nearestWrappedCoordinate(local.x, snapshotShip.x, this.world.width);
        const correctedY = nearestWrappedCoordinate(local.y, snapshotShip.y, this.world.height);
        this.correction = Math.hypot(correctedX - local.x, correctedY - local.y);
        this.serverTargetX = correctedX;
        this.serverTargetY = correctedY;
        this.serverTargetAngle = snapshotShip.angle;
        if (this.correction > 12) {
          this.correctionActive = true;
          Object.assign(local, { ...snapshotShip, x: correctedX, y: correctedY });
        }
      } else {
        const correctedX = nearestWrappedCoordinate(local.x, snapshotShip.x, this.world.width);
        const correctedY = nearestWrappedCoordinate(local.y, snapshotShip.y, this.world.height);
        Object.assign(local, { ...snapshotShip, x: correctedX, y: correctedY });
      }
    }
    this.world.bullets = bullets.map((bullet, index) => {
      const previous = this.world.bullets[index];
      return {
        owner: bullet.owner as EntityId,
        x: previous ? nearestWrappedCoordinate(previous.x, bullet.x, this.world.width) : bullet.x,
        y: previous ? nearestWrappedCoordinate(previous.y, bullet.y, this.world.height) : bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        ttl: 2,
      };
    });

    if (this.localId) {
      const inputs = new Map<EntityId, NetInput>();
      for (const input of this.pending) {
        inputs.set(this.localId, input);
        stepNetWorld(this.world, inputs, 1 / 30);
      }
    }
  }

  sampleInput(input: InputLike): void {
    if (!this.localId) return;
    const now = performance.now();
    if (now - this.lastInputAt < 1000 / 30) {
      return;
    }
    this.lastInputAt = now;
    this.seq++;
    const flags: NetInput = {
      seq: sequence(this.seq),
      thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
      left: input.isDown("ArrowLeft") || input.isDown("KeyA"),
      right: input.isDown("ArrowRight") || input.isDown("KeyD"),
      fire: input.isDown("Space"),
      angle: 0,
    };
    this.pending.push(flags);
    if (this.pending.length > 120) this.pending.shift();

    if (Math.random() >= this.loss) {
      const packet: unknown =
        this.protocol === "json"
          ? {
              type: "input",
              seq: this.seq,
              thrust: flags.thrust,
              left: flags.left,
              right: flags.right,
              fire: flags.fire,
            }
          : encodeInput(flags);
      if (this.latency > 0) {
        const jitter = this.jitter ? (Math.random() * 2 - 1) * this.jitter : 0;
        setTimeout(() => this.socket.send(packet), Math.max(0, this.latency / 2 + jitter));
      } else {
        this.socket.send(packet);
      }
    }
    stepNetWorld(this.world, new Map([[this.localId, flags]]), 1 / 30);
  }

  updateMetrics(): void {
    const now = performance.now();
    this.rtt = this.snapshotAge + this.latency * 2;
    if (now - this.byteTimer >= 1000) {
      this.bytesPerSec = this.byteWindow;
      this.byteWindow = 0;
      this.byteTimer = now;
    }
  }

  get snapshotAge(): number {
    return this.lastSnapshotAt ? performance.now() - this.lastSnapshotAt : 0;
  }

  getInterpolatedShip(id: EntityId, now: number): NetShip | undefined {
    const local = this.world.ships.get(id);
    if (id === this.localId && local) {
      let render = this.renderShips.get(id);
      if (!render) {
        render = { x: local.x, y: local.y, angle: local.angle, lastAt: now };
        this.renderShips.set(id, render);
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - render.lastAt) / 1000));
      render.lastAt = now;
      const alpha = 1 - Math.exp(-dt * 18);

      if (this.correctionActive) {
        const targetX = nearestWrappedCoordinate(local.x, this.serverTargetX, this.world.width);
        const targetY = nearestWrappedCoordinate(local.y, this.serverTargetY, this.world.height);
        const correctedX = lerpWrapped(render.x, targetX, alpha, this.world.width);
        const correctedY = lerpWrapped(render.y, targetY, alpha, this.world.height);
        render.x = correctedX;
        render.y = correctedY;
        render.angle = lerpAngle(render.angle, this.serverTargetAngle, alpha);
        if (Math.hypot(targetX - correctedX, targetY - correctedY) < 0.5) {
          this.correctionActive = false;
          this.correction = 0;
        }
      } else {
        render.x = lerpWrapped(render.x, local.x, alpha, this.world.width);
        render.y = lerpWrapped(render.y, local.y, alpha, this.world.height);
        render.angle = lerpAngle(render.angle, local.angle, alpha);
      }
      return {
        ...local,
        x: render.x,
        y: render.y,
        angle: render.angle,
      };
    }
    if (id !== this.localId && this.snapshots.length >= 2) {
      const target = now - 100;
      let older = this.snapshots[0];
      let newer = this.snapshots.at(-1);
      if (!older || !newer) return local;
      for (let i = 1; i < this.snapshots.length; i++) {
        const candidate = this.snapshots[i];
        if (candidate && candidate.receivedAt >= target) {
          older = this.snapshots[i - 1] ?? older;
          newer = candidate;
          break;
        }
      }
      const oldShip = older.ships.find((ship) => ship.id === id);
      const newShip = newer.ships.find((ship) => ship.id === id);
      if (oldShip && newShip) {
        const span = Math.max(1, newer.receivedAt - older.receivedAt);
        const alpha = Math.max(0, Math.min(1, (target - older.receivedAt) / span));
        const x = lerpWrapped(oldShip.x, newShip.x, alpha, this.world.width);
        const y = lerpWrapped(oldShip.y, newShip.y, alpha, this.world.height);
        return {
          id,
          name: "Remote",
          x,
          y,
          angle: lerpAngle(oldShip.angle, newShip.angle, alpha),
          vx: newShip.vx,
          vy: newShip.vy,
          hp: newShip.hp,
          cooldown: 0,
        };
      }
    }
    return local;
  }
}

function isJsonSnapshot(value: unknown): value is JsonSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<JsonSnapshot>;
  return (
    candidate.type === "snapshot" &&
    Array.isArray(candidate.ships) &&
    Array.isArray(candidate.bullets)
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled snapshot entity: ${String(value)}`);
}

export function nearestWrappedCoordinate(current: number, target: number, extent: number): number {
  if (extent <= 0) return target;
  let delta = target - current;
  if (delta > extent / 2) delta -= extent;
  if (delta < -extent / 2) delta += extent;
  return current + delta;
}

function lerpWrapped(a: number, b: number, alpha: number, extent: number): number {
  if (extent <= 0) return a + (b - a) * alpha;
  const nearestB = nearestWrappedCoordinate(a, b, extent);
  const result = a + (nearestB - a) * alpha;
  return ((result % extent) + extent) % extent;
}

export function lerpAngle(a: number, b: number, alpha: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * alpha;
}
