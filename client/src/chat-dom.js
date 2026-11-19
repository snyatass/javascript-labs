export function setupChat(socket) {
  const chat = document.getElementById("chat");
  const log = document.getElementById("chat-log");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");

  chat.classList.remove("hidden");

  socket.addEventListener("message", (event) => {
    if (event.detail.type !== "chat") return;
    const line = document.createElement("div");
    line.textContent = `${event.detail.name}: ${event.detail.text}`;
    log.append(line);
    log.scrollTop = log.scrollHeight;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    socket.send({ type: "chat", text });
    input.value = "";
  });
}
