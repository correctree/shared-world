import { defineRoom, defineServer } from "colyseus";
import { SharedWorldRoom } from "./SharedWorldRoom.js";

const port = Number(process.env.PORT || 2567);

const server = defineServer({
  rooms: {
    shared_world: defineRoom(SharedWorldRoom).filterBy(["roomCode"])
  },
  express: (app) => {
    app.get("/health", (_req, res) => res.json({ ok: true, service: "shared-world-0.1" }));
  }
});

server.listen(port);
console.log(`Shared World server: http://localhost:${port}`);
