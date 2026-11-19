import { EventEmitter } from "node:events";

export class Room extends EventEmitter {
  #sockets = new Set();
  #names = new Map();

  constructor({ id, name, width = 800, height = 600 }) {
    super();
    this.id = id;
    this.name = name;
    this.width = width;
    this.height = height;
  }

  get players() {
    return this.#sockets.size;
  }

  add(socket, name) {
    this.#sockets.add(socket);
    this.#names.set(socket, name);
    socket.roomId = this.id;
    this.emit("join", { socket, name, players: this.players });
  }

  remove(socket) {
    if (!this.#sockets.delete(socket)) return false;
    const name = this.#names.get(socket) ?? "Pilot";
    this.#names.delete(socket);
    socket.roomId = null;
    this.emit("leave", { socket, name, players: this.players });
    return true;
  }

  has(socket) {
    return this.#sockets.has(socket);
  }

  nameOf(socket) {
    return this.#names.get(socket) ?? "Pilot";
  }

  broadcast(message, except = null) {
    for (const socket of this.#sockets) {
      if (socket === except || socket.readyState !== 1) continue;
      if (socket.bufferedAmount > 256 * 1024) continue;
      socket.send(JSON.stringify(message));
    }
  }

  snapshot() {
    return {
      id: this.id,
      name: this.name,
      width: this.width,
      height: this.height,
      players: this.players,
    };
  }
}
