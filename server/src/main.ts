import { defineRoom, defineServer } from "colyseus";
import { SharedWorldRoom } from "./SharedWorldRoom.js";

const port = Number(process.env.PORT || 2567);
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const sharedAssets = new Map<string, Buffer>();

function parseAssetName(raw: string) {
  const clean = String(raw || "")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 96);

  const match = clean.match(/^([a-zA-Z0-9_-]{1,80})\.(zip|glb|webm)$/i);
  if (!match) return null;

  return {
    id: match[1],
    ext: match[2].toLowerCase() as "zip" | "glb" | "webm"
  };
}

const server = defineServer({
  rooms: {
    shared_world: defineRoom(SharedWorldRoom).filterBy(["roomCode"])
  },

  express: (app) => {
    app.use("/assets", (_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Cache-Control", "no-store");
      next();
    });

    app.options("/assets/:id", (_req, res) => {
      res.sendStatus(204);
    });

    app.put("/assets/:id", (req, res) => {
      const parsed = parseAssetName(req.params.id);
      if (!parsed) {
        res.status(400).json({ ok: false, error: "invalid asset name" });
        return;
      }

      const key = `${parsed.id}.${parsed.ext}`;
      const chunks: Buffer[] = [];
      let size = 0;
      let rejected = false;

      req.on("data", (chunk: Buffer) => {
        if (rejected) return;
        size += chunk.length;
        if (size > MAX_ASSET_BYTES) {
          rejected = true;
          res.status(413).json({ ok: false, error: "asset too large" });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (rejected) return;
        const data = Buffer.concat(chunks);
        if (data.length === 0) {
          res.status(400).json({ ok: false, error: "empty asset" });
          return;
        }

        sharedAssets.set(key, data);
        console.log(`[asset:put] ${key} / ${data.length} bytes`);
        res.json({ ok: true, assetRef: `/assets/${key}`, bytes: data.length });
      });

      req.on("error", (error) => {
        console.error("[asset:put error]", key, error);
        if (!res.headersSent) res.status(500).json({ ok: false, error: "upload failed" });
      });
    });

    app.get("/assets/:id", (req, res) => {
      const parsed = parseAssetName(req.params.id);
      if (!parsed) {
        res.status(400).json({ ok: false, error: "invalid asset name" });
        return;
      }

      const key = `${parsed.id}.${parsed.ext}`;
      const data = sharedAssets.get(key);
      if (!data) {
        res.status(404).json({ ok: false, error: "asset not found" });
        return;
      }

      res.setHeader(
        "Content-Type",
        parsed.ext === "glb"
          ? "model/gltf-binary"
          : parsed.ext === "webm"
            ? "video/webm"
            : "application/zip"
      );
      res.setHeader("Content-Length", String(data.length));
      res.send(data);
    });

    app.get("/health", (_req, res) =>
      res.json({
        ok: true,
        service: "shared-world-0.14.7",
        sharedAssets: sharedAssets.size
      })
    );
  }
});

server.listen(port);
console.log(`Shared World server: http://localhost:${port}`);
console.log("[Prototype 0.14.7] Session + World Recovery ready");
