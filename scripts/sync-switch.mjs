import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "acgn.json");
const temporaryDataPath = `${dataPath}.tmp`;
const imageDirectory = path.join(root, "public", "images", "nintendo-switch");
const userId = "10708519";
const sourceUrl = `https://web.xiaoheihe.cn/account/switch_bind/home?userid=${userId}&is_share=1`;
const apiRoot = "https://api.xiaoheihe.cn";
const timeoutMs = 20_000;
const shanghaiDate = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithRetry(url, headers) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`Source returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await wait(400 * (2 ** attempt));
  }
  throw lastError;
}

async function requestJson(pathname, parameters) {
  const url = new URL(pathname, apiRoot);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  const response = await fetchWithRetry(url, { Accept: "application/json" });
  if (!response.ok) throw new Error(`Nintendo Switch source returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.status !== "ok" || !payload.result) {
    throw new Error(`Nintendo Switch source returned status “${payload.status || "unknown"}”.`);
  }
  return payload.result;
}

async function downloadImage(url, outputPath) {
  const response = await fetchWithRetry(url, { Accept: "image/avif,image/webp,image/*" });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error(`Nintendo Switch cover download failed with HTTP ${response.status}.`);
  }
  const temporaryImagePath = `${outputPath}.tmp`;
  await writeFile(temporaryImagePath, Buffer.from(await response.arrayBuffer()));
  await rename(temporaryImagePath, outputPath);
}

const account = await requestJson("/game/switch/jp/account/data", { userid: userId });
if (!account.account_id || !Number.isInteger(account.total_game_count)) {
  throw new Error("Nintendo Switch source did not return an account ID and game count.");
}

const sourceGames = [];
while (sourceGames.length < account.total_game_count) {
  const page = await requestJson("/game/switch/jp/games/data", {
    userid: userId,
    account_id: account.account_id,
    offset: sourceGames.length,
    limit: 30
  });
  if (!Array.isArray(page.games) || page.games.length === 0) break;
  sourceGames.push(...page.games);
}

if (sourceGames.length !== account.total_game_count) {
  throw new Error(`Expected ${account.total_game_count} Nintendo Switch games, received ${sourceGames.length}.`);
}

await mkdir(imageDirectory, { recursive: true });
const games = sourceGames.map((game) => {
  if (!game.title_id || !game.name || !game.square_image) {
    throw new Error("Nintendo Switch source returned an incomplete game record.");
  }
  return {
    id: game.title_id,
    name: game.name.trim(),
    image: `/images/nintendo-switch/${game.title_id}.webp`,
    imageAlt: `${game.name.trim()} Nintendo Switch game cover`,
    sourceImage: game.square_image
  };
});

const concurrency = 6;
for (let index = 0; index < games.length; index += concurrency) {
  await Promise.all(games.slice(index, index + concurrency).map((game) =>
    downloadImage(game.sourceImage, path.join(root, "public", game.image.slice(1)))
  ));
}

const acgn = JSON.parse(await readFile(dataPath, "utf8"));
acgn.nintendoSwitch = {
  source: "小黑盒 Nintendo Switch 公开分享页",
  sourceUrl,
  checkedOn: shanghaiDate(),
  totalGames: games.length,
  games: games.map(({ sourceImage, ...game }) => game)
};

await writeFile(temporaryDataPath, `${JSON.stringify(acgn, null, 2)}\n`, "utf8");
try {
  await rename(temporaryDataPath, dataPath);
} catch (error) {
  await unlink(temporaryDataPath).catch(() => {});
  throw error;
}

process.stdout.write(`Synced ${games.length} Nintendo Switch games.\n`);
