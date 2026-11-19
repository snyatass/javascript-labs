import WebSocket from "ws";

const count = Number(process.env.BOT_COUNT ?? 8);
const url = process.env.WS_URL ?? "ws://127.0.0.1:3000/ws";

for (let i = 0; i < count; i++) {
  const socket = new WebSocket(url);
  let seq = 0;
  let joined = false;
  socket.once("open", () => {
    console.log(`Bot ${i + 1} connected`);
    socket.send(JSON.stringify({ type: "join", roomId: "arena-alpha", name: `Bot ${i + 1}` }));
  });
  socket.once("error", (error) => {
    console.error(`Bot ${i + 1} error:`, error.message);
  });
  socket.on("close", (code, reason) => {
    console.log(`Bot ${i + 1} closed: ${code} ${reason.toString()}`);
  });
  socket.on("message", (message) => {
    if (typeof message !== "string" && !message.toString().startsWith("\u0001")) {
      const text = message.toString();
      if (text.includes('"type":"joined"')) {
        joined = true;
        console.log(`Bot ${i + 1} joined`);
      }
    }
  });
  setInterval(() => {
    seq++;
    if (joined && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "input",
          seq,
          thrust: i % 2 === 0,
          left: i % 3 === 0,
          right: i % 3 !== 0,
          fire: seq % 20 === 0,
        }),
      );
    }
  }, 33);
}
