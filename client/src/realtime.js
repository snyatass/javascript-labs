import { decodeSnapshot, encodeInput } from "../../shared/protocol.js";
import { createNetWorld, stepNetWorld } from "../../shared/sim.js";

export class RealtimeClient {
  constructor(socket, bounds) {
    this.socket = socket;
    this.world = createNetWorld({ width: bounds.width, height: bounds.height, seed: 1 });
    this.localId = null;
    this.seq = 0;
    this.lastAck = 0;
    this.pending = [];
    this.snapshots = [];
    this.rtt = 0;
    this.pingSent = 0;
    this.bytesPerSec = 0;
    this.byteWindow = 0;
    this.byteTimer = performance.now();
    const params = new URLSearchParams(location.search);
    this.latency = Number(params.get("latency") || 0);
    this.jitter = Number(params.get("jitter") || 0);
    this.loss = Math.max(0, Math.min(1, Number(params.get("loss") || 0)));
    this.protocol = params.get("protocol") === "json" ? "json" : "binary";
    this.lastSnapshotAt = 0;
    this.correction = 0;
  }

  join(playerId) {
    this.localId = playerId;
  }

  handleSocketMessage(value) {
    if (value?.type === "snapshot") {
      if (Math.random() < this.loss) return true;
      this.byteWindow += JSON.stringify(value).length;
      this.reconcile({
        tick: value.tick,
        ack: value.ack,
        serverTime: 0,
        ships: value.ships,
        bullets: value.bullets,
      });
      this.lastSnapshotAt = performance.now();
      return true;
    }
    if (!(value instanceof ArrayBuffer)) return false;
    if (Math.random() < this.loss) return true;
    const receive = () => this.#handleSnapshot(value);
    if (this.latency > 0) {
      const jitter = this.jitter ? (Math.random() * 2 - 1) * this.jitter : 0;
      setTimeout(receive, Math.max(0, this.latency + jitter));
    } else receive();
    return true;
  }

  #handleSnapshot(value) {
    const snapshot = decodeSnapshot(value);
    if (!snapshot) return false;
    this.byteWindow += value.byteLength;
    this.lastSnapshotAt = performance.now();
    this.reconcile(snapshot);
  }

  reconcile(snapshot) {
    this.pending = this.pending.filter((input) => input.seq > snapshot.ack);
    this.snapshots.push({
      receivedAt: performance.now(),
      ships: snapshot.ships,
      bullets: snapshot.bullets,
    });
    if (this.snapshots.length > 20) this.snapshots.shift();

    for (const snapshotShip of snapshot.ships) {
      let local = this.world.ships.get(snapshotShip.id);
      if (!local) {
        local = { ...snapshotShip, cooldown: 0 };
        this.world.ships.set(snapshotShip.id, local);
      }
      if (snapshotShip.id === this.localId) {
        const dx = snapshotShip.x - local.x;
        const dy = snapshotShip.y - local.y;
        this.correction = Math.hypot(dx, dy);
        Object.assign(local, snapshotShip);
      } else {
        Object.assign(local, snapshotShip);
      }
    }

    this.world.bullets = snapshot.bullets.map((bullet) => ({ ...bullet }));

    if (this.localId) {
      const inputs = new Map();
      for (const input of this.pending) {
        inputs.set(this.localId, input);
        stepNetWorld(this.world, inputs, 1 / 30);
      }
    }
  }

  sampleInput(input) {
    if (!this.localId) return;
    this.seq++;
    const flags = {
      seq: this.seq,
      thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
      left: input.isDown("ArrowLeft") || input.isDown("KeyA"),
      right: input.isDown("ArrowRight") || input.isDown("KeyD"),
      fire: input.isDown("Space"),
      angle: 0,
    };
    this.pending.push(flags);
    if (this.pending.length > 120) this.pending.shift();
    if (Math.random() >= this.loss) {
      const packet = this.protocol === "json" ? { type: "input", ...flags } : encodeInput(flags);
      if (this.latency > 0) {
        const jitter = this.jitter ? (Math.random() * 2 - 1) * this.jitter : 0;
        setTimeout(() => this.socket.send(packet), Math.max(0, this.latency / 2 + jitter));
      } else {
        this.socket.send(packet);
      }
    }

    const inputs = new Map([[this.localId, flags]]);
    stepNetWorld(this.world, inputs, 1 / 30);
  }

  updateMetrics() {
    const now = performance.now();
    this.rtt = this.snapshotAge + this.latency * 2;
    if (now - this.byteTimer >= 1000) {
      this.bytesPerSec = this.byteWindow;
      this.byteWindow = 0;
      this.byteTimer = now;
      this.pingSent = now;
    }
  }

  get snapshotAge() {
    return this.lastSnapshotAt ? performance.now() - this.lastSnapshotAt : 0;
  }

  getInterpolatedShip(id, now) {
    const local = this.world.ships.get(id);
    if (id !== this.localId && this.snapshots.length >= 2) {
      const target = now - 100;
      let older = this.snapshots[0];
      let newer = this.snapshots[this.snapshots.length - 1];
      for (let i = 1; i < this.snapshots.length; i++) {
        if (this.snapshots[i].receivedAt >= target) {
          older = this.snapshots[i - 1];
          newer = this.snapshots[i];
          break;
        }
      }
      const oldShip = older.ships.find((ship) => ship.id === id);
      const newShip = newer.ships.find((ship) => ship.id === id);
      if (oldShip && newShip) {
        const span = Math.max(1, newer.receivedAt - older.receivedAt);
        const alpha = Math.max(0, Math.min(1, (target - older.receivedAt) / span));
        return {
          ...newShip,
          x: oldShip.x + (newShip.x - oldShip.x) * alpha,
          y: oldShip.y + (newShip.y - oldShip.y) * alpha,
        };
      }
    }
    return local;
  }
}
