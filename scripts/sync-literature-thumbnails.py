"""Inspect Zotero PDFs and render reviewed literature figure crops.

Requires Pillow and pypdfium2 in the extraction environment.
The static website build does not need Python or access to Zotero.
PDF paths remain in the private work directory; only item/attachment keys,
source hashes, page numbers and reviewed crop coordinates enter the website.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import time
import threading
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw
import pypdfium2

ROOT = Path(__file__).resolve().parent.parent
API = "http://127.0.0.1:23119/api/users/0"
PDFIUM_LOCK = threading.Lock()


def api_get(route):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(API + route, timeout=20) as response:
                value = response.read().decode("utf-8")
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return value
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(0.5 * 2**attempt)


def atomic_json(target, value):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, target)


def inspect_record(record, work):
    target = work / "records" / (record["zoteroKey"] + ".json")
    if target.exists():
        return json.loads(target.read_text("utf-8"))
    children = api_get(f'/items/{record["zoteroKey"]}/children?limit=100')
    attachments = [item["data"] for item in children if item["data"].get("contentType") == "application/pdf"]
    result = {"key": record["zoteroKey"], "title": record["title"], "attachments": []}
    for attachment in attachments:
        url = api_get(f'/items/{attachment["key"]}/file/view/url')
        source = Path(urllib.request.url2pathname(urllib.parse.urlparse(url).path))
        # PDFium is fast for vector-heavy papers but is not thread safe.
        with PDFIUM_LOCK:
            document = pypdfium2.PdfDocument(source)
            page_texts = []
            for page in document:
                textpage = page.get_textpage()
                page_texts.append(textpage.get_text_bounded())
                textpage.close()
                page.close()
            document.close()
        candidates = []
        for index, text in enumerate(page_texts):
            lines = text.splitlines()
            for number, line in enumerate(lines):
                compact = re.sub(r"\s+", " ", line).strip()
                if re.search(r"\b(?:graphical\s*abstract|graphical\s*summary|TOC\s*graphic|TOC\s*figure)\b", compact, re.I):
                    candidates.append({"kind": "graphical-abstract", "page": index + 1, "text": " ".join(lines[number:number + 3])[:600]})
                elif re.match(r"^(?:\d+\s+)?(?:Fig\.?|Figure)\s*1\b", compact, re.I):
                    candidates.append({"kind": "figure-1", "page": index + 1, "text": " ".join(lines[number:number + 4])[:800]})
        result["attachments"].append({"key": attachment["key"], "path": str(source), "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "pages": len(page_texts), "candidates": candidates})
    atomic_json(target, result)
    return result


def discover(work, keys=None):
    records = json.loads((ROOT / "data/literature.json").read_text("utf-8"))["records"]
    if keys:
        records = [record for record in records if record["zoteroKey"] in keys]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(inspect_record, record, work): record for record in records}
        for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
            result = future.result()
            print(f'{number}/{len(records)} {result["key"]}: {sum(len(a["candidates"]) for a in result["attachments"])} candidates', flush=True)


def previews(work, keys=None):
    records = json.loads((ROOT / "data/literature.json").read_text("utf-8"))["records"]
    if keys:
        records = [record for record in records if record["zoteroKey"] in keys]
    previews_dir = work / "previews"
    previews_dir.mkdir(parents=True, exist_ok=True)
    index = []
    for number, record in enumerate(records, 1):
        data = json.loads((work / "records" / (record["zoteroKey"] + ".json")).read_text("utf-8"))
        # A preview is only a candidate; supplementary files and split captions
        # still need visual review before an entry is added to the mapping.
        attachment = next((a for a in data["attachments"] if any(c["kind"] == "graphical-abstract" for c in a["candidates"])), None)
        attachment = attachment or next((a for a in data["attachments"] if a["candidates"]), data["attachments"][0])
        candidates = attachment["candidates"]
        graphical = [c for c in candidates if c["kind"] == "graphical-abstract"]
        figures = [c for c in candidates if c["kind"] == "figure-1"]
        selected = (graphical or figures or [{"page": 1, "kind": "unresolved", "text": ""}])[0]
        page_number = selected["page"]
        doc = pypdfium2.PdfDocument(attachment["path"])
        page = doc[page_number - 1]
        width, height = page.get_size()
        image = page.render(scale=600 / width).to_pil().convert("RGB")
        image.save(previews_dir / (record["zoteroKey"] + ".jpg"), quality=88)
        page.close()
        doc.close()
        index.append({"number": number, "key": record["zoteroKey"], "title": record["title"], "attachmentKey": attachment["key"], "sha256": attachment["sha256"], "page": page_number, "kind": selected["kind"], "caption": selected["text"], "pageSize": [width, height], "candidates": candidates})
    atomic_json(work / "index.json", index)
    contact_sheets(work, index, previews_dir, "pages", 12)


def contact_sheets(work, entries, folder, prefix, per_sheet=12):
    cell_w, cell_h = 390, 580
    for start in range(0, len(entries), per_sheet):
        sheet = Image.new("RGB", (cell_w * 4, cell_h * ((per_sheet + 3) // 4)), "#e8e8e8")
        draw = ImageDraw.Draw(sheet)
        for offset, entry in enumerate(entries[start:start + per_sheet]):
            x, y = offset % 4 * cell_w, offset // 4 * cell_h
            image = Image.open(folder / (entry["key"] + ".jpg"))
            image.thumbnail((cell_w - 12, cell_h - 55))
            sheet.paste(image, (x + 6, y + 48))
            draw.text((x + 6, y + 4), f'{entry["number"]:03} {entry["key"]} p{entry["page"]} {entry["kind"]}', fill="black")
            draw.text((x + 6, y + 20), entry["title"][:52], fill="black")
        sheet.save(work / f"{prefix}-{start // per_sheet + 1:02}.jpg", quality=91)


def render(work, keys=None):
    mapping_path = ROOT / "data/literature-images.json"
    mapping = json.loads(mapping_path.read_text("utf-8"))
    for key, entry in mapping["images"].items():
        if keys and key not in keys:
            continue
        cached = json.loads((work / "records" / (key + ".json")).read_text("utf-8"))
        attachment = next(a for a in cached["attachments"] if a["key"] == entry["attachmentKey"])
        source = Path(attachment["path"])
        if hashlib.sha256(source.read_bytes()).hexdigest() != entry["sourceSha256"]:
            raise ValueError(f"{key}: PDF changed; review the selected crop again")
        doc = pypdfium2.PdfDocument(source)
        page = doc[entry["page"] - 1]
        width, height = page.get_size()
        left, top, right, bottom = entry["crop"]
        if not (0 <= left < right <= round(width, 2) and 0 <= top < bottom <= round(height, 2)):
            raise ValueError(f"{key}: crop outside source page")
        right, bottom = min(right, width), min(bottom, height)
        scale = min(3, 1100 / (right - left))
        image = page.render(scale=scale, crop=(left, height - bottom, width - right, top)).to_pil().convert("RGB")
        image.thumbnail((1100, 1400), Image.Resampling.LANCZOS)
        target = ROOT / "public" / entry["image"].lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".tmp")
        image.save(temporary, format="WEBP", quality=88, method=6)
        os.replace(temporary, target)
        entry["width"], entry["height"] = image.size
        page.close()
        doc.close()
    atomic_json(mapping_path, mapping)
    print(f'Rendered {len(keys) if keys else len(mapping["images"])} reviewed literature images.', flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["discover", "previews", "render"])
    parser.add_argument("--work-dir", required=True, type=Path, help="Private local cache outside public/ and data/")
    parser.add_argument("--keys", nargs="+", help="Only process these Zotero item keys")
    args = parser.parse_args()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    if args.keys:
        known = {record["zoteroKey"] for record in json.loads((ROOT / "data/literature.json").read_text("utf-8"))["records"]}
        if set(args.keys) - known:
            parser.error("Unknown Zotero item keys: " + ", ".join(sorted(set(args.keys) - known)))
    {"discover": discover, "previews": previews, "render": render}[args.command](args.work_dir, set(args.keys) if args.keys else None)
