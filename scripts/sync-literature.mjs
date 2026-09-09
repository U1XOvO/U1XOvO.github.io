import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "data", "literature.json");
const temporaryOutput = `${output}.tmp`;
const apiRoot = "http://127.0.0.1:23119/api/users/0";
const collectionKey = "DEMEZICD";
const collectionName = "AI+Protein";
const reviewTag = "Review";

const themes = [
  {
    id: "kinetic-prediction",
    sourceTag: "Predict Kinetic",
    label: "Enzyme kinetic prediction",
    tone: "pink",
    x: 18,
    y: 24,
    mobileX: 27,
    mobileY: 32
  },
  {
    id: "protein-language-models",
    sourceTag: "LLM",
    label: "Protein language models",
    tone: "blue",
    x: 82,
    y: 24,
    mobileX: 73,
    mobileY: 32
  },
  {
    id: "directed-evolution",
    sourceTag: "DE",
    label: "Directed evolution",
    tone: "green",
    x: 15,
    y: 76,
    mobileX: 27,
    mobileY: 59
  },
  {
    id: "de-novo-design",
    sourceTag: "Denovo",
    label: "De novo design",
    tone: "purple",
    x: 50,
    y: 86,
    mobileX: 73,
    mobileY: 59
  },
  {
    id: "enzyme-discovery",
    sourceTag: "Discovery",
    label: "Enzyme discovery",
    tone: "teal",
    x: 85,
    y: 76,
    mobileX: 27,
    mobileY: 84
  },
  {
    id: "agent",
    sourceTag: "AGENT",
    label: "AGENT",
    tone: "yellow",
    x: 50,
    y: 14,
    mobileX: 73,
    mobileY: 84
  }
];

const namedEntities = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", "\""]
]);

const plainText = (value = "") => String(value)
  .replace(/<[^>]*>/g, "")
  .replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return namedEntities.get(entity.toLowerCase()) ?? match;
  })
  .replace(/\s+/g, " ")
  .trim();

const authorName = (creator) => plainText(
  creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(" ")
);

const getYear = (date = "") => String(date).match(/\b(?:19|20)\d{2}\b/)?.[0] ?? "";

async function fetchCollectionItems() {
  const items = [];
  let collectionVersion = "";

  for (let start = 0; ; start += 100) {
    const url = new URL(`${apiRoot}/collections/${collectionKey}/items/top`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("start", String(start));
    url.searchParams.set("include", "data");
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Zotero API returned ${response.status} for ${url.pathname}`);
    collectionVersion = response.headers.get("last-modified-version") || collectionVersion;
    const page = await response.json();
    items.push(...page);
    if (page.length < 100) break;
  }

  return { collectionVersion, items };
}

function normalizeRecord(item, topicByTag) {
  const data = item.data ?? item;
  const tags = [...new Set((data.tags ?? []).map(({ tag }) => plainText(tag)).filter(Boolean))];
  const primaryTags = themes.filter(({ sourceTag }) => tags.includes(sourceTag));
  if (primaryTags.length !== 1) {
    throw new Error(`${data.key} must have exactly one primary AI+Protein topic tag; found ${primaryTags.length}`);
  }

  const doi = plainText(data.DOI).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  const authors = (data.creators ?? [])
    .filter(({ creatorType }) => creatorType === "author")
    .map(authorName)
    .filter(Boolean);
  const venue = plainText(
    data.publicationTitle || data.proceedingsTitle || data.conferenceName || data.repository || ""
  );
  const topic = topicByTag.get(primaryTags[0].sourceTag);

  return {
    id: `zotero-${String(data.key).toLowerCase()}`,
    zoteroKey: data.key,
    itemType: data.itemType,
    title: plainText(data.title),
    date: plainText(data.date),
    year: getYear(data.date),
    authors,
    venue,
    doi,
    url: doi ? `https://doi.org/${doi}` : plainText(data.url),
    theme: topic.id,
    topics: [topic.id],
    tags: tags.filter((tag) => tag !== reviewTag)
  };
}

const previous = await readFile(output, "utf8").then(JSON.parse).catch((error) => {
  if (error.code === "ENOENT") return { records: [] };
  throw error;
});
const { collectionVersion, items } = await fetchCollectionItems();
const excludedReviews = items.filter((item) =>
  (item.data?.tags ?? []).some(({ tag }) => tag === reviewTag)
);
const includedItems = items.filter((item) => !excludedReviews.includes(item));
const topicByTag = new Map(themes.map((topic) => [topic.sourceTag, topic]));
const records = includedItems.map((item) => normalizeRecord(item, topicByTag));
const previousByKey = new Map(previous.records.map((record) => [record.zoteroKey, record]));
const currentKeys = new Set(records.map((record) => record.zoteroKey));
if (currentKeys.size !== records.length) throw new Error("Zotero returned duplicate record keys; snapshot not written");
const added = records.filter((record) => !previousByKey.has(record.zoteroKey));
const removed = previous.records.filter((record) => !currentKeys.has(record.zoteroKey));
const moved = records.filter((record) => previousByKey.has(record.zoteroKey) && previousByKey.get(record.zoteroKey).theme !== record.theme);

records.sort((a, b) =>
  Number(b.year || 0) - Number(a.year || 0)
  || a.title.localeCompare(b.title, "en", { sensitivity: "base" })
  || a.zoteroKey.localeCompare(b.zoteroKey)
);

const topicCounts = new Map(themes.map(({ id }) => [id, 0]));
for (const record of records) topicCounts.set(record.theme, topicCounts.get(record.theme) + 1);

const topics = [
  {
    id: "all",
    sourceTag: null,
    label: "AI + Protein",
    tone: "neutral",
    x: 50,
    y: 50,
    mobileX: 50,
    mobileY: 10,
    count: records.length
  },
  ...themes.map((topic) => ({ ...topic, count: topicCounts.get(topic.id) }))
];

const edges = themes.map((topic) => ({
  source: "all",
  target: topic.id,
  relation: "collection topic",
  count: topicCounts.get(topic.id)
}));

const snapshot = {
  source: {
    provider: "Zotero",
    collection: collectionName,
    collectionKey,
    snapshotDate: new Date().toISOString().slice(0, 10),
    collectionVersion,
    totalItems: items.length,
    includedItems: records.length,
    excludedReviewCount: excludedReviews.length,
    exclusionRule: `Exclude records carrying the Zotero tag “${reviewTag}”.`,
    excludedReviewKeys: excludedReviews.map((item) => item.key).sort()
  },
  topics,
  edges,
  records
};

await writeFile(temporaryOutput, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
try {
  await rename(temporaryOutput, output);
} catch (error) {
  await unlink(temporaryOutput).catch(() => {});
  throw error;
}

process.stdout.write(
  `Synced ${records.length} non-review records from Zotero collection ${collectionName}; excluded ${excludedReviews.length} reviews.\n`
);
for (const record of added) process.stdout.write(`Added ${record.zoteroKey}: ${record.title}\n`);
for (const record of removed) process.stdout.write(`Removed ${record.zoteroKey}: ${record.title}\n`);
for (const record of moved) process.stdout.write(`Moved ${record.zoteroKey}: ${previousByKey.get(record.zoteroKey).theme} -> ${record.theme}\n`);
process.stdout.write(`Changes: ${added.length} added, ${removed.length} removed, ${moved.length} topic transfers.\n`);
