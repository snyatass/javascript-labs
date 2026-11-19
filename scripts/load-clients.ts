import WebSocket from "ws";

const counts = [8, 32, 64, 128];
const url = process.env.WS_URL ?? "ws://127.0.0.1:3000/ws";

for (const count of counts) {
  const clients = new Set<WebSocket>();
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    const socket = new WebSocket(url);
    clients.add(socket);
    socket.once("open", () => {
      socket.send(JSON.stringify({ type: "join", roomId: "arena-alpha", name: `Load ${i}` }));
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 500));

  const timers: ReturnType<typeof setInterval>[] = [];
  for (const socket of clients) {
    timers.push(
      setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "input",
              seq: 1,
              thrust: true,
              left: false,
              right: true,
              fire: false,
            }),
          );
        }
      }, 33),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
  console.log(`${count} clients: ${(performance.now() - start).toFixed(1)} ms setup window`);

  for (const timer of timers) clearInterval(timer);
  for (const socket of clients) socket.close();
  await new Promise((resolve) => setTimeout(resolve, 200));
}
