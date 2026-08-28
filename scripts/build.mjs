import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const readJson = async (relativePath) => {
  const source = await readFile(path.join(root, relativePath), "utf8");
  return JSON.parse(source);
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const thumbnailVariant = (image, extension) => {
  const prefix = "/images/";
  const extensionIndex = image.lastIndexOf(".");
  if (!image.startsWith(prefix) || extensionIndex <= prefix.length) {
    throw new Error(`Thumbnail source must be a local image path: ${image}`);
  }
  return `/images/thumbnails/${image.slice(prefix.length, extensionIndex)}.${extension}`;
};

const thumbnailPicture = ({ image, alt }) => `<picture>
  <source type="image/avif" srcset="${escapeHtml(thumbnailVariant(image, "avif"))}">
  <source type="image/webp" srcset="${escapeHtml(thumbnailVariant(image, "webp"))}">
  <img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
</picture>`;

const site = await readJson("data/site.json");
const profile = await readJson("data/profile.json");
const projectsData = await readJson("data/projects.json");
const literature = await readJson("data/literature.json");
const literatureFeaturedVenues = await readJson("data/literature-featured-venues.json");
const papersData = await readJson("data/papers.json");
const acgn = await readJson("data/acgn.json");

const navigation = [
  ["/", { en: "Home", ja: "ホーム" }],
  ["/projects/", { en: "Projects", ja: "プロジェクト" }],
  ["/library/", { en: "Literature", ja: "文献" }],
  ["/paper/", { en: "Paper", ja: "論文" }],
  ["/acgn/", { en: "Gamer", ja: "ゲーム" }],
  ["/anime/", { en: "にじげん", ja: "にじげん" }]
];

const pageUi = {
  en: {
    skipLink: "Skip to content",
    brandLabel: "U1X home",
    navToggle: "Open navigation",
    navigationLabel: "Primary navigation"
  },
  ja: {
    skipLink: "本文へ移動",
    brandLabel: "U1X ホーム",
    navToggle: "メニューを開く",
    navigationLabel: "メインナビゲーション"
  }
};

function layout({ title, description, pathname, content, pageClass = "", language = site.language, navigationLanguage = language, navigationActivePath = pathname }) {
  const pageTitle = title ? `${title} · ${site.shortTitle}` : site.title;
  const canonical = new URL(pathname, site.url).href;
  const ui = pageUi[language] || pageUi.en;
  const navigationUi = pageUi[navigationLanguage] || pageUi.en;
  const nav = navigation
    .map(([href, labels]) => {
      const active = href === navigationActivePath;
      const label = labels[navigationLanguage] || labels.en;
      return `<a href="${href}"${active ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(language)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fffaf8">
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(pageTitle)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${site.url}/images/og.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${site.url}/images/og.png">
    <link rel="canonical" href="${canonical}">
    <link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
    <title>${escapeHtml(pageTitle)}</title>
  </head>
  <body${pageClass ? ` class="${escapeHtml(pageClass)}"` : ""}>
    <a class="skip-link" href="#main">${escapeHtml(ui.skipLink)}</a>
    <header class="site-header shell">
      <a class="brand" href="/" aria-label="${escapeHtml(ui.brandLabel)}">
        <span class="brand-mark" aria-hidden="true">U</span>
        <span>U1X<span class="brand-dot">.</span></span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
        <span></span><span></span><span></span><span class="sr-only">${escapeHtml(ui.navToggle)}</span>
      </button>
      <nav class="site-nav" id="site-nav" lang="${escapeHtml(navigationLanguage)}" aria-label="${escapeHtml(navigationUi.navigationLabel)}">${nav}</nav>
    </header>
    <main id="main">${content}</main>
    <footer class="site-footer shell">
      <p>© ${new Date().getFullYear()} ${escapeHtml(profile.name)}</p>
      <a href="${escapeHtml(profile.github)}" rel="noreferrer">GitHub ↗</a>
    </footer>
    <script type="module" src="/site.js"></script>
  </body>
</html>`;
}

const profileDetails = profile.details
  .map(({ label, value }) => `<div class="profile-detail${label === "Email" ? " profile-detail-email" : ""}">
    <dt>${escapeHtml(label)}</dt>
    <dd>${value ? escapeHtml(value) : '<span class="profile-placeholder">To be added</span>'}</dd>
  </div>`)
  .join("");

const home = layout({
  title: "",
  description: site.description,
  pathname: "/",
  content: `
    <section class="home-profile shell" aria-labelledby="profile-title">
      <a class="avatar-panel reveal" href="${escapeHtml(profile.github)}" rel="noreferrer" aria-label="Open ${escapeHtml(profile.handle)} on GitHub">
        <img src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(profile.handle)} GitHub avatar" width="1149" height="1149">
      </a>
      <div class="profile-information reveal reveal-delay">
        <p class="eyebrow">Personal profile</p>
        <h1 id="profile-title">${escapeHtml(profile.name)}</h1>
        <dl class="profile-details">${profileDetails}</dl>
      </div>
    </section>`
});

const pageTitle = (title, sizeClass = "") => `
  <header class="page-title${sizeClass ? ` ${sizeClass}` : ""} reveal">
    <h1>${escapeHtml(title)}</h1>
  </header>`;

const emptyState = () => `<div class="empty-state">
  <span aria-hidden="true">✦</span>
  <h2>No content yet</h2>
  <p>Content will be added later.</p>
</div>`;

const formatAnimeDate = (value) => {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
};

const orderAnimeWorks = (works) => [...works].sort((left, right) =>
  left.firstReleased.localeCompare(right.firstReleased) || left.id.localeCompare(right.id, "ja")
);

const animeCard = (work, variant = "") => `<article class="anime-card${variant ? ` ${variant}` : ""} tone-${escapeHtml(work.tone)}" data-anime-id="${escapeHtml(work.id)}">
  <div class="anime-cover">
    ${thumbnailPicture({ image: work.image, alt: `『${work.title}』のキービジュアル` })}
  </div>
  <div class="anime-card-content">
    <time class="anime-release" datetime="${escapeHtml(work.firstReleased)}">${escapeHtml(formatAnimeDate(work.firstReleased))}</time>
    <h3>${escapeHtml(work.title)}</h3>
  </div>
</article>`;

const projectCards = projectsData.projects.length ? projectsData.projects.map((project, index) => {
  const tagList = project.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const highlights = project.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const link = project.url
    ? `<a class="text-link" href="${escapeHtml(project.url)}"${project.url.startsWith("http") ? ' rel="noreferrer"' : ""}>View repository <span aria-hidden="true">↗</span></a>`
    : "";
  return `<article class="project-card tone-${["pink", "blue", "green"][index % 3]}">
    <div class="project-meta"><span>0${index + 1}</span><span>${escapeHtml(project.status)}</span></div>
    <h2>${escapeHtml(project.title)}</h2>
    <p>${escapeHtml(project.description)}</p>
    <div class="tag-list">${tagList}</div>
    <ul>${highlights}</ul>
    ${link}
  </article>`;
}).join("") : emptyState();

const projects = layout({
  title: "Projects",
  description: "Explore U1X's public GitHub projects in protein embeddings and enzyme kinetic parameter prediction.",
  pathname: "/projects/",
  content: `<div class="shell page-shell content-page-shell">
    ${pageTitle("Projects", "page-title-medium page-title-projects")}
    <section class="project-grid" aria-label="Project list">${projectCards}</section>
  </div>`
});

const topicById = new Map(literature.topics.map((topic) => [topic.id, topic]));
const featuredVenueNames = new Set(literatureFeaturedVenues.venues);
const featuredVenueLabel = literatureFeaturedVenues.label;
const featuredLiteratureCount = literature.records.filter(({ venue }) => featuredVenueNames.has(venue)).length;
const literatureYearCounts = literature.records.reduce((counts, { year }) => {
  counts.set(year, (counts.get(year) || 0) + 1);
  return counts;
}, new Map());
const literatureYears = [...literatureYearCounts.keys()].sort((a, b) => Number(b) - Number(a));
const readingYearOptions = [
  '<option value="">All years</option>',
  ...literatureYears.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)} (${literatureYearCounts.get(year)})</option>`)
].join("");
const readingYearMenuOptions = [
  { value: "", label: "All years", count: literature.records.length },
  ...literatureYears.map((year) => ({ value: year, label: year, count: literatureYearCounts.get(year) }))
].map(({ value, label, count }, index) => `<button class="reading-year-option" type="button" role="option" id="reading-year-option-${value || "all"}" data-reading-year-option="${escapeHtml(value)}" aria-selected="${index === 0}" tabindex="-1">
  <span class="reading-year-option-label">${escapeHtml(label)}</span>
  <span class="reading-year-option-count">${count}</span>
</button>`).join("");
const clampGraphCoordinate = (value) => Math.max(2.5, Math.min(97.5, value));
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const topicOrder = new Map(literature.topics.filter(({ id }) => id !== "all").map(({ id }, index) => [id, index]));
const recordIndexByTopic = new Map();

const paperPosition = (topic, index, total, mobile = false) => {
  const centerX = mobile ? topic.mobileX : topic.x;
  const centerY = mobile ? topic.mobileY : topic.y;
  const phase = (topicOrder.get(topic.id) || 0) * 0.73;
  const progress = Math.sqrt((index + 1) / Math.max(total, 1));
  const angle = index * goldenAngle + phase;
  const radiusX = (mobile ? 10 : 8) + progress * (mobile ? 15 : 11);
  const radiusY = (mobile ? 7 : 7) + progress * (mobile ? 8 : 9);
  let offsetX = Math.cos(angle) * radiusX;
  let offsetY = Math.sin(angle) * radiusY;
  const topicHalfWidth = mobile ? 19 : 9;
  const topicHalfHeight = mobile ? 5.5 : 6;
  if (Math.abs(offsetX) < topicHalfWidth && Math.abs(offsetY) < topicHalfHeight) {
    offsetY = (offsetY < 0 ? -1 : 1) * topicHalfHeight;
  }
  return {
    x: clampGraphCoordinate(centerX + offsetX),
    y: clampGraphCoordinate(centerY + offsetY)
  };
};

const graphEdges = literature.edges.map(({ source: sourceId, target: targetId, count }) => {
  if (!topicById.has(sourceId) || !topicById.has(targetId)) {
    throw new Error(`Unknown literature edge: ${sourceId} -> ${targetId}`);
  }
  return `<span class="graph-edge graph-topic-edge" data-source="${escapeHtml(sourceId)}" data-target="${escapeHtml(targetId)}" style="--edge-weight:${Math.min(4, 1 + Number(count || 0) / 18)}" aria-hidden="true"></span>`;
}).join("");

const graphNodes = literature.topics.map((topic) =>
  `<button class="graph-node${topic.id === "all" ? " graph-node-hub is-active" : ""} tone-${escapeHtml(topic.tone)}" type="button" data-topic="${escapeHtml(topic.id)}" data-graph-node-id="${escapeHtml(topic.id)}" data-drag-node data-graph-x="${topic.x}" data-graph-y="${topic.y}" data-graph-mobile-x="${topic.mobileX}" data-graph-mobile-y="${topic.mobileY}" style="--node-x:${topic.x}%;--node-y:${topic.y}%;--node-x-mobile:${topic.mobileX}%;--node-y-mobile:${topic.mobileY}%" aria-pressed="${topic.id === "all"}" aria-controls="reading-list" aria-label="${escapeHtml(topic.label)}, ${topic.count} papers">
    <span class="graph-node-label">${escapeHtml(topic.label)}</span>
    <span class="graph-node-count">${topic.count}</span>
  </button>`
).join("");

const graphPaperEntries = literature.records.map((record) => {
  const topic = topicById.get(record.theme);
  if (!topic) throw new Error(`Unknown literature record topic: ${record.theme}`);
  const index = recordIndexByTopic.get(record.theme) || 0;
  recordIndexByTopic.set(record.theme, index + 1);
  const desktop = paperPosition(topic, index, topic.count);
  const mobile = paperPosition(topic, index, topic.count, true);
  const metadata = [record.year, record.venue].filter(Boolean).join(" · ");
  const isFeaturedVenue = featuredVenueNames.has(record.venue);
  const featuredLabel = isFeaturedVenue ? `, ${featuredVenueLabel}` : "";
  return {
    edge: `<span class="graph-edge graph-paper-edge tone-${escapeHtml(topic.tone)}" data-source="${escapeHtml(record.theme)}" data-target="${escapeHtml(record.id)}" style="--edge-weight:0.72" aria-hidden="true"></span>`,
    node: `<button class="graph-paper-node tone-${escapeHtml(topic.tone)}${isFeaturedVenue ? " is-featured" : ""}" type="button" data-paper-node data-paper-topic="${escapeHtml(record.theme)}" data-paper-record="${escapeHtml(record.id)}" data-paper-title="${escapeHtml(record.title)}" data-paper-meta="${escapeHtml(metadata)}" data-paper-featured="${isFeaturedVenue}" data-graph-node-id="${escapeHtml(record.id)}" data-drag-node data-graph-x="${desktop.x.toFixed(3)}" data-graph-y="${desktop.y.toFixed(3)}" data-graph-mobile-x="${mobile.x.toFixed(3)}" data-graph-mobile-y="${mobile.y.toFixed(3)}" style="--node-x:${desktop.x.toFixed(3)}%;--node-y:${desktop.y.toFixed(3)}%;--node-x-mobile:${mobile.x.toFixed(3)}%;--node-y-mobile:${mobile.y.toFixed(3)}%" aria-label="${escapeHtml(record.title)}, ${escapeHtml(metadata || topic.label)}${escapeHtml(featuredLabel)}" aria-controls="reading-${escapeHtml(record.id)}"><span class="graph-paper-star" aria-hidden="true">★</span><span class="sr-only">${escapeHtml(record.title)}</span></button>`
  };
});

const graphPaperEdges = graphPaperEntries.map(({ edge }) => edge).join("");
const graphPaperNodes = graphPaperEntries.map(({ node }) => node).join("");

const itemTypeLabels = {
  journalArticle: "Journal article",
  preprint: "Preprint",
  conferencePaper: "Conference paper"
};

const readingRecordMarkupByYear = new Map(literatureYears.map((year) => [year, []]));

literature.records.forEach((record) => {
  const topic = topicById.get(record.theme);
  if (!topic) throw new Error(`Unknown literature record topic: ${record.theme}`);
  const fullAuthors = record.authors.join(", ");
  const authorDisplay = record.authors.length === 0
    ? '<p class="reading-authors metadata-gap">Authors unavailable in Zotero</p>'
    : record.authors.length <= 4
      ? `<p class="reading-authors">${escapeHtml(fullAuthors)}</p>`
      : `<details class="reading-authors reading-authors-expand">
          <summary aria-label="Authors: ${escapeHtml(fullAuthors)}">${escapeHtml(record.authors.slice(0, 3).join(", "))}<span>+${record.authors.length - 3} more</span></summary>
          <p>${escapeHtml(fullAuthors)}</p>
        </details>`;
  const searchText = [record.title, ...record.authors, record.venue, record.doi, ...record.tags].join(" ");
  const publicationLink = record.url
    ? `<a class="text-link" href="${escapeHtml(record.url)}" rel="noreferrer">View publication <span aria-hidden="true">↗</span></a>`
    : '<span class="reading-link-gap">Publication link unavailable in Zotero</span>';
  const doi = record.doi
    ? `<span class="reading-doi">DOI ${escapeHtml(record.doi)}</span>`
    : '<span class="reading-doi metadata-gap">DOI unavailable in Zotero</span>';
  const isFeaturedVenue = featuredVenueNames.has(record.venue);
  const featuredStar = isFeaturedVenue
    ? `<span class="reading-featured" title="${escapeHtml(featuredVenueLabel)}" aria-label="${escapeHtml(featuredVenueLabel)}"><span aria-hidden="true">★</span></span>`
    : "";

  const markup = `<li class="reading-list-item" id="reading-${escapeHtml(record.id)}" tabindex="-1" data-record-id="${escapeHtml(record.id)}" data-reading-topics="${escapeHtml(record.topics.join(" "))}" data-reading-search="${escapeHtml(searchText)}" data-reading-year="${escapeHtml(record.year)}" data-reading-featured="${isFeaturedVenue}">
    <article class="reading-card" data-zotero-key="${escapeHtml(record.zoteroKey)}">
      <div class="reading-meta">
        <span class="reading-topic tone-${escapeHtml(topic.tone)}">${escapeHtml(topic.label)}</span>
        <span class="reading-item-meta"><span>${escapeHtml(itemTypeLabels[record.itemType] || record.itemType)}</span>${featuredStar}</span>
      </div>
      <h3>${escapeHtml(record.title)}</h3>
      ${authorDisplay}
      <p class="reading-venue${record.venue ? "" : " metadata-gap"}">${escapeHtml(record.venue || "Venue unavailable in Zotero")}</p>
      <div class="reading-footer">${doi}${publicationLink}</div>
    </article>
  </li>`;
  const yearRecords = readingRecordMarkupByYear.get(record.year);
  if (!yearRecords) throw new Error(`Unknown literature record year: ${record.year}`);
  yearRecords.push(markup);
});

const readingYearGroups = literatureYears.map((year) => {
  const records = readingRecordMarkupByYear.get(year);
  const paperLabel = records.length === 1 ? "paper" : "papers";
  return `<div class="reading-year-group" data-reading-year-group="${escapeHtml(year)}" role="group" aria-labelledby="reading-year-${escapeHtml(year)}">
    <div class="reading-year-heading">
      <h3 id="reading-year-${escapeHtml(year)}"><time datetime="${escapeHtml(year)}">${escapeHtml(year)}</time></h3>
      <span data-reading-year-count>${records.length} ${paperLabel}</span>
    </div>
    <ol class="reading-grid" data-reading-year-list>${records.join("")}</ol>
  </div>`;
}).join("");

const readingYearNavigation = `<nav class="reading-year-nav" data-reading-year-nav aria-label="Literature years">
  <span class="reading-year-nav-label">Years</span>
  <ol>${literatureYears.map((year, index) => {
    const count = literatureYearCounts.get(year);
    const paperLabel = count === 1 ? "paper" : "papers";
    return `<li><a class="reading-year-nav-link${index === 0 ? " is-active" : ""}" href="#reading-year-${escapeHtml(year)}" data-reading-year-link="${escapeHtml(year)}"${index === 0 ? ' aria-current="location"' : ""} aria-label="${escapeHtml(year)}, ${count} ${paperLabel}">${escapeHtml(year)}</a></li>`;
  }).join("")}</ol>
</nav>`;

const literatureSections = literature.topics.length || literature.records.length
  ? `${literature.topics.length ? `<section class="graph-section" aria-labelledby="graph-title">
      <div class="section-heading compact-heading"><h2 id="graph-title">AI + Protein landscape</h2></div>
      <div class="corpus-meta" aria-label="Literature source summary">
        <span><strong>${literature.source.includedItems}</strong> research papers</span>
        <span>Zotero snapshot ${escapeHtml(literature.source.snapshotDate)}</span>
      </div>
      <div class="knowledge-map" data-knowledge-map role="group" aria-labelledby="graph-title" aria-describedby="graph-help">
        <div class="graph-edges" aria-hidden="true">${graphEdges}${graphPaperEdges}</div>
        ${graphPaperNodes}
        ${graphNodes}
        <div class="graph-paper-tooltip" id="graph-paper-tooltip" role="tooltip" data-graph-paper-tooltip hidden></div>
      </div>
      <div class="graph-toolbar">
        <p class="graph-help" id="graph-help">★ marks ${escapeHtml(featuredVenueLabel)} papers.</p>
        <div class="graph-feedback">
          <p class="graph-status" role="status" aria-live="polite" data-graph-status>All five topics · ${literature.source.includedItems} papers</p>
          <button class="graph-reset" type="button" data-graph-reset disabled>Clear topic filter</button>
        </div>
      </div>
    </section>` : ""}
    ${literature.records.length ? `<section class="reading-section" aria-labelledby="reading-title">
      <div class="section-heading compact-heading"><h2 id="reading-title">Research papers</h2></div>
      <div class="reading-controls" aria-label="Paper controls">
        <label class="reading-control reading-search">
          <span>Search the collection</span>
          <input type="search" data-reading-search-input placeholder="Title, author, venue, DOI, or Zotero tag" autocomplete="off">
        </label>
        <div class="reading-control reading-year-filter" data-reading-year-picker>
          <span id="reading-year-filter-label">Year</span>
          <button class="reading-year-trigger" type="button" data-reading-year-trigger aria-haspopup="listbox" aria-expanded="false" aria-controls="reading-year-menu" aria-labelledby="reading-year-filter-label reading-year-filter-value">
            <span id="reading-year-filter-value" data-reading-year-value>All years</span>
            <span class="reading-year-chevron" aria-hidden="true"></span>
          </button>
          <div class="reading-year-menu" id="reading-year-menu" data-reading-year-menu role="listbox" aria-labelledby="reading-year-filter-label" hidden>${readingYearMenuOptions}</div>
          <select data-reading-year-filter hidden aria-hidden="true" tabindex="-1">${readingYearOptions}</select>
        </div>
        <div class="reading-control reading-featured-filter">
          <span>Journal mark</span>
          <button class="reading-featured-filter-button" type="button" data-reading-featured-filter data-reading-featured-label="${escapeHtml(featuredVenueLabel)}" aria-pressed="false" aria-label="Show only ${escapeHtml(featuredVenueLabel)} papers">
            <span class="reading-featured-filter-star" aria-hidden="true">★</span>
            <span class="reading-featured-filter-copy"><strong>Starred papers</strong><small>CNS / major family</small></span>
            <span class="reading-featured-filter-count" aria-hidden="true">${featuredLiteratureCount}</span>
          </button>
        </div>
      </div>
      <div class="reading-results-row">
        <p class="reading-results" role="status" aria-live="polite" data-reading-status>Showing all ${literature.source.includedItems} papers</p>
        <span>Source: Zotero · ${escapeHtml(literature.source.collection)}</span>
      </div>
      <div class="reading-browse-layout">
        ${readingYearNavigation}
        <div class="reading-year-groups" id="reading-list">${readingYearGroups}</div>
      </div>
      <p class="reading-empty" data-reading-empty hidden>No papers match the current filters.</p>
    </section>` : ""}`
  : emptyState();

const library = layout({
  title: "Literature",
  description: `Explore ${literature.source.includedItems} non-review AI and protein papers from U1X's Zotero library through an interactive topic graph and searchable paper collection.`,
  pathname: "/library/",
  pageClass: "page-library",
  content: `<div class="shell page-shell content-page-shell">
    ${pageTitle("Literature", "page-title-long page-title-literature")}
    ${literatureSections}
  </div>`
});

