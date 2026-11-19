import { readFile } from "node:fs/promises";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "lab3-room-api",
      configureServer(server) {
        server.middlewares.use("/api/rooms", async (_request, response) => {
          try {
            const rooms = await readFile(new URL("./public/rooms.json", import.meta.url), "utf8");
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json");
            response.end(rooms);
          } catch {
            response.statusCode = 500;
            response.end(JSON.stringify({ error: "rooms unavailable" }));
          }
        });
      },
    },
  ],
});
