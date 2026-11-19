import { gameEvents } from "./events.js";

export class GameAudio {
  constructor() {
    this.context = null;
    this.buffers = new Map();
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = AudioContextClass ? new AudioContextClass() : null;
    }
    if (this.context?.state === "suspended") await this.context.resume();
  }

  setBuffers(buffers) {
    this.buffers = buffers;
  }

  play(key) {
    if (this.context?.state !== "running") return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.start();
  }

  bind() {
    gameEvents.addEventListener("fired", () => this.play("fire"));
    gameEvents.addEventListener("hit", () => this.play("hit"));
    gameEvents.addEventListener("exploded", () => this.play("explosion"));
  }
}
