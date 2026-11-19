import { fetchJson } from "./assets.js";

export class Lobby extends EventTarget {
  #intervalId = null;
  #abortController = null;
  #rooms = [];

  constructor({ url = "/api/rooms", interval = 5000 } = {}) {
    super();
    this.url = url;
    this.interval = interval;
  }

  get rooms() {
    return this.#rooms;
  }

  async refresh() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const signal = AbortSignal.timeout(2500);
    const localSignal = this.#abortController.signal;
    const combined = AbortSignal.any([signal, localSignal]);

    try {
      this.#rooms = await fetchJson(this.url, combined);
      this.dispatchEvent(new CustomEvent("rooms", { detail: { rooms: this.#rooms } }));
      return this.#rooms;
    } catch (error) {
      this.dispatchEvent(new CustomEvent("error", { detail: { error } }));
      throw error;
    }
  }

  async *roomPages() {
    yield await this.refresh();
  }

  startPolling() {
    if (this.#intervalId !== null) return;
    this.#intervalId = setInterval(() => {
      if (document.visibilityState === "visible") void this.refresh().catch(() => {});
    }, this.interval);
  }

  stopPolling() {
    if (this.#intervalId !== null) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
    this.#abortController?.abort();
  }

  join(roomId, playerName) {
    const room = this.#rooms.find((candidate) => candidate.id === roomId);
    if (!room) throw new Error("Room not found");
    this.stopPolling();
    this.dispatchEvent(
      new CustomEvent("joined", { detail: { room, playerName: playerName.trim() || "Pilot" } }),
    );
  }
}
