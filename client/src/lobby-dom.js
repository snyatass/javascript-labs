export function setupLobby(lobby) {
  const section = document.getElementById("lobby");
  const status = document.getElementById("lobby-status");
  const select = document.getElementById("room-select");
  const join = document.getElementById("join-button");
  const nameInput = document.getElementById("pilot-name");

  lobby.addEventListener("rooms", () => {
    select.replaceChildren();
    for (const room of lobby.rooms) {
      const option = document.createElement("option");
      option.value = room.id;
      option.textContent = `${room.name} — ${room.players} pilots`;
      select.append(option);
    }
  });

  lobby.addEventListener("error", (event) => {
    status.textContent = `Lobby unavailable: ${event.detail.error.message}.`;
  });

  join.addEventListener("click", () => lobby.join(select.value, nameInput.value));

  lobby.addEventListener("joined", (event) => {
    document.body.dataset.room = event.detail.room.id;
  });

  return {
    setStatus(message) {
      status.textContent = message;
    },
    setReady(ready) {
      select.disabled = !ready;
      join.disabled = !ready;
      if (ready) status.textContent = "Choose a room";
    },
    hide() {
      section.classList.add("hidden");
    },
  };
}