const paperCards = papersData.papers.length
  ? papersData.papers.map((paper) => {
      const journalMetrics = papersData.journalMetrics?.[paper.venue];
      if (!journalMetrics) throw new Error(`Missing journal metrics for ${paper.venue}`);
      const authors = paper.authors.map((author) => author === paper.highlightAuthor
        ? `<mark class="paper-author-highlight"><strong>${escapeHtml(author)}</strong></mark>`
        : escapeHtml(author)
      ).join(", ");
      const paperLink = escapeHtml(paper.url);
      const metricsDescription = `${paper.venue} journal metrics, data as of ${journalMetrics.asOf}, source: ${journalMetrics.source}`;
      return `<article class="paper-card">
        <figure class="paper-figure">
          <div class="paper-image">
            <img src="${escapeHtml(paper.image)}" alt="${escapeHtml(paper.imageAlt)}" width="520" height="337">
          </div>
          <figcaption>
            <span class="paper-figure-label">Visual abstract</span>
            <span class="paper-image-credit">${escapeHtml(paper.imageCredit)}</span>
          </figcaption>
        </figure>
        <div class="paper-content">
          <div class="paper-meta"><span class="paper-year">${escapeHtml(paper.year)}</span><span class="paper-venue">${escapeHtml(paper.venue)}</span></div>
          <h2>${escapeHtml(paper.title)}</h2>
          <p class="paper-authors">${authors}</p>
          <div class="paper-citation-row">
            <p class="paper-citation">${escapeHtml(paper.citation)}</p>
            <div class="paper-metrics" aria-label="${escapeHtml(metricsDescription)}" title="${escapeHtml(metricsDescription)}">
              <span class="journal-metric journal-metric-if"><span>IF</span><strong>${escapeHtml(journalMetrics.impactFactor)}</strong></span>
              <span class="journal-metric journal-metric-5y"><span>5Y IF</span><strong>${escapeHtml(journalMetrics.fiveYearImpactFactor)}</strong></span>
            </div>
          </div>
          <a class="text-link" href="${paperLink}" rel="noreferrer">View publication <span aria-hidden="true">↗</span></a>
          <p class="paper-doi">DOI: ${escapeHtml(paper.doi)}</p>
        </div>
      </article>`;
    }).join("")
  : emptyState();

