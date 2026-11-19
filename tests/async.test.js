import assert from "node:assert/strict";
import test from "node:test";
import { AssetError, fetchJson, loadAll, loadAllSettled, retry } from "../src/assets.js";
import { Lobby } from "../src/lobby.js";

test("fetchJson rejects 404 with an AssetError and retry does not repeat 4xx", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  await assert.rejects(
    retry(() => fetchJson("/missing.json"), { attempts: 4 }),
    (error) => error instanceof AssetError && error.status === 404,
  );
  assert.equal(attempts, 1);
  globalThis.fetch = originalFetch;
});

test("fetchJson rejects broken JSON as a descriptive AssetError", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  });

  await assert.rejects(fetchJson("/broken.json"), /Invalid JSON/);
  globalThis.fetch = originalFetch;
});

test("loadAll reports progress and only resolves after every asset", async () => {
  const progress = [];
  const result = await loadAll([async () => "first", async () => "second"], {
    onProgress: (completed, total) => progress.push([completed, total]),
  });

  assert.deepEqual(result, ["first", "second"]);
  assert.deepEqual(progress, [
    [1, 2],
    [2, 2],
  ]);
});

test("loadAllSettled keeps successful assets when one asset fails", async () => {
  const results = await loadAllSettled([
    async () => 42,
    async () => {
      throw new Error("missing");
    },
  ]);

  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[0].value, 42);
  assert.equal(results[1].status, "rejected");
  assert.match(results[1].reason.message, /missing/);
});

test("Lobby exposes rooms, joins a known room, and supports async room iteration", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => [{ id: "alpha", name: "Arena Alpha", width: 800, height: 600 }],
  });

  const lobby = new Lobby();
  let joined;
  lobby.addEventListener("joined", (event) => {
    joined = event.detail;
  });

  const rooms = await lobby.refresh();
  assert.equal(rooms[0].id, "alpha");

  let iterated;
  for await (const page of lobby.roomPages()) iterated = page;
  assert.equal(iterated[0].name, "Arena Alpha");

  lobby.join("alpha", "  Nova  ");
  assert.equal(joined.playerName, "Nova");
  assert.equal(joined.room.id, "alpha");
  globalThis.fetch = originalFetch;
});
