import { assetCount, cloneOwnedWorld, createOwnedWorld, listOwnedWorlds, readAsset, renameOwnedWorld, saveAsset, setOwnedWorldAccess, setOwnedWorldArchived } from "./persistence.js";
import { defineRoom, defineServer } from "colyseus";
import { SharedWorldRoom } from "./SharedWorldRoom.js";
import { createHash } from "node:crypto";

const port = Number(process.env.PORT || 2567);
const MAX_ASSET_BYTES = 20 * 1024 * 1024;

function parseAssetName(raw: string) {
  const clean = String(raw || "")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 96);

  const match = clean.match(/^([a-zA-Z0-9_-]{1,80})\.(zip|glb|webm|mp3|wav)$/i);
  if (!match) return null;

  return {
    id: match[1],
    ext: match[2].toLowerCase() as "zip" | "glb" | "webm" | "mp3" | "wav"
  };
}

const server = defineServer({
  rooms: {
    shared_world: defineRoom(SharedWorldRoom).filterBy(["roomCode"])
  },

  express: (app) => {
    app.use("/rooms", (_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "X-Shared-Client-Id");
      res.setHeader("Cache-Control", "no-store");next();
    });
    app.options("/rooms",(_req,res)=>res.sendStatus(204));
    app.options("/rooms/create",(_req,res)=>res.sendStatus(204));
    app.options("/rooms/clone",(_req,res)=>res.sendStatus(204));
    app.options("/rooms/rename",(_req,res)=>res.sendStatus(204));
    app.options("/rooms/archive",(_req,res)=>res.sendStatus(204));
    app.options("/rooms/access",(_req,res)=>res.sendStatus(204));
    const roomClientId=(req:any)=>String(req.query?.clientId||req.get("X-Shared-Client-Id")||"");
    app.get("/rooms",(req,res)=>{
      try{res.json({ok:true,rooms:listOwnedWorlds(roomClientId(req),String(req.query.includeArchived||"")==="1")});}
      catch(error){res.status(403).json({ok:false,error:error instanceof Error?error.message:"room list failed"});}
    });
    app.post("/rooms/create",(req,res)=>{
      try{const world=createOwnedWorld(String(req.query.roomCode||""),roomClientId(req));
        res.status(201).json({ok:true,verified:true,roomCode:world.roomCode,revision:world.revision,savedAt:world.savedAt,mediaCount:world.mediaObjects.length});}
      catch(error){const message=error instanceof Error?error.message:"room create failed";
        res.status(message.includes("exists")?409:400).json({ok:false,error:message});}
    });
    app.post("/rooms/clone",(req,res)=>{
      try{const world=cloneOwnedWorld(String(req.query.source||""),String(req.query.target||""),roomClientId(req));
        res.status(201).json({ok:true,verified:true,roomCode:world.roomCode,revision:world.revision,savedAt:world.savedAt,mediaCount:world.mediaObjects.length});}
      catch(error){const message=error instanceof Error?error.message:"room clone failed";
        res.status(message.includes("exists")?409:message.includes("owner")?403:400).json({ok:false,error:message});}
    });
    app.post("/rooms/rename",(req,res)=>{
      try{const world=renameOwnedWorld(String(req.query.source||""),String(req.query.target||""),roomClientId(req));
        res.json({ok:true,verified:true,roomCode:world.roomCode,revision:world.revision,savedAt:world.savedAt,mediaCount:world.mediaObjects.length});}
      catch(error){const message=error instanceof Error?error.message:"room rename failed";
        res.status(message.includes("exists")?409:message.includes("owner")?403:400).json({ok:false,error:message});}
    });
    app.post("/rooms/archive",(req,res)=>{
      try{const archived=String(req.query.archived||"")==="1";const result=setOwnedWorldArchived(String(req.query.roomCode||""),roomClientId(req),archived);
        res.json({ok:true,verified:true,...result});}
      catch(error){const message=error instanceof Error?error.message:"room archive failed";
        res.status(message.includes("owner")?403:400).json({ok:false,error:message});}
    });
    app.post("/rooms/access",(req,res)=>{
      try{const editors=String(req.query.editors||"").split(",").filter(Boolean);const result=setOwnedWorldAccess(String(req.query.roomCode||""),roomClientId(req),String(req.query.accessMode||"shared"),editors);
        res.json({ok:true,verified:true,...result});}
      catch(error){const message=error instanceof Error?error.message:"room access update failed";
        res.status(message.includes("owner")?403:400).json({ok:false,error:message});}
    });
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

        try {
          if(/^[a-f0-9]{64}$/i.test(parsed.id)){
            const actual=createHash("sha256").update(data).digest("hex");
            if(actual.toLowerCase()!==parsed.id.toLowerCase()){
              res.status(409).json({ok:false,error:"asset hash mismatch"});return;
            }
          }
          saveAsset(key, data);
          console.log(`[asset:put] ${key} / ${data.length} bytes`);
          res.json({ ok: true, assetRef: `/assets/${key}`, bytes: data.length });
        } catch (error) {
          console.error("[asset:save error]",key,error);
          res.status(500).json({ok:false,error:"asset storage failed"});
        }
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
      let data: Buffer | null = null;
      try { data = readAsset(key); }
      catch (error) { console.error("[asset:read error]",key,error); res.sendStatus(500); return; }
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
            : parsed.ext === "mp3"
              ? "audio/mpeg"
              : parsed.ext === "wav"
                ? "audio/wav"
                : "application/zip"
      );
      res.setHeader("Content-Length", String(data.length));
      res.send(data);
    });

    app.get("/health", (_req, res) =>
      res.json({
        ok: true,
        service: "shared-world-0.24.1-access-ux",
        storedAssets: assetCount()
      })
    );
  }
});

server.listen(port);
console.log(`Shared World server: http://localhost:${port}`);
console.log("[Prototype 0.24.1] ACCESS UX ready");
