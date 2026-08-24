import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSteamLandscapeHeader } from "./image-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "acgn.json");
const outputDirectory = path.join(root, "public", "images", "steam");
const data = JSON.parse(await readFile(dataPath, "utf8"));
const games = data.steam?.games;

if (!Array.isArray(games) || games.length === 0) {
  throw new Error("data/acgn.json does not contain a Steam game list");
}

await mkdir(outputDirectory, { recursive: true });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const candidatesFor = (game) => [
  `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`,
  game.coverSource
].filter(Boolean);

async function hasExistingCover(filePath) {
  try {
    if ((await stat(filePath)).size <= 1024) return false;
    return isSteamLandscapeHeader(await readFile(filePath));
  } catch {
    return false;
  }
}

const curlEnvironment = { ...process.env };
for (const key of ["https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"]) {
  delete curlEnvironment[key];
}

function requestImage(url) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--connect-timeout", "10",
      "--max-time", "30",
      url
    ], { env: curlEnvironment });
    const chunks = [];
    let errorText = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => { errorText += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(new Uint8Array(Buffer.concat(chunks)));
      else reject(new Error(errorText.trim() || `curl exited with code ${code}`));
    });
  });
}

async function fetchImage(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const bytes = await requestImage(url);
      if (bytes.byteLength <= 1024) throw new Error("image response is unexpectedly small");
      if (!isSteamLandscapeHeader(bytes)) throw new Error("image is not an official landscape Steam header");
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(400 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

let nextIndex = 0;
let downloaded = 0;
let skipped = 0;
const failures = [];

async function worker() {
  while (nextIndex < games.length) {
    const game = games[nextIndex];
    nextIndex += 1;
    const destination = path.join(outputDirectory, `${game.appid}.jpg`);
    if (await hasExistingCover(destination)) {
      skipped += 1;
      continue;
    }

    try {
      let bytes = null;
      for (const url of candidatesFor(game)) {
        bytes = await fetchImage(url);
        if (bytes) break;
      }
      if (!bytes) throw new Error("Steam did not provide a header image");
      const temporary = `${destination}.tmp-${process.pid}`;
      await writeFile(temporary, bytes);
      await rename(temporary, destination);
      downloaded += 1;
    } catch (error) {
      try { await unlink(`${destination}.tmp-${process.pid}`); } catch {}
      failures.push(`${game.appid} ${game.name}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: 24 }, () => worker()));

if (failures.length) {
  throw new Error(`Failed to download ${failures.length} Steam covers:\n${failures.join("\n")}`);
}

console.log(`Steam covers ready: ${games.length} total, ${downloaded} downloaded, ${skipped} already present.`);
