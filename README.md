# U1XOvO.github.io

U1X's personal homepage and long-lived digital garden. The top-level navigation contains Home, Projects, Literature, Paper, Gamer, and にじげん in a lightweight palette of blush pink, sky blue, mint green, and soft lavender.

The site is fully static: it has no backend, database, or frontend runtime dependencies. A Node.js standard-library build script reads content from `data/` and generates `dist/` for long-term hosting on GitHub Pages.

## Local development

Node.js 20 or newer is required.

```bash
npm run dev
```

The local address is `http://127.0.0.1:4173` by default. The development server rebuilds the site once at startup; restart it after changing content.

Run the full check before committing:

```bash
npm test
```

This command regenerates `dist/`, then validates the JSON data structure, page count, SEO metadata, images, and every internal link.

To refresh the Literature page from the local Zotero `AI+Protein` collection, open Zotero and run:

```bash
npm run sync:literature
```

The sync is read-only on Zotero. It stores a static, traceable snapshot in `data/literature.json`, excludes records carrying the Zotero tag `Review`, and requires every included record to have exactly one primary topic tag: `Predict Kinetic`, `LLM`, `DE`, `Denovo`, `Discovery`, or `AGENT`. Each refresh follows the current Zotero tags and reports added/removed keys and topic transfers, so moving a paper to another topic preserves its stable key and artwork.

Literature uses one spacious horizontal card per row on desktop and tablet, with a large uncropped figure on the left and the topic badge, title, authors, venue and publication action on the right. Cards stack the figure above the text on narrow screens. Each topic has a distinct pastel color; AGENT uses cream yellow with amber text. Item-type and figure-label badges are omitted; figure type and source page remain available in the image viewer. Snapshot/source summaries and browse/copy-link actions are not displayed; the source provenance remains in the data snapshot.

Literature card artwork is maintained separately in `data/literature-images.json`, keyed by the stable Zotero item key. Refreshing literature metadata does not overwrite the reviewed image mapping. Every included paper needs one local WebP under `public/images/literature/`; missing mappings fail the build rather than silently displaying a substitute.

Select the original article's **Graphical abstract first, otherwise Figure 1**. Review the source PDF's first page visually as well as its text: ACS abstract artwork and some Cell Press graphical abstracts do not have searchable labels. Use the main article attachment, not supplementary information. Preserve the complete figure and its aspect ratio; do not substitute a different figure, generate artwork, or use a whole-page screenshot. For figures whose caption appears on a different page, record `captionPage` separately.

Each mapping records the publication URL, attachment key, source PDF SHA-256, 1-based page number, page size, crop in PDF points measured from the top-left, selection kind, alternative text, review date, and exported dimensions. Keep local attachment paths and PDF caches outside the repository. The checked-in WebPs are sufficient for builds and GitHub Pages; Zotero and Python are only needed when preparing new artwork.

Literature thumbnails open a shared accessible image viewer with zoom, drag, touch pinch, keyboard controls, and previous/next navigation through the current filtered results. The viewer reuses the local WebP image and decodes only the selected image on demand. It adds no dependencies or full-size image preloads; zooming does not add detail beyond the source image resolution. Closing restores focus to the original thumbnail. Opening/closing motion respects the reduced-motion preference.

The optional extraction helper uses the existing Python image/PDF environment (Pillow and pypdfium2). It performs bounded read-only Zotero requests, caches inspection results, and atomically renders reviewed mappings:

```bash
python scripts/sync-literature-thumbnails.py discover --work-dir <private-cache-directory>
python scripts/sync-literature-thumbnails.py previews --work-dir <private-cache-directory>
# Review source pages and update data/literature-images.json before rendering.
python scripts/sync-literature-thumbnails.py render --work-dir <private-cache-directory>
npm test
```

Candidate previews are inspection aids, not approved selections. The renderer refuses a changed source PDF hash so page/crop coordinates can be reviewed again. Run the same 320px, 768px and desktop layout checks after adding artwork.

For incremental artwork updates, append `--keys KEY1 KEY2` to each extraction command to inspect and render only the new records while preserving existing reviewed images.

To refresh the Nintendo Switch collection from its public shared page, run:

```bash
npm run sync:switch
```

The command writes the current game list to `data/acgn.json` and downloads the square cover images into `public/images/nintendo-switch/`. The generated ACGN page displays only each cover and game name; account metrics and external links remain excluded.

Steam game ownership is stored as a static snapshot from the public Steam Community games page. After updating the Steam entries in `data/acgn.json`, refresh their local official covers with:

```bash
npm run sync:steam-covers
```

The Gamer page renders Steam first and Nintendo Switch second, using the same ten-column desktop card layout and showing only each cover and game name.

Anime favorites are stored in `data/acgn.json`. After adding or changing an anime entry, refresh the locally cached covers with:

```bash
npm run sync:anime-covers
```

The command keeps anime covers in `public/images/anime/`, records their AniList CDN source in the data snapshot, and leaves the rendered page independent of remote image URLs.

After refreshing Steam, Nintendo Switch, or Anime covers, regenerate the browser-ready thumbnails:

```bash
python3 scripts/generate-image-thumbnails.py
```

The maintenance script requires Python 3 and Pillow with WebP and AVIF encoder support. It writes bounded-size AVIF and WebP variants under `public/images/thumbnails/`; the original local cover remains the final browser fallback. This does not add a dependency to the static Node.js build or to the deployed site.

## Updating content

Content and presentation are maintained separately:

| File | Purpose |
| --- | --- |
| `data/profile.json` | GitHub identity, avatar path, and homepage profile fields |
| `data/projects.json` | All content displayed on the Projects page |
| `data/literature.json` | Zotero-sourced Literature knowledge graph and complete non-review reading list |
| `data/literature-featured-venues.json` | Exact venue names marked as CNS flagships or major family journals |
| `data/papers.json` | Paper and publication records |
| `data/acgn.json` | Steam and Nintendo Switch game snapshots, Anime favorites, plus other ACGN collection entries |
| `data/site.json` | Global site title, URL, language, and description |
| `public/styles.css` | Visual system and responsive layout |
| `public/site.js` | Mobile navigation and knowledge-map filtering |

To add a project, edit only the `projects` array in `data/projects.json`. Refresh Literature through `npm run sync:literature` so record keys, topic counts, review exclusions, and source provenance stay aligned; add publication records to `papers` in `data/papers.json`.

All raster images and site icons belong in `public/images/`. The current `og.png` is the social preview card. Keep a landscape composition and recheck page metadata when replacing it.

## GitHub Pages deployment

`.github/workflows/deploy.yml` runs whenever `main` changes or the workflow is triggered manually. It:

1. Builds the site and checks its links with Node.js.
2. Uploads the static `dist/` artifact.
3. Publishes the artifact to GitHub Pages.

For first-time setup, open `Settings → Pages` in the repository and set Source to **GitHub Actions**. For routine changes, create a Pull Request from a feature branch and merge it into `main` only after all checks pass.

## Design references

This project does not copy template source code. It draws structural and maintenance inspiration from:

- [Academic Website Template](https://github.com/morganavickery/academic-website-template), for maintaining profile, project, and literature content in independent JSON or CSV files.
- [Academic Pages](https://github.com/academicpages/academicpages.github.io), for its clear multi-page academic homepage structure.
- [Research Website Template](https://github.com/tovacinni/research-website-template), for its data-driven research-site structure and GitHub Pages workflow.

## Intentional gaps

The Paper page and other empty collections deliberately remain as explicit placeholders until the owner provides verified information. The site does not guess personal history, publications, reading notes, or ACGN favorites.
