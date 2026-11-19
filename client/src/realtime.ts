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
        this.correction = Math.hypot(snapshotShip.x - local.x, snapshotShip.y - local.y);
      }
      Object.assign(local, snapshotShip);
    }

    this.world.bullets = bullets.map((bullet) => ({
      owner: bullet.owner as EntityId,
      x: bullet.x,
      y: bullet.y,
      vx: bullet.vx,
      vy: bullet.vy,
      ttl: 2,
    }));

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
        return {
          id,
          name: "Remote",
          x: oldShip.x + (newShip.x - oldShip.x) * alpha,
          y: oldShip.y + (newShip.y - oldShip.y) * alpha,
          angle: newShip.angle,
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
