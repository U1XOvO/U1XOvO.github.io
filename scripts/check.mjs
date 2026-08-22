import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const projects = await readJson("data/projects.json");
const literature = await readJson("data/literature.json");
const literatureFeaturedVenues = await readJson("data/literature-featured-venues.json");
const papers = await readJson("data/papers.json");
const acgn = await readJson("data/acgn.json");
const profile = await readJson("data/profile.json");
const anime = acgn.anime;
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;")
  .replaceAll("'", "&#039;");

assert.ok(Array.isArray(projects.projects), "projects.json must contain a projects array");
for (const project of projects.projects) {
  for (const field of ["id", "title", "status", "description", "url"]) assert.ok(project[field], `project missing ${field}`);
  assert.ok(Array.isArray(project.tags), `${project.id} tags must be an array`);
  assert.ok(Array.isArray(project.highlights), `${project.id} highlights must be an array`);
  assert.match(project.url, /^https:\/\/github\.com\/[^/]+\/[^/]+$/, `${project.id} must link to a GitHub repository`);
}

assert.ok(Array.isArray(literature.topics), "literature.json topics must be an array");
assert.ok(Array.isArray(literature.edges), "literature.json edges must be an array");
assert.ok(Array.isArray(literature.records), "literature.json records must be an array");
assert.equal(literatureFeaturedVenues.id, "cns-major-family", "featured literature venue policy must have a stable id");
assert.ok(literatureFeaturedVenues.label, "featured literature venue policy must have a label");
assert.ok(Array.isArray(literatureFeaturedVenues.venues) && literatureFeaturedVenues.venues.length > 0, "featured literature venues must be a non-empty array");
assert.equal(new Set(literatureFeaturedVenues.venues).size, literatureFeaturedVenues.venues.length, "featured literature venues must be unique");
assert.ok(literature.source && typeof literature.source === "object", "literature.json must contain Zotero source metadata");
for (const field of ["provider", "collection", "collectionKey", "snapshotDate", "collectionVersion", "totalItems", "includedItems", "excludedReviewCount", "exclusionRule", "excludedReviewKeys"]) {
  assert.ok(Object.hasOwn(literature.source, field), `literature source missing ${field}`);
}
assert.equal(literature.source.provider, "Zotero", "literature source must be Zotero");
assert.match(literature.source.collectionKey, /^[A-Z0-9]{8}$/, "literature collection key must be a Zotero collection key");
assert.match(literature.source.snapshotDate, /^\d{4}-\d{2}-\d{2}$/, "literature snapshot date must use YYYY-MM-DD");
assert.ok(Array.isArray(literature.source.excludedReviewKeys), "excludedReviewKeys must be an array");
assert.equal(new Set(literature.source.excludedReviewKeys).size, literature.source.excludedReviewKeys.length, "excluded review keys must be unique");
assert.equal(literature.source.excludedReviewKeys.length, literature.source.excludedReviewCount, "excluded review count must match excludedReviewKeys");
assert.equal(literature.source.includedItems, literature.records.length, "included item count must match literature records");
assert.equal(literature.source.totalItems, literature.source.includedItems + literature.source.excludedReviewCount, "total Zotero items must equal included records plus excluded reviews");
assert.match(literature.source.exclusionRule, /Review/, "literature exclusion rule must name the Review tag");

const topicIds = new Set(literature.topics.map((topic) => topic.id));
assert.equal(topicIds.size, literature.topics.length, "literature topic ids must be unique");
const topicTones = new Set(["pink", "blue", "green", "purple"]);
for (const topic of literature.topics) {
  for (const field of ["id", "label", "tone", "x", "y", "mobileX", "mobileY", "count"]) {
    assert.ok(Object.hasOwn(topic, field), `literature topic missing ${field}`);
  }
  assert.ok(topicTones.has(topic.tone), `${topic.id} has an unknown tone`);
  for (const coordinate of ["x", "y", "mobileX", "mobileY"]) {
    assert.ok(Number.isFinite(topic[coordinate]) && topic[coordinate] >= 0 && topic[coordinate] <= 100, `${topic.id} ${coordinate} must be between 0 and 100`);
  }
  assert.ok(Number.isInteger(topic.count) && topic.count >= 0, `${topic.id} count must be a non-negative integer`);
}
const allTopic = literature.topics.find(({ id }) => id === "all");
assert.ok(allTopic, "literature topics must contain an all hub");
assert.equal(allTopic.count, literature.records.length, "all topic count must match literature records");

