import type { Express } from "express";
import { existsSync } from "node:fs";
import { getLocalUploadRoot, resolveSafeUploadPath } from "./localUpload";

function storageKeyFromRequest(req: { path: string }): string | null {
  const m = req.path.match(/^\/manus-storage\/(.+)$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = storageKeyFromRequest(req);
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    const localRoot = getLocalUploadRoot();
    if (!localRoot) {
      res
        .status(503)
        .send(
          "Armazenamento não configurado: defina LOCAL_UPLOAD_ROOT no servidor (caminho absoluto).",
        );
      return;
    }

    try {
      const full = resolveSafeUploadPath(localRoot, key);
      if (!existsSync(full)) {
        res.status(404).send("Not found");
        return;
      }
      res.set("Cache-Control", "public, max-age=86400");
      res.sendFile(full, (err) => {
        if (err) {
          console.error("[StorageProxy] local sendFile:", err);
          if (!res.headersSent) res.status(500).send("Storage read error");
        }
      });
    } catch (e) {
      console.error("[StorageProxy] local path:", e);
      res.status(400).send("Invalid storage key");
    }
  });
}
