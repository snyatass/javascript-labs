export class ResilientSocket extends EventTarget {
  #socket = null;
  #queue = [];
  #attempt = 0;
  #timer = null;
  #url;
  #closed = false;

  constructor(url) {
    super();
    this.#url = url;
  }

  connect() {
    this.#closed = false;
    this.#open();
  }

  #open() {
    if (this.#closed) return;
    this.#socket = new WebSocket(this.#url);

    this.#socket.addEventListener("open", () => {
      this.#attempt = 0;
      this.dispatchEvent(new CustomEvent("open"));
      for (const message of this.#queue.splice(0)) this.send(message);
    });

    this.#socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        this.dispatchEvent(new CustomEvent("message", { detail: message }));
      } catch {
        this.dispatchEvent(new CustomEvent("error", { detail: new Error("Invalid server JSON") }));
      }
    });

    this.#socket.addEventListener("close", () => {
      this.dispatchEvent(new Event("close"));
      if (this.#closed) return;
      const delay = Math.min(10000, 250 * 2 ** this.#attempt);
      this.#attempt++;
      this.#timer = setTimeout(() => this.#open(), delay);
    });

    this.#socket.addEventListener("error", () => {
      this.dispatchEvent(
        new CustomEvent("error", { detail: new Error("WebSocket connection failed") }),
      );
    });
  }

  send(message) {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(message);
      if (new TextEncoder().encode(payload).byteLength <= 16 * 1024) {
        if (this.#socket.bufferedAmount < 256 * 1024) this.#socket.send(payload);
      }
    } else {
      this.#queue.push(message);
    }
  }

  close() {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#socket?.close();
  }
}