const edgeIds = new Set();
for (const edge of literature.edges) {
  for (const field of ["source", "target", "relation", "count"]) assert.ok(Object.hasOwn(edge, field), `literature edge missing ${field}`);
  assert.ok(topicIds.has(edge.source), `unknown literature edge source: ${edge.source}`);
  assert.ok(topicIds.has(edge.target), `unknown literature edge target: ${edge.target}`);
  assert.notEqual(edge.source, edge.target, `literature edge cannot be a self-loop: ${edge.source}`);
  assert.ok(Number.isInteger(edge.count) && edge.count > 0, `${edge.source} -> ${edge.target} count must be positive`);
  const edgeId = `${edge.source}->${edge.target}`;
  assert.ok(!edgeIds.has(edgeId), `duplicate literature edge: ${edgeId}`);
  edgeIds.add(edgeId);
}

const recordIds = new Set();
const zoteroKeys = new Set();
const normalizedTitles = new Set();
const dois = new Set();
const excludedReviewKeys = new Set(literature.source.excludedReviewKeys);
const itemTypes = new Set(["journalArticle", "preprint", "conferencePaper"]);
for (const record of literature.records) {
  for (const field of ["id", "zoteroKey", "itemType", "title", "date", "year", "authors", "venue", "doi", "url", "theme", "topics", "tags"]) {
    assert.ok(Object.hasOwn(record, field), `literature record missing ${field}`);
  }
  assert.ok(!recordIds.has(record.id), `duplicate literature record id: ${record.id}`);
  assert.ok(!zoteroKeys.has(record.zoteroKey), `duplicate Zotero key: ${record.zoteroKey}`);
  recordIds.add(record.id);
  zoteroKeys.add(record.zoteroKey);
  assert.match(record.zoteroKey, /^[A-Z0-9]{8}$/, `${record.id} must contain a Zotero item key`);
  assert.equal(record.id, `zotero-${record.zoteroKey.toLowerCase()}`, `${record.zoteroKey} must have a stable record id`);
  assert.ok(!excludedReviewKeys.has(record.zoteroKey), `${record.zoteroKey} is both included and excluded`);
  assert.ok(itemTypes.has(record.itemType), `${record.zoteroKey} has an unexpected item type`);
  assert.ok(record.title.trim(), `${record.zoteroKey} title must not be empty`);
  assert.doesNotMatch(record.title, /<[^>]+>/, `${record.zoteroKey} title must be plain text`);
  assert.match(record.year, /^(?:19|20)\d{2}$/, `${record.zoteroKey} year must use YYYY`);
  assert.ok(Array.isArray(record.authors), `${record.zoteroKey} authors must be an array`);
  assert.ok(Array.isArray(record.topics) && record.topics.length === 1, `${record.zoteroKey} must belong to exactly one primary topic`);
  assert.deepEqual(record.topics, [record.theme], `${record.zoteroKey} theme and topics must agree`);
  assert.ok(topicIds.has(record.theme) && record.theme !== "all", `${record.zoteroKey} must reference a non-hub topic`);
  assert.ok(Array.isArray(record.tags), `${record.zoteroKey} tags must be an array`);
  assert.ok(!record.tags.includes("Review"), `${record.zoteroKey} must not carry the excluded Review tag`);
  const sourceTag = literature.topics.find(({ id }) => id === record.theme)?.sourceTag;
  assert.ok(record.tags.includes(sourceTag), `${record.zoteroKey} must retain its Zotero primary topic tag`);
  if (record.doi) {
    const normalizedDoi = record.doi.toLowerCase();
    assert.ok(!dois.has(normalizedDoi), `duplicate DOI: ${record.doi}`);
    dois.add(normalizedDoi);
    assert.equal(record.url, `https://doi.org/${record.doi}`, `${record.zoteroKey} must use its canonical DOI URL`);
  } else if (record.url) {
    assert.match(record.url, /^https?:\/\//, `${record.zoteroKey} fallback URL must be HTTP(S)`);
  }
  const normalizedTitle = record.title.normalize("NFKC").toLowerCase();
  assert.ok(!normalizedTitles.has(normalizedTitle), `duplicate normalized title: ${record.title}`);
  normalizedTitles.add(normalizedTitle);
}

const nonHubTopics = literature.topics.filter(({ id }) => id !== "all");
assert.equal(nonHubTopics.reduce((sum, topic) => sum + topic.count, 0), literature.records.length, "topic counts must partition all literature records");
for (const topic of nonHubTopics) {
  assert.equal(literature.records.filter(({ theme }) => theme === topic.id).length, topic.count, `${topic.id} count must match its records`);
}
assert.ok(Array.isArray(acgn.shelves), "acgn.json must contain a shelves array");
for (const shelf of acgn.shelves) {
  for (const field of ["id", "label", "title", "tone"]) assert.ok(shelf[field], `ACGN shelf missing ${field}`);
  assert.ok(Array.isArray(shelf.items), `${shelf.id} items must be an array`);
}
assert.ok(acgn.steam && typeof acgn.steam === "object", "acgn.json must contain Steam library metadata");
for (const field of ["source", "sourceUrl", "checkedOn"]) {
  assert.ok(acgn.steam[field], `Steam metadata missing ${field}`);
}
assert.equal(acgn.steam.sourceUrl, "https://steamcommunity.com/id/U1X0217/games/?tab=all", "Steam source URL must match the provided public games page");
assert.match(acgn.steam.checkedOn, /^\d{4}-\d{2}-\d{2}$/, "Steam checkedOn must be an ISO date");
assert.ok(acgn.steam.profile && typeof acgn.steam.profile === "object", "Steam profile metadata must be present");
for (const field of ["source", "sourceUrl", "checkedOn", "handle", "screenshot", "screenshotMobile", "screenshotAlt", "screenshotWidth", "screenshotHeight", "screenshotMobileWidth", "screenshotMobileHeight"]) {
  assert.ok(acgn.steam.profile[field], `Steam profile metadata missing ${field}`);
}
assert.equal(acgn.steam.profile.sourceUrl, "https://steamcommunity.com/id/U1X0217/", "Steam profile URL must match the provided public profile");
assert.match(acgn.steam.profile.checkedOn, /^\d{4}-\d{2}-\d{2}$/, "Steam profile checkedOn must be an ISO date");
assert.equal(acgn.steam.profile.handle, "U1X0217", "Steam profile handle must match the public profile URL");
assert.equal(acgn.steam.profile.screenshot, "/images/steam-profile-header.png", "Steam profile screenshot must use the local canonical path");
assert.equal(acgn.steam.profile.screenshotMobile, "/images/steam-profile-header-mobile.png", "Steam profile mobile screenshot must use the local canonical path");
assert.match(acgn.steam.profile.screenshotAlt, /\S/, "Steam profile screenshot needs meaningful alternative text");
for (const field of ["screenshotWidth", "screenshotHeight", "screenshotMobileWidth", "screenshotMobileHeight"]) {
  assert.ok(Number.isInteger(acgn.steam.profile[field]) && acgn.steam.profile[field] > 0, `Steam profile ${field} must be a positive integer`);
}
await access(path.join(root, "public", acgn.steam.profile.screenshot.slice(1)));
await access(path.join(root, "public", acgn.steam.profile.screenshotMobile.slice(1)));
assert.ok(Array.isArray(acgn.steam.games), "Steam games must be an array");
assert.ok(acgn.steam.games.length > 0, "Steam games must not be empty");
assert.equal(acgn.steam.totalGames, acgn.steam.games.length, "Steam game count must match the game array");
const steamGameIds = new Set();
for (const game of acgn.steam.games) {
  for (const field of ["appid", "name", "image", "imageAlt"]) assert.ok(game[field], `Steam game missing ${field}`);
  assert.ok(Number.isInteger(game.appid) && game.appid > 0, `${game.name} must have a positive Steam app ID`);
  assert.ok(!steamGameIds.has(game.appid), `duplicate Steam app ID: ${game.appid}`);
  steamGameIds.add(game.appid);
  assert.equal(game.image, `/images/steam/${game.appid}.jpg`, `${game.name} must use its local Steam cover`);
  await access(path.join(root, "public", game.image.slice(1)));
}
assert.ok(acgn.nintendoSwitch && typeof acgn.nintendoSwitch === "object", "acgn.json must contain Nintendo Switch library metadata");
for (const field of ["source", "sourceUrl", "checkedOn"]) {
  assert.ok(acgn.nintendoSwitch[field], `Nintendo Switch metadata missing ${field}`);
}
assert.equal(acgn.nintendoSwitch.sourceUrl, "https://web.xiaoheihe.cn/account/switch_bind/home?userid=10708519&is_share=1", "Nintendo Switch source URL must match the provided share page");
assert.match(acgn.nintendoSwitch.checkedOn, /^\d{4}-\d{2}-\d{2}$/, "Nintendo Switch checkedOn must be an ISO date");
assert.ok(Array.isArray(acgn.nintendoSwitch.games), "Nintendo Switch games must be an array");
assert.ok(acgn.nintendoSwitch.games.length > 0, "Nintendo Switch games must not be empty");
assert.equal(acgn.nintendoSwitch.totalGames, acgn.nintendoSwitch.games.length, "Nintendo Switch game count must match the game array");
const switchGameIds = new Set();
for (const game of acgn.nintendoSwitch.games) {
  for (const field of ["id", "name", "image", "imageAlt"]) assert.ok(game[field], `Nintendo Switch game missing ${field}`);
  assert.match(game.id, /^[0-9A-F]{16}$/, `${game.name} must have a Nintendo title ID`);
  assert.ok(!switchGameIds.has(game.id), `duplicate Nintendo Switch title ID: ${game.id}`);
  switchGameIds.add(game.id);
  assert.equal(game.image, `/images/nintendo-switch/${game.id}.webp`, `${game.name} must use its local Nintendo Switch cover`);
  await access(path.join(root, "public", game.image.slice(1)));
}
assert.ok(profile.avatar === "/images/github-avatar.jpg", "profile avatar must use the local GitHub image");
assert.ok(Array.isArray(profile.details) && profile.details.length > 0, "profile.json must contain detail placeholders");
for (const detail of profile.details) assert.ok(detail.label, "profile detail missing label");
assert.ok(anime && typeof anime === "object", "acgn.json must contain anime collection data");
for (const field of ["title", "description", "favoritesHeading"]) {
  assert.ok(anime[field], `anime collection missing ${field}`);
}
assert.ok(anime.deity && typeof anime.deity === "object", "anime collection must contain a deity section");
for (const field of ["heading", "title"]) assert.ok(anime.deity[field], `anime deity section missing ${field}`);
assert.equal(anime.title, "アニメ", "anime page title must use the requested Japanese wording");
assert.equal(anime.deity.heading, "唯一真神！", "anime deity heading must preserve the requested Chinese wording and emphasis");
assert.ok(!Object.hasOwn(anime, "favoritesDescription"), "anime favorites description must remain removed");
assert.ok(!Object.hasOwn(anime.deity, "description"), "anime deity description must remain removed");
assert.ok(Array.isArray(anime.deity.works) && anime.deity.works.length === 7, "Prisma Illya deity section must contain seven individual works");
assert.ok(Array.isArray(anime.favorites) && anime.favorites.length > 0, "anime favorites must not be empty");
const animeTones = new Set(["pink", "blue", "green", "purple"]);
const animeWorks = [...anime.deity.works, ...anime.favorites];
const animeIds = new Set();
for (const collection of [anime.deity.works, anime.favorites]) {
  for (let index = 1; index < collection.length; index += 1) {
    assert.ok(collection[index - 1].firstReleased <= collection[index].firstReleased, "anime works must be stored in first-release order");
  }
}
for (const work of animeWorks) {
  for (const field of ["id", "title", "firstReleased", "tone", "image", "anilistId", "coverSource", "coverCheckedOn"]) {
    assert.ok(work[field], `${work.id || "anime work"} missing ${field}`);
  }
  assert.match(work.id, /^[a-z0-9-]+$/, `${work.title} needs a stable lowercase id`);
  assert.ok(!animeIds.has(work.id), `duplicate anime id: ${work.id}`);
  animeIds.add(work.id);
  assert.match(work.firstReleased, /^\d{4}-\d{2}-\d{2}$/, `${work.title} firstReleased must use YYYY-MM-DD`);
  assert.ok(Number.isFinite(Date.parse(`${work.firstReleased}T00:00:00Z`)), `${work.title} has an invalid firstReleased date`);
  assert.ok(animeTones.has(work.tone), `${work.title} has an unknown anime tone`);
  assert.ok(Number.isInteger(work.anilistId) && work.anilistId > 0, `${work.title} needs a positive AniList ID`);
  assert.match(work.image, new RegExp(`^/images/anime/${work.id}\\.(?:png|jpe?g|webp)$`), `${work.title} must use its local anime cover`);
  assert.match(work.coverSource, /^https:\/\//, `${work.title} needs a cover source URL`);
  assert.match(work.coverCheckedOn, /^\d{4}-\d{2}-\d{2}$/, `${work.title} coverCheckedOn must use YYYY-MM-DD`);
  await access(path.join(root, "public", work.image.slice(1)));
}
assert.ok(animeIds.has("fate-stay-night-2006"), "anime favorites must include Fate/stay night");
assert.ok(animeIds.has("fate-zero"), "anime favorites must include Fate/Zero separately");
assert.ok(!Object.hasOwn(acgn, "virtualLiver"), "removed virtual-liver collection data must not remain");
assert.ok(Array.isArray(papers.papers), "papers.json must contain a papers array");
assert.ok(papers.journalMetrics && typeof papers.journalMetrics === "object", "papers.json must contain journalMetrics");
for (const [venue, metrics] of Object.entries(papers.journalMetrics)) {
  for (const field of ["asOf", "impactFactor", "fiveYearImpactFactor", "source", "sourceUrl", "checkedOn"]) {
    assert.ok(metrics[field], `${venue} journal metrics missing ${field}`);
  }
}
for (const paper of papers.papers) {
  for (const field of ["id", "title", "year", "venue", "citation", "doi", "url", "image", "imageAlt", "imageCredit"]) {
    assert.ok(paper[field], `paper missing ${field}`);
  }
  assert.ok(Array.isArray(paper.authors) && paper.authors.length > 0, `${paper.id} authors must be a non-empty array`);
  assert.ok(paper.authors.includes(paper.highlightAuthor), `${paper.id} highlighted author must appear in authors`);
  assert.ok(papers.journalMetrics[paper.venue], `${paper.id} missing journal metrics for ${paper.venue}`);
}

const files = await readdir(dist, { recursive: true });
const htmlFiles = files.filter((file) => file.endsWith(".html")).sort();
assert.deepEqual(htmlFiles, ["404.html", "acgn/index.html", "anime/index.html", "index.html", "library/index.html", "paper/index.html", "projects/index.html"], "expected six routes plus 404.html");

const linkPattern = /(?:href|src)="([^"]+)"/g;
const missing = [];
for (const relativeHtml of htmlFiles) {
  const absoluteHtml = path.join(dist, relativeHtml);
  const html = await readFile(absoluteHtml, "utf8");
  assert.match(html, /<meta name="description" content="[^"]+">/, `${relativeHtml} needs a description`);
  assert.match(html, /<link rel="canonical" href="https:\/\/u1xovo\.github\.io\//, `${relativeHtml} needs a canonical URL`);
  assert.doesNotMatch(html, /codex-preview|Starter Project|react-loading-skeleton/i, `${relativeHtml} contains starter metadata`);

  for (const match of html.matchAll(linkPattern)) {
    const reference = match[1].split("#")[0].split("?")[0];
    if (!reference || /^(?:https?:|mailto:|tel:|data:)/.test(reference)) continue;
    let target = reference.startsWith("/")
      ? path.join(dist, reference.slice(1))
      : path.resolve(path.dirname(absoluteHtml), reference);
    if (reference.endsWith("/")) target = path.join(target, "index.html");
    try {
      await access(target);
    } catch {
      missing.push(`${relativeHtml} -> ${reference}`);
    }
  }
}

assert.deepEqual(missing, [], `broken internal links:\n${missing.join("\n")}`);
const paperHtml = await readFile(path.join(dist, "paper", "index.html"), "utf8");
const acgnHtml = await readFile(path.join(dist, "acgn", "index.html"), "utf8");
const animeHtml = await readFile(path.join(dist, "anime", "index.html"), "utf8");
const homeHtml = await readFile(path.join(dist, "index.html"), "utf8");
const libraryHtml = await readFile(path.join(dist, "library", "index.html"), "utf8");
assert.doesNotMatch(homeHtml, /class="profile-github"/, "homepage profile header must not render the GitHub handle row");
assert.match(homeHtml, /<footer class="site-footer shell">[\s\S]*?<a href="https:\/\/github\.com\/U1XOvO"/, "footer must retain the GitHub link");
assert.match(libraryHtml, /<section class="graph-section"/, "Literature page must render the knowledge graph section");
assert.match(libraryHtml, /<body class="page-library">/, "Literature page must expose its page class for scoped scrolling performance styles");
assert.match(acgnHtml, /<h1>Gamer<\/h1>/, "Gamer page must render its page title");
assert.match(acgnHtml, /<body class="page-acgn">/, "Gamer page must expose its page class for scoped performance styles");
assert.equal((acgnHtml.match(/data-steam-profile/g) || []).length, 1, "Gamer page must render one Steam profile card");
assert.match(acgnHtml, /<h2 class="sr-only" id="steam-profile-title">@U1X0217 Steam profile<\/h2>/, "Steam profile screenshot needs an accessible title");
assert.match(acgnHtml, /<a class="steam-profile-card steam-profile-screenshot-link" href="https:\/\/steamcommunity\.com\/id\/U1X0217\/" rel="noreferrer" aria-label="Open @U1X0217 on Steam Community">/, "Steam profile screenshot must link to the provided public profile");
assert.match(acgnHtml, /<source media="\(max-width: 680px\)" srcset="\/images\/steam-profile-header-mobile\.png">/, "Steam profile screenshot must provide the mobile crop");
assert.match(acgnHtml, /<img src="\/images\/steam-profile-header\.png" alt="Steam Community profile header with an anime avatar, profile name, level badge, and illustrated background" width="2080" height="465" decoding="async">/, "Steam profile screenshot must use the local verified image");
assert.doesNotMatch(acgnHtml, /steam-profile-(?:emblem|copy|actions|library|link)|games in library/, "Steam profile text card must be replaced by the screenshot");
assert.ok(acgnHtml.indexOf("data-steam-profile") < acgnHtml.indexOf('id="steam-games-title"'), "Steam profile card must render above Steam games");
assert.match(acgnHtml, /<h2 class="game-platform-title steam-platform-title"[^>]*>Steam Games<\/h2>/, "Gamer page must emphasize Steam Games");
assert.match(acgnHtml, /Steam Games[\s\S]*Nintendo Switch/, "Steam games must render above Nintendo Switch games");
assert.equal((acgnHtml.match(/class="game-card steam-game-card"/g) || []).length, acgn.steam.games.length, "rendered Steam card count must match its data");
assert.equal((acgnHtml.match(/class="game-card switch-game-card"/g) || []).length, acgn.nintendoSwitch.games.length, "rendered Nintendo Switch card count must match its data");
assert.match(homeHtml, /<a href="\/acgn\/">Gamer<\/a><a href="\/anime\/">にじげん<\/a>/, "primary navigation must end with Gamer and にじげん");
assert.match(animeHtml, /<html lang="ja">/, "Anime page must declare Japanese document language");
assert.match(animeHtml, /<nav class="site-nav" id="site-nav" lang="en" aria-label="Primary navigation"><a href="\/">Home<\/a><a href="\/projects\/">Projects<\/a><a href="\/library\/">Literature<\/a><a href="\/paper\/">Paper<\/a><a href="\/acgn\/">Gamer<\/a><a href="\/anime\/" aria-current="page">にじげん<\/a><\/nav>/, "Anime page navigation must keep English shared labels and the にじげん route label");
const nijigenSubnavigation = '<nav class="nijigen-subnav" aria-label="にじげんのカテゴリ"><a href="/anime/" aria-current="page">アニメ</a></nav>';
assert.ok(animeHtml.includes(nijigenSubnavigation), "Anime page must retain the single-entry にじげん subnavigation");
assert.match(animeHtml, /<nav class="site-nav" id="site-nav" lang="en" aria-label="Primary navigation">[\s\S]*?<a href="\/anime\/" aria-current="page">にじげん<\/a><\/nav>/, "Anime page must keep the parent にじげん link active in the shared navigation");
assert.match(animeHtml, /<h1>アニメ<\/h1>/, "Anime page must render its Japanese title");
assert.doesNotMatch(animeHtml, /\/manga\/|\/virtual-liver\/|漫畫|バーチャルライバー/, "Anime subnavigation must not retain removed category entries");
assert.match(animeHtml, /<h2 id="anime-deity-title">Fate\/kaleid liner プリズマ☆イリヤ<\/h2>/, "Anime page must render the Prisma Illya deity collection");
assert.match(animeHtml, /唯一真神！/, "Anime page must render the requested deity heading");
assert.match(animeHtml, /<h2 id="anime-favorites-title">お気に入り<\/h2>/, "Anime page must render its Japanese favorites heading");
assert.doesNotMatch(animeHtml, /<h1>Anime<\/h1>|Explore U1X's anime collection\.|No content yet|Content will be added later\.|初公開日順。同じ作品の複数シーズンはひとつにまとめています|『プリズマ☆イリヤ』だけは、各作品をひとつずつ並べています。/, "Anime page must omit removed explanatory copy");
const renderedAnimeIds = [...animeHtml.matchAll(/data-anime-id="([^"]+)"/g)].map((match) => match[1]);
const orderedAnimeIds = (works) => [...works]
  .sort((left, right) => left.firstReleased.localeCompare(right.firstReleased) || left.id.localeCompare(right.id, "ja"))
  .map(({ id }) => id);
assert.deepEqual(renderedAnimeIds, [...orderedAnimeIds(anime.deity.works), ...orderedAnimeIds(anime.favorites)], "rendered anime cards must follow first-release order");
assert.equal((animeHtml.match(/anime-deity-card/g) || []).length, anime.deity.works.length, "rendered deity card count must match data");
assert.equal((animeHtml.match(/<article class="anime-card(?:\s|")/g) || []).length, animeWorks.length, "rendered anime card count must match data");
for (const work of animeWorks) {
  const source = escapeRegExp(work.image);
  const alt = escapeRegExp(escapeHtml(`『${work.title}』のキービジュアル`));
  assert.match(animeHtml, new RegExp(`<img src="${source}" alt="${alt}" loading="lazy" decoding="async">`), `${work.title} must render its local Japanese-alt cover`);
}
const styles = await readFile(path.join(root, "public", "styles.css"), "utf8");
assert.match(styles, /\.anime-grid\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s, "favorite Anime grid must use six desktop columns");
assert.match(styles, /\.nijigen-subnav\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/s, "にじげん subnavigation must remain responsive");
assert.doesNotMatch(styles, /\.virtual-liver-/, "removed virtual-liver styles must not remain");
assert.match(styles, /\.anime-deity-grid\s*\{[^}]*grid-template-columns:\s*repeat\(8,\s*minmax\(0,\s*1fr\)\)/s, "Prisma Illya grid must use paired tracks for four desktop cards per row");
assert.match(styles, /\.anime-deity-card\s*\{[^}]*grid-column:\s*span 2/s, "Prisma Illya cards must span two tracks");
assert.match(styles, /\.anime-deity-card:nth-child\(5\)\s*\{[^}]*grid-column:\s*2\s*\/\s*span 2/s, "the three-card Prisma Illya second row must be centered");
assert.match(styles, /\.anime-deity-heading\s*\{[^}]*text-align:\s*center/s, "Prisma Illya section heading must be centered");
assert.match(styles, /\.anime-deity-heading\s*\{[^}]*--anime-deity-heading-size:\s*clamp\(1\.9rem,\s*4\.3vw,\s*3\.65rem\)/s, "Prisma Illya heading must define a shared desktop title size");
assert.match(styles, /\.anime-deity-heading\s*>\s*\.anime-deity-label\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*color:\s*#c56b75;[^}]*font-size:\s*var\(--anime-deity-heading-size\);[^}]*text-align:\s*center/s, "Prisma Illya label must override generic paragraph styles with a centered soft-red title treatment");
assert.match(styles, /\.anime-deity-heading h2\s*\{[^}]*font-size:\s*var\(--anime-deity-heading-size\)/s, "Prisma Illya label and title must share one font size");
assert.match(styles, /\.anime-deity-card \.anime-card-content\s*\{[^}]*align-items:\s*center;[^}]*text-align:\s*center/s, "Prisma Illya card text must be centered");
const animeCoverRule = styles.match(/\.anime-cover img\s*\{([^}]*)\}/)?.[1] || "";
assert.match(animeCoverRule, /height:\s*auto/, "anime covers must preserve their native height");
assert.doesNotMatch(animeCoverRule, /object-fit/, "anime covers must not crop their native aspect ratio");
assert.match(libraryHtml, /<section class="reading-section"/, "Literature page must render the reading list section");
assert.equal((libraryHtml.match(/<section class=/g) || []).length, 2, "Literature page must contain exactly two content sections");
assert.equal((libraryHtml.match(/<button class="graph-node/g) || []).length, literature.topics.length, "rendered graph node count must match literature topics");
assert.equal((libraryHtml.match(/<button class="graph-paper-node/g) || []).length, literature.records.length, "rendered paper node count must match literature records");
assert.equal((libraryHtml.match(/class="graph-edge graph-paper-edge/g) || []).length, literature.records.length, "rendered paper edge count must match literature records");
assert.equal((libraryHtml.match(/class="reading-list-item"/g) || []).length, literature.records.length, "rendered reading list count must match literature records");
for (const record of literature.records) {
  assert.ok(libraryHtml.includes(`data-paper-record="${record.id}"`), `${record.id} must have a graph paper node`);
  assert.ok(libraryHtml.includes(`id="reading-${record.id}" tabindex="-1"`), `${record.id} must have a focusable reading target`);
}
const featuredRecordCount = literature.records.filter((record) => literatureFeaturedVenues.venues.includes(record.venue)).length;
assert.equal((libraryHtml.match(/graph-paper-node[^\"]* is-featured/g) || []).length, featuredRecordCount, "featured graph star count must match the venue policy");
assert.equal((libraryHtml.match(/class="reading-featured"/g) || []).length, featuredRecordCount, "featured reading-card star count must match the venue policy");
assert.match(libraryHtml, /data-reading-search-input/, "Literature page must render reading search");
assert.match(libraryHtml, /data-reading-sort/, "Literature page must render reading sort controls");
assert.match(libraryHtml, /aria-live="polite" data-reading-status/, "Literature page must expose reading results to assistive technology");
assert.doesNotMatch(libraryHtml, /Knowledge graph|A topic map derived from the five mutually exclusive tags used in the Zotero collection|Reading list|Every non-review record in the Zotero|reviews excluded/i, "Literature page must omit removed headings and descriptions");
assert.doesNotMatch(libraryHtml, /How artificial intelligence is reengineering protein engineering|Generative AI for controllable protein sequence design: A survey|AI-driven protein design|Machine learning for functional protein design|Advances in Machine Learning Models for Predicting Enzyme Kinetic Parameters|Harnessing Machine Learning for Enzyme Enantioselectivity/, "Literature page must not render excluded reviews");
const paperCardBodies = [...paperHtml.matchAll(/<article class="paper-card">([\s\S]*?)<\/article>/g)].map((match) => match[1]);
assert.equal(paperCardBodies.length, papers.papers.length, "rendered paper card count must match papers.json");
for (const [index, cardBody] of paperCardBodies.entries()) {
  assert.equal((cardBody.match(/<a\b/g) || []).length, 1, `${papers.papers[index].id} paper card must contain exactly one link`);
  assert.match(cardBody, /<a class="text-link"[^>]*>View publication /, `${papers.papers[index].id} paper card link must be View publication`);
  const metrics = papers.journalMetrics[papers.papers[index].venue];
  assert.match(cardBody, new RegExp(`<span>IF<\\/span><strong>${metrics.impactFactor.replace(".", "\\.")}<\\/strong>`), `${papers.papers[index].id} missing current IF`);
  assert.match(cardBody, new RegExp(`<span>5Y IF<\\/span><strong>${metrics.fiveYearImpactFactor.replace(".", "\\.")}<\\/strong>`), `${papers.papers[index].id} missing current 5Y IF`);
}
await access(path.join(dist, "images", "og.png"));
await access(path.join(dist, "images", "favicon.svg"));
await access(path.join(dist, "images", "github-avatar.jpg"));
await access(path.join(dist, "data", "projects.json"));
await access(path.join(dist, ".nojekyll"));
await access(path.join(dist, "sitemap.xml"));
const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
assert.match(sitemap, /<loc>https:\/\/u1xovo\.github\.io\/anime\/<\/loc>/, "Anime route must be listed in the sitemap");
assert.doesNotMatch(sitemap, /\/manga\/|\/virtual-liver\//, "removed category routes must not remain in the sitemap");

console.log(`Checked ${htmlFiles.length} HTML files, ${projects.projects.length} projects, ${literature.topics.length} literature topics, ${literature.records.length} literature records, ${papers.papers.length} papers, ${acgn.steam.games.length} Steam games, ${acgn.nintendoSwitch.games.length} Nintendo Switch games, and all internal links.`);
