import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { Room } from "../src/room.js";

test("Room tracks joins, names, leaves, and emits empty lifecycle", () => {
  const room = new Room({ id: "test", name: "Test", width: 800, height: 600 });
  const socket = new EventEmitter();
  socket.readyState = 1;
  socket.send = () => {};

  let joined;
  room.on("join", (event) => {
    joined = event;
  });
  room.add(socket, "Nova");
  assert.equal(room.players, 1);
  assert.equal(room.nameOf(socket), "Nova");
  assert.equal(joined.name, "Nova");
  assert.equal(room.remove(socket), true);
  assert.equal(room.players, 0);
});

test("Room broadcast skips closed sockets and high bufferedAmount", () => {
  const room = new Room({ id: "test", name: "Test" });
  const sent = [];
  const socket = new EventEmitter();
  socket.readyState = 1;
  socket.bufferedAmount = 1024 * 1024;
  socket.send = (value) => sent.push(value);
  room.add(socket, "Pilot");
  room.broadcast({ type: "chat", text: "hello" });
  assert.equal(sent.length, 0);
});

test("config validates port and resolves environment directories", () => {
  assert.equal(loadConfig({ PORT: "3010", LOG_DIR: "custom-logs" }).port, 3010);
  assert.throws(() => loadConfig({ PORT: "no" }), /positive integer/);
  assert.throws(() => loadConfig({ PORT: "70000" }), /65535/);
});
