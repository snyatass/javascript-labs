import { createReadStream, stat } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { loadConfig } from "./config.js";
import { MatchLog } from "./match-log.js";
import { Room } from "./room.js";

const config = loadConfig();
const rooms = new Map([
  ["arena-alpha", new Room({ id: "arena-alpha", name: "Arena Alpha", width: 800, height: 600 })],
  ["arena-beta", new Room({ id: "arena-beta", name: "Arena Beta", width: 1000, height: 700 })],
  ["small-orbit", new Room({ id: "small-orbit", name: "Small Orbit", width: 640, height: 480 })],
]);
const logs = new Map();

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.includes("..")) {
    json(response, 400, { error: "Invalid path" });
    return;
  }
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const resolved = path.resolve(config.clientDir, relative);
  if (
    resolved !== path.resolve(config.clientDir) &&
    !resolved.startsWith(`${path.resolve(config.clientDir)}${path.sep}`)
  ) {
    json(response, 400, { error: "Invalid path" });
    return;
  }
  stat(resolved, (error, stats) => {
    if (error || !stats.isFile()) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".wav": "audio/wav",
    };
    response.setHeader("Content-Type", types[path.extname(resolved)] || "application/octet-stream");
    createReadStream(resolved).pipe(response);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { ok: true });
  } else if (request.method === "GET" && url.pathname === "/api/rooms") {
    json(
      response,
      200,
      [...rooms.values()].map((room) => room.snapshot()),
    );
  } else if (request.method === "POST" && url.pathname === "/api/rooms") {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (Buffer.byteLength(body) > 4096) {
        json(response, 413, { error: "Request too large" });
        return;
      }
    }
    try {
      const data = JSON.parse(body);
      const name = typeof data.name === "string" ? data.name.trim().slice(0, 40) : "";
      if (!name) return json(response, 400, { error: "Room name is required" });
      const id = `room-${Date.now().toString(36)}`;
      const room = new Room({ id, name, width: 800, height: 600 });
      rooms.set(id, room);
      json(response, 201, room.snapshot());
    } catch {
      json(response, 400, { error: "Invalid JSON" });
    }
  } else if (
    request.method === "GET" &&
    url.pathname.startsWith("/api/matches/") &&
    url.pathname.endsWith("/replay")
  ) {
    const roomId = url.pathname.split("/")[3];
    const match = logs.get(roomId);
    if (!match) return json(response, 404, { error: "No match log" });
    match.replay(response).catch(() => json(response, 500, { error: "Replay failed" }));
  } else {
    await serveStatic(request, response);
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (webSocket) =>
    wss.emit("connection", webSocket, request),
  );
});

wss.on("connection", (socket) => {
  socket.joinTimer = setTimeout(() => {
    if (!socket.roomId) socket.close(1008, "Join timeout");
  }, 5000);
  socket.missedPongs = 0;
  socket.messages = [];
  socket.isAlive = true;

  socket.on("pong", () => {
    socket.isAlive = true;
    socket.missedPongs = 0;
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });

  socket.on("message", async (data) => {
    if (data.byteLength > 16 * 1024) {
      socket.close(1009, "Message too large");
      return;
    }

    const now = Date.now();
    socket.messages = socket.messages.filter((timestamp) => now - timestamp < 1000);
    socket.messages.push(now);
    if (socket.messages.length > 20) {
      socket.close(1008, "Rate limit");
      return;
    }

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      socket.close(1007, "Invalid JSON");
      return;
    }
    if (!message || typeof message !== "object" || typeof message.type !== "string") {
      socket.close(1007, "Invalid message");
      return;
    }

    if (message.type === "join") {
      if (socket.roomId) return socket.close(1008, "Already joined");
      const room = rooms.get(message.roomId);
      const name = typeof message.name === "string" ? message.name.trim().slice(0, 24) : "";
      if (!room || !name) return socket.close(1008, "Invalid join");
      clearTimeout(socket.joinTimer);
      if (!logs.has(room.id)) {
        const match = new MatchLog(config.logDir);
        try {
          await match.open(room.id);
        } catch (error) {
          socket.close(1011, "Match log unavailable");
          console.error("Match log open failed:", error.message);
          return;
        }
        room.on("join", (event) =>
          match.append({ type: "join", name: event.name, players: event.players }),
        );
        room.on("leave", (event) =>
          match.append({ type: "leave", name: event.name, players: event.players }),
        );
        logs.set(room.id, match);
      }
      room.add(socket, name);
      socket.send(JSON.stringify({ type: "joined", room: room.snapshot(), name }));
      return;
    }

    if (message.type === "chat") {
      if (!socket.roomId) return socket.close(1008, "Join first");
      const text = typeof message.text === "string" ? message.text.trim().slice(0, 500) : "";
      if (!text) return socket.close(1007, "Invalid chat");
      const room = rooms.get(socket.roomId);
      const event = { type: "chat", name: room.nameOf(socket), text };
      room.broadcast(event);
      logs.get(room.id)?.append(event);
      return;
    }

    socket.close(1008, "Unknown message type");
  });

  socket.on("close", () => {
    clearTimeout(socket.joinTimer);
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    room?.remove(socket);
    if (room?.players === 0) {
      void logs.get(room.id)?.close();
      rooms.delete(room.id);
    }
  });
});

const pingTimer = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.missedPongs++;
      if (socket.missedPongs >= 2) {
        socket.terminate();
        continue;
      }
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 15000);

async function shutdown(signal) {
  clearInterval(pingTimer);
  for (const socket of wss.clients) socket.close(1001, "Server shutdown");
  await Promise.all([...logs.values()].map((log) => log.close()));
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
  console.log(`Shutdown via ${signal}`);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.listen(config.port, "127.0.0.1", () => {
  console.log(`Server listening on http://127.0.0.1:${config.port}`);
});
