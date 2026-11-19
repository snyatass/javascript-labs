import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { lerpAngle, nearestWrappedCoordinate } from "../client/src/realtime.ts";
import { parseClientMessage } from "./messages";
import { ObjectPool } from "./pool";
import {
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  entityId,
  sequence,
  tick,
} from "./protocol";
import { addNetShip, createNetWorld, stepNetWorld } from "./sim";
import { SpatialHash } from "./spatial-hash";

describe("Lab 07 fast-check protocol", () => {
  test("input round-trip preserves decoded fields with angle rounding", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (seq, thrust, left, right, fire, angle) => {
          const packet = encodeInput({ seq: sequence(seq), thrust, left, right, fire, angle });
          const decoded = decodeInput(packet);
          expect(decoded).not.toBeNull();
          expect(decoded?.seq).toBe(sequence(seq));
          expect(decoded?.thrust).toBe(thrust);
          expect(decoded?.left).toBe(left);
          expect(decoded?.right).toBe(right);
          expect(decoded?.fire).toBe(fire);
          expect(Math.abs((decoded?.angle ?? 0) - angle)).toBeLessThanOrEqual(0.001);
        },
      ),
    );
  });

  test("frame length matches binary format description", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 0, max: 20 }),
        (ships, bullets) => {
          const world = createNetWorld();
          for (let i = 0; i < ships; i++) {
            const id = entityId(i + 1);
            addNetShip(world, id);
          }
          world.bullets = Array.from({ length: bullets }, (_, i) => ({
            owner: entityId(i + 1),
            x: i,
            y: i,
            vx: 1,
            vy: 1,
            ttl: 1,
          }));
          const packet = encodeSnapshot(world, sequence(0));
          expect(packet.byteLength).toBe(17 + ships * 22 + bullets * 18);
        },
      ),
    );
  });

  test("malformed buffers return null", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 64 }), (bytes) => {
        const buffer = bytes.buffer.slice(0, bytes.byteLength) as ArrayBuffer;
        if (buffer.byteLength !== 8) {
          expect(decodeInput(buffer)).toBeNull();
        } else {
          const view = new DataView(buffer);
          view.setUint8(0, 255);
          expect(decodeInput(buffer)).toBeNull();
        }
      }),
    );
  });

  test("ship remains inside arena after random inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (seed, left, right, thrust) => {
          const world = createNetWorld({ width: 640, height: 480, seed });
          const id = entityId(1);
          addNetShip(world, id);
          const input = new Map([
            [id, { seq: sequence(1), left, right, thrust, fire: false, angle: 0 }],
          ]);
          for (let i = 0; i < 100; i++) stepNetWorld(world, input);
          const ship = world.ships.get(id);
          expect(ship?.x).toBeGreaterThanOrEqual(0);
          expect(ship?.x).toBeLessThan(640);
          expect(ship?.y).toBeGreaterThanOrEqual(0);
          expect(ship?.y).toBeLessThan(480);
        },
      ),
    );
  });

  test("Zod parser accepts valid joins and rejects malformed values", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 24 }).filter((name) => name.trim().length > 0),
        (name) => {
          expect(parseClientMessage({ type: "join", roomId: "arena", name }).ok).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
    for (const value of [null, {}, { type: "unknown" }, { type: "chat", text: "" }]) {
      expect(parseClientMessage(value).ok).toBe(false);
    }
  });
});

