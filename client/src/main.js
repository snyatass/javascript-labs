import { fetchJson, loadAllSettled, loadAudio, loadImage, retry } from "./assets.js";
import { GameAudio } from "./audio.js";
import { setupChat } from "./chat-dom.js";
import { emitGameEvent } from "./events.js";
import { createInput } from "./input.js";
import { Lobby } from "./lobby.js";
import { setupLobby } from "./lobby-dom.js";
import { createLoop } from "./loop.js";
import { RealtimeClient } from "./realtime.js";
import { setupCanvas } from "./render/canvas.js";
import { drawEntity, drawGrid, drawHud } from "./render/draw.js";
import { Game } from "./sim/game.js";
import { ResilientSocket } from "./socket.js";

const canvas = document.getElementById("game");
const { ctx, size } = setupCanvas(canvas);
const input = createInput(window);
const lobby = new Lobby();
const lobbyUi = setupLobby(lobby);
const audio = new GameAudio();
audio.bind();

let game = null;
let loop = null;
let sprites = null;
let assetsReady = false;
let chatSocket = null;
let realtime = null;

function drawLoading(progress, message) {
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = "#0b0e14";
  ctx.fillRect(0, 0, size.width, size.height);
  const width = Math.min(420, size.width - 40);
  const x = (size.width - width) / 2;
  const y = size.height / 2;
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x, y - 8, width, 16);
  ctx.fillStyle = "#4cc9f0";
  ctx.fillRect(x, y - 8, width * progress, 16);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "13px monospace";
  ctx.textAlign = "center";
  ctx.fillText(message, size.width / 2, y - 24);
  ctx.textAlign = "start";
}

async function boot() {
  drawLoading(0, "Loading manifest…");
  const timeout = AbortSignal.timeout(8000);
  try {
    const manifest = await retry(() => fetchJson("/manifest.json", timeout), { signal: timeout });
    const tasks = [
      ...manifest.images.map((item) => async () => {
        const image = await loadImage(item.url, timeout);
        if (item.key === "sprites") sprites = image;
        return [item.key, image];
      }),
      ...manifest.json.map((item) => async () => [item.key, await fetchJson(item.url, timeout)]),
    ];
    const settled = await loadAllSettled(tasks, {
      signal: timeout,
      onProgress: (completed, total) => {
        drawLoading(completed / total, `Loading assets… ${completed}/${total}`);
      },
    });
    const failures = settled.filter((result) => result.status === "rejected");
    if (failures.length) {
      lobbyUi.setStatus(`Some assets failed: ${failures[0].reason.message}. Reload to retry.`);
      lobbyUi.setReady(false);
    } else {
      assetsReady = true;
      lobbyUi.setStatus("Lobby loading…");
    }
  } catch (error) {
    lobbyUi.setStatus(`Asset loading failed: ${error.message}. Reload to retry.`);
  }
}

async function loadAudioAssets(manifest) {
  await audio.unlock();
  const settled = await loadAllSettled(
    manifest.audio.map((item) => async () => [
      item.key,
      await loadAudio(item.url, AbortSignal.timeout(8000), audio.context),
    ]),
  );
  const failures = settled.filter((result) => result.status === "rejected");
  if (failures.length) throw failures[0].reason;
  audio.setBuffers(new Map(settled.map((result) => result.value)));
}

void boot().finally(async () => {
  try {
    await lobby.refresh();
    lobby.startPolling();
    lobbyUi.setReady(assetsReady);
  } catch (error) {
    lobbyUi.setStatus(`Lobby unavailable: ${error.message}.`);
    lobbyUi.setReady(false);
  }
});

lobby.addEventListener("rooms", () => lobbyUi.setReady(assetsReady));