const paperPage = layout({
  title: "Paper",
  description: papersData.description,
  pathname: "/paper/",
  content: `<div class="shell page-shell content-page-shell">
    ${pageTitle("Paper", "page-title-paper")}
    <section class="paper-grid" aria-label="Paper list">${paperCards}</section>
  </div>`
});

const shelfCards = acgn.shelves.length ? acgn.shelves.map((shelf) => {
  const items = shelf.items.length
    ? `<ul>${shelf.items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.note || "")}</span></li>`).join("")}</ul>`
    : `<div class="shelf-empty"><span>Awaiting entries</span><p>Add the first item in <code>data/acgn.json</code>.</p></div>`;
  return `<article class="shelf-card tone-${escapeHtml(shelf.tone)}">
    <p class="card-label">${escapeHtml(shelf.label)}</p>
    <h2>${escapeHtml(shelf.title)}</h2>
    ${items}
  </article>`;
}).join("") : "";

const gameCards = (games, platform) => games.length
  ? games.map((game) => `<figure class="game-card ${platform}-game-card">
      <div class="game-cover ${platform}-game-cover">
        ${thumbnailPicture({ image: game.image, alt: game.imageAlt })}
      </div>
      <figcaption title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</figcaption>
    </figure>`).join("")
  : emptyState();

const steamGames = gameCards(acgn.steam.games, "steam");
const switchGames = gameCards(acgn.nintendoSwitch.games, "switch");
const steamProfile = acgn.steam.profile;
const steamProfileCard = `<section class="steam-profile" aria-labelledby="steam-profile-title" data-steam-profile>
  <h2 class="sr-only" id="steam-profile-title">@${escapeHtml(steamProfile.handle)} Steam profile</h2>
  <a class="steam-profile-card steam-profile-screenshot-link" href="${escapeHtml(steamProfile.sourceUrl)}" rel="noreferrer" aria-label="Open @${escapeHtml(steamProfile.handle)} on Steam Community">
    <picture class="steam-profile-screenshot">
      <source media="(max-width: 680px)" srcset="${escapeHtml(steamProfile.screenshotMobile)}">
      <img src="${escapeHtml(steamProfile.screenshot)}" alt="${escapeHtml(steamProfile.screenshotAlt)}" width="${steamProfile.screenshotWidth}" height="${steamProfile.screenshotHeight}" decoding="async">
    </picture>
  </a>
  <p class="sr-only">Source: ${escapeHtml(steamProfile.source)}. Checked ${escapeHtml(steamProfile.checkedOn)}.</p>
