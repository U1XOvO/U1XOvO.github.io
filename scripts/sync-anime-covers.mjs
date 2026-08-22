import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "acgn.json");
const outputDirectory = path.join(root, "public", "images", "anime");
const data = JSON.parse(await readFile(dataPath, "utf8"));
const anime = data.anime;
const works = anime ? [...(anime.deity?.works || []), ...(anime.favorites || [])] : [];

if (!anime || !Array.isArray(anime.deity?.works) || !Array.isArray(anime.favorites) || works.length === 0) {
  throw new Error("data/acgn.json does not contain an Anime collection");
}

if (works.some((work) => !Number.isInteger(work.anilistId) || work.anilistId <= 0)) {
  throw new Error("every Anime work needs a positive anilistId before its cover can be synchronized");
}

await mkdir(outputDirectory, { recursive: true });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const curlEnvironment = { ...process.env };
for (const key of ["https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"]) {
  delete curlEnvironment[key];
}

function requestBytes(url, options = {}) {
  const args = [
    "--fail",
    "--location",
    "--silent",
    "--show-error",
    "--connect-timeout", "10",
    "--max-time", "30"
  ];
  if (options.method) args.push("--request", options.method);
  for (const [name, value] of Object.entries(options.headers || {})) args.push("--header", `${name}: ${value}`);
  if (options.body) args.push("--data-binary", options.body);
  args.push(url);

  return new Promise((resolve, reject) => {
    const child = spawn("curl", args, { env: curlEnvironment });
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

async function requestWithRetry(url, options) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const bytes = await requestBytes(url, options);
      if (bytes.byteLength <= 1024) throw new Error("response is unexpectedly small");
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(400 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

const mediaQuery = `query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      coverImage { extraLarge large }
    }
  }
}`;

async function fetchMedia(ids) {
  const body = JSON.stringify({ query: mediaQuery, variables: { ids } });
  const bytes = await requestWithRetry("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body
  });
  const response = JSON.parse(new TextDecoder().decode(bytes));
  if (response.errors?.length) throw new Error(response.errors.map(({ message }) => message).join("; "));
  return response.data?.Page?.media || [];
}

const mediaById = new Map();
for (let index = 0; index < works.length; index += 50) {
  const media = await fetchMedia(works.slice(index, index + 50).map(({ anilistId }) => anilistId));
  for (const entry of media) mediaById.set(entry.id, entry);
}

function extensionFor(url) {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
}

async function hasExistingCover(filePath) {
  try {
    return (await stat(filePath)).size > 1024;
  } catch {
    return false;
  }
}

const checkedOn = new Date().toISOString().slice(0, 10);
let nextIndex = 0;
let downloaded = 0;
let skipped = 0;
const failures = [];

async function worker() {
  while (nextIndex < works.length) {
    const work = works[nextIndex];
    nextIndex += 1;
    const media = mediaById.get(work.anilistId);
    const source = media?.coverImage?.extraLarge || media?.coverImage?.large;
    if (!source) {
      failures.push(`${work.id}: AniList did not provide a cover image`);
      continue;
    }

    const extension = extensionFor(source);
    const image = `/images/anime/${work.id}${extension}`;
    const destination = path.join(root, "public", image.slice(1));
    try {
      if (await hasExistingCover(destination)) {
        skipped += 1;
      } else {
        const bytes = await requestWithRetry(source);
        const temporary = `${destination}.tmp-${process.pid}`;
        await writeFile(temporary, bytes);
        await rename(temporary, destination);
        downloaded += 1;
      }
      work.image = image;
      work.coverSource = source;
      work.coverCheckedOn = checkedOn;
    } catch (error) {
      try { await unlink(`${destination}.tmp-${process.pid}`); } catch {}
      failures.push(`${work.id}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: 6 }, () => worker()));

if (failures.length) {
  throw new Error(`Failed to synchronize ${failures.length} Anime covers:\n${failures.join("\n")}`);
}

const temporaryDataPath = `${dataPath}.tmp-${process.pid}`;
await writeFile(temporaryDataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
await rename(temporaryDataPath, dataPath);
console.log(`Anime covers ready: ${works.length} total, ${downloaded} downloaded, ${skipped} already present.`);