lobby.addEventListener("joined", async (event) => {
  lobbyUi.setStatus("Starting Web Audio and arena…");
  lobbyUi.setReady(false);
  const manifest = await retry(() => fetchJson("/manifest.json", AbortSignal.timeout(8000))).catch(
    () => null,
  );
  try {
    if (manifest) await loadAudioAssets(manifest);
  } catch (error) {
    lobbyUi.setStatus(`Audio unavailable: ${error.message}. Starting game without sound.`);
  }

  const room = event.detail.room;
  game = new Game({ width: room.width, height: room.height });
  lobbyUi.hide();

  chatSocket = new ResilientSocket(
    `${location.protocol === "https:" ? "wss://" : "ws://"}${location.host}/ws`,
  );
  realtime = new RealtimeClient(chatSocket, room);
  chatSocket.connect();
  chatSocket.addEventListener("open", () => {
    chatSocket.send({
      type: "join",
      roomId: room.id,
      name: event.detail.playerName,
      protocol: new URLSearchParams(location.search).get("protocol") === "json" ? "json" : "binary",
    });
  });
  chatSocket.addEventListener("message", (socketEvent) => {
    const message = socketEvent.detail;
    if (message instanceof ArrayBuffer) {
      realtime.handleSocketMessage(message);
    } else if (message?.type === "snapshot") {
      realtime.handleSocketMessage(message);
    } else if (message.type === "joined") {
      realtime.join(message.playerId);
      game.message = `Joined ${message.room.name}`;
    }
  });
  setupChat(chatSocket);

  function simulate(_dt) {
    realtime.updateMetrics();
    realtime.sampleInput(input);
    for (const gameEvent of game.events) {
      if (gameEvent.type === "entity-hit") emitGameEvent("hit", gameEvent);
      if (gameEvent.type === "entity-destroyed") emitGameEvent("exploded", gameEvent);
    }
    input.consumeJustPressed();
  }

  function render(alpha, stats) {
    ctx.clearRect(0, 0, size.width, size.height);

    const bounds = game.world.bounds;
    const scale = Math.min(size.width / bounds.width, size.height / bounds.height);
    const arenaWidth = bounds.width * scale;
    const arenaHeight = bounds.height * scale;
    const offsetX = (size.width - arenaWidth) / 2;
    const offsetY = (size.height - arenaHeight) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    drawGrid(ctx, bounds.width, bounds.height);
    if (realtime.localId) {
      for (const ship of realtime.world.ships.values()) {
        const rendered = realtime.getInterpolatedShip(ship.id, performance.now());
        if (!rendered) continue;
        ctx.save();
        ctx.translate(rendered.x, rendered.y);
        ctx.rotate(rendered.angle);
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-14, -11);
        ctx.lineTo(-9, 0);
        ctx.lineTo(-14, 11);
        ctx.closePath();
        ctx.fillStyle = rendered.id === realtime.localId ? "#4cc9f0" : "#ff5d73";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.restore();
      }
      for (const bullet of realtime.world.bullets) {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe66d";
        ctx.fill();
      }
    } else {
      for (const entity of game.world) {
        drawEntity(ctx, entity, alpha, bounds.width, bounds.height, sprites);
      }
    }
    ctx.restore();

    drawHud(ctx, stats, {
      score: game.score,
      player: game.player,
      respawnRemaining: game.respawnRemaining,
      message: `${event.detail.playerName} • ${room.name}`,
    });

    ctx.save();
    ctx.fillStyle = "rgba(11,14,20,0.82)";
    ctx.fillRect(size.width - 230, 12, 218, 114);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px monospace";
    ctx.fillText(`RTT: ${realtime.rtt.toFixed(1)} ms`, size.width - 218, 34);
    ctx.fillText(`snapshot: ${realtime.snapshotAge.toFixed(1)} ms`, size.width - 218, 54);
    ctx.fillText(`bytes/s: ${realtime.bytesPerSec}`, size.width - 218, 74);
    ctx.fillText(`input queue: ${realtime.pending.length}`, size.width - 218, 94);
    ctx.fillText(`correction: ${realtime.correction.toFixed(1)} px`, size.width - 218, 114);
    ctx.restore();
  }

  loop = createLoop({ step: 1 / 60, simulate, render });
  loop.start();
});