</section>`;

const acgnPage = layout({
  title: "Gamer",
  description: "Explore U1X's Steam and Nintendo Switch game collections.",
  pathname: "/acgn/",
  pageClass: "page-acgn",
  content: `<div class="shell page-shell content-page-shell">
    ${pageTitle("Gamer", "page-title-acgn")}
    ${steamProfileCard}
    <section class="game-platform steam-platform" aria-labelledby="steam-games-title">
      <h2 class="game-platform-title steam-platform-title" id="steam-games-title">Steam Games</h2>
      <div class="game-grid" aria-label="Steam game collection">${steamGames}</div>
    </section>
    <section class="game-platform switch-platform" aria-labelledby="switch-games-title">
      <h2 class="game-platform-title switch-platform-title" id="switch-games-title">Nintendo Switch</h2>
      <div class="game-grid" aria-label="Nintendo Switch game collection">${switchGames}</div>
    </section>
    ${shelfCards ? `<section class="shelf-grid" aria-label="Other ACGN collection categories">${shelfCards}</section>` : ""}
  </div>`
});

const anime = acgn.anime;
const nijigenCategories = [
  { pathname: "/anime/", label: "アニメ" }
];
const nijigenSubnavigation = (pathname) => `<nav class="nijigen-subnav" aria-label="にじげんのカテゴリ">${nijigenCategories
  .map(({ pathname: categoryPath, label }) => `<a href="${categoryPath}"${categoryPath === pathname ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`)
  .join("")}</nav>`;
const animeDeityWorks = orderAnimeWorks(anime.deity.works);
const animeFavoriteWorks = orderAnimeWorks(anime.favorites);
const animeDeityCards = animeDeityWorks.map((work) => animeCard(work, "anime-deity-card")).join("");
const animeFavoriteCards = animeFavoriteWorks.map((work) => animeCard(work)).join("");

const animePage = layout({
  title: anime.title,
  description: anime.description,
  pathname: "/anime/",
  pageClass: "page-anime",
  language: "ja",
  navigationLanguage: "en",
  content: `<div class="shell page-shell content-page-shell">
    ${pageTitle(anime.title, "page-title-anime")}
    ${nijigenSubnavigation("/anime/")}
    <section class="anime-section anime-deity-section" aria-labelledby="anime-deity-title">
      <div class="anime-section-heading anime-deity-heading">
        <p class="anime-deity-label">${escapeHtml(anime.deity.heading)}</p>
        <h2 id="anime-deity-title">${escapeHtml(anime.deity.title)}</h2>
      </div>
      <div class="anime-grid anime-deity-grid" aria-label="${escapeHtml(anime.deity.title)}">${animeDeityCards}</div>
    </section>
    <section class="anime-section anime-favorites-section" aria-labelledby="anime-favorites-title">
      <div class="anime-section-heading">
        <h2 id="anime-favorites-title">${escapeHtml(anime.favoritesHeading)}</h2>
      </div>
      <div class="anime-grid" aria-label="${escapeHtml(anime.favoritesHeading)}">${animeFavoriteCards}</div>
    </section>
  </div>`
});

const notFound = layout({
  title: "Page not found",
  description: "The requested page does not exist.",
  pathname: "/404.html",
  content: `<div class="shell not-found"><p class="section-kicker">404</p><h1>This page has not grown yet.</h1><p>Return home or wander through the literature garden.</p><div class="hero-actions"><a class="button button-primary" href="/">Back home</a><a class="button button-quiet" href="/library/">Literature garden</a></div></div>`
});

const pages = [
  ["index.html", home],
  ["projects/index.html", projects],
  ["library/index.html", library],
  ["paper/index.html", paperPage],
  ["acgn/index.html", acgnPage],
  ["anime/index.html", animePage],
  ["404.html", notFound]
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, "public"), dist, { recursive: true });
await cp(path.join(root, "data"), path.join(dist, "data"), { recursive: true });
for (const [relativePath, html] of pages) {
  const output = path.join(dist, relativePath);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html, "utf8");
}

const sitemapPaths = [...new Set([...navigation.map(([pathname]) => pathname), ...nijigenCategories.map(({ pathname }) => pathname)])];
const sitemap = sitemapPaths.map((pathname) => `  <url><loc>${new URL(pathname, site.url).href}</loc></url>`).join("\n");
await writeFile(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap}\n</urlset>\n`, "utf8");

console.log(`Built ${pages.length} pages into dist/.`);