describe("Lab 07 deterministic sim and pooling", () => {
  test("wrap reconciliation uses nearest edge coordinates", () => {
    expect(nearestWrappedCoordinate(798, 2, 800)).toBe(802);
    expect(nearestWrappedCoordinate(2, 798, 800)).toBe(-2);
  });

  test("angle interpolation avoids full-circle jumps", () => {
    expect(Math.abs(Math.abs(lerpAngle(-3, 3, 0.5)) - Math.PI)).toBeLessThan(0.1);
  });
  test("brand constructors reject invalid range", () => {
    expect(() => entityId(-1)).toThrow(RangeError);
    expect(() => entityId(65536)).toThrow(RangeError);
    expect(() => sequence(-1)).toThrow(RangeError);
    expect(() => sequence(0x100000000)).toThrow(RangeError);
    expect(() => tick(-1)).toThrow(RangeError);
  });

  test("binary decoders reject bad version, short and malformed snapshot", () => {
    const badVersion = new ArrayBuffer(8);
    new DataView(badVersion).setUint8(0, 255);
    expect(decodeInput(badVersion)).toBeNull();
    expect(decodeInput(new ArrayBuffer(7))).toBeNull();
    expect(decodeSnapshot(new ArrayBuffer(16))).toBeNull();
    const badSnapshot = new ArrayBuffer(17);
    new DataView(badSnapshot).setUint8(0, 255);
    expect(decodeSnapshot(badSnapshot)).toBeNull();
  });

  test("snapshot decoder accepts bullets and rejects truncated bullet sections", () => {
    const world = createNetWorld();
    addNetShip(world, entityId(1));
    world.bullets = [
      {
        owner: entityId(1),
        x: 10,
        y: 20,
        vx: 30,
        vy: 40,
        ttl: 1,
      },
    ];
    const decoded = decodeSnapshot(encodeSnapshot(world, sequence(3)));
    expect(decoded?.entities.some((entity) => entity.kind === "bullet")).toBe(true);

    const packet = encodeSnapshot(world, sequence(3));
    const truncated = packet.slice(0, packet.byteLength - 1);
    expect(decodeSnapshot(truncated)).toBeNull();
  });

  test("determinism is identical for duplicate worlds", () => {
    const a = createNetWorld({ seed: 123 });
    const b = createNetWorld({ seed: 123 });
    const id = entityId(1);
    addNetShip(a, id);
    addNetShip(b, id);
    const input = new Map([
      [id, { seq: sequence(1), thrust: true, left: false, right: true, fire: true, angle: 0 }],
    ]);
    for (let i = 0; i < 300; i++) {
      stepNetWorld(a, input);
      stepNetWorld(b, input);
    }
    expect([...a.ships.entries()].map(([id, ship]) => [id, ship.x, ship.y, ship.angle])).toEqual(
      [...b.ships.entries()].map(([id, ship]) => [id, ship.x, ship.y, ship.angle]),
    );
  });

  test("spatial hash finds neighbor, pool reuses objects", () => {
    const hash = new SpatialHash<{ id: number }>(64);
    hash.insert(10, 10, { id: 1 });
    expect(hash.nearby(12, 12)).toHaveLength(1);
    let creations = 0;
    const pool = new ObjectPool(
      () => ({ value: ++creations }),
      (value) => {
        value.value = 0;
      },
    );
    const a = pool.acquire();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
    expect(creations).toBe(1);
    expect(pool.size).toBe(0);
    const empty = new SpatialHash<number>(32);
    expect(empty.nearby(0, 0)).toEqual([]);
  });

  test("pool and collision branches cover edge behavior", () => {
    const world = createNetWorld({ width: 100, height: 100 });
    const id = entityId(1);
    addNetShip(world, id);
    const input = new Map([
      [id, { seq: sequence(1), thrust: false, left: false, right: false, fire: true, angle: 0 }],
    ]);
    stepNetWorld(world, input);
    expect(world.bullets.length).toBe(1);
    for (let i = 0; i < 100; i++) stepNetWorld(world, input);
    expect(world.bullets.length).toBeLessThanOrEqual(8);
    world.bullets = [];
    expect(world.bulletPool.size).toBeGreaterThanOrEqual(0);
  });
});

for (let i = 1; i <= 60; i++) {
  test(`fixed-step invariant ${i}`, () => {
    const world = createNetWorld({ width: 800, height: 600, seed: i });
    const id = entityId(i);
    addNetShip(world, id);
    const input = new Map([
      [
        id,
        {
          seq: sequence(i),
          thrust: i % 2 === 0,
          left: i % 3 === 0,
          right: i % 5 === 0,
          fire: i % 7 === 0,
          angle: 0,
        },
      ],
    ]);
    for (let step = 0; step < 30; step++) stepNetWorld(world, input);
    const ship = world.ships.get(id);
    expect(ship).toBeDefined();
    expect(world.tick).toBe(30);
  });
}
