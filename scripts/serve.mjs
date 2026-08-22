import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

await import("./build.mjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
    let filePath = path.join(root, requestPath);
    const info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) filePath = path.join(filePath, "index.html");
    if (!info && !path.extname(filePath)) filePath = path.join(filePath, "index.html");
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile() || !filePath.startsWith(root)) throw new Error("Not found");
    response.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("404 · Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Local site: http://${host}:${port}`);
});
