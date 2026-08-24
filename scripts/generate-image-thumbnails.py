"""Generate local AVIF and WebP thumbnails for game and Anime covers."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from PIL import Image, ImageOps, features


ROOT = Path(__file__).resolve().parent.parent
IMAGE_ROOT = ROOT / "public" / "images"
THUMBNAIL_ROOT = IMAGE_ROOT / "thumbnails"
COLLECTIONS = {
    "steam": (360, 360),
    "nintendo-switch": (360, 360),
    "anime": (400, 100_000),
}
ANIME_DEITY_BOUNDING_BOX = (520, 100_000)
SOURCE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate thumbnails even when they are newer than the source image.",
    )
    return parser.parse_args()


def ensure_encoder_support() -> None:
    missing = [name for name in ("webp", "avif") if not features.check(name)]
    if missing:
        raise RuntimeError(f"Pillow is missing required image encoders: {', '.join(missing)}")


def output_path(collection: str, source: Path, extension: str) -> Path:
    return THUMBNAIL_ROOT / collection / f"{source.stem}.{extension}"


def is_current(source: Path, targets: list[Path]) -> bool:
    source_mtime = source.stat().st_mtime_ns
    return all(
        target.is_file()
        and target.stat().st_size > 0
        and target.stat().st_mtime_ns >= source_mtime
        for target in targets
    )


def prepare_image(source: Path, bounding_box: tuple[int, int]) -> Image.Image:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        has_alpha = "A" in image.getbands() or (
            image.mode == "P" and "transparency" in image.info
        )
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail(bounding_box, Image.Resampling.LANCZOS)
        return image.copy()


def atomic_save(image: Image.Image, target: Path, image_format: str, **options: object) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.tmp")
    try:
        image.save(temporary, format=image_format, **options)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def generate_source(collection: str, source: Path, bounding_box: tuple[int, int]) -> None:
    image = prepare_image(source, bounding_box)
    atomic_save(
        image,
        output_path(collection, source, "avif"),
        "AVIF",
        quality=55,
        speed=6,
    )
    atomic_save(
        image,
        output_path(collection, source, "webp"),
        "WEBP",
        quality=78,
        method=6,
    )


def main() -> None:
    args = parse_args()
    ensure_encoder_support()
    acgn = json.loads((ROOT / "data" / "acgn.json").read_text(encoding="utf-8"))
    anime_deity_stems = {
        Path(work["image"]).stem for work in acgn["anime"]["deity"]["works"]
    }
    inputs: list[tuple[str, Path, tuple[int, int]]] = []
    for collection, bounding_box in COLLECTIONS.items():
        source_directory = IMAGE_ROOT / collection
        sources = sorted(
            path
            for path in source_directory.iterdir()
            if path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS
        )
        stems = [source.stem for source in sources]
        if len(stems) != len(set(stems)):
            raise RuntimeError(f"Duplicate source stems in {source_directory}")
        inputs.extend(
            (
                collection,
                source,
                ANIME_DEITY_BOUNDING_BOX
                if collection == "anime" and source.stem in anime_deity_stems
                else bounding_box,
            )
            for source in sources
        )

    generated = 0
    skipped = 0
    for index, (collection, source, bounding_box) in enumerate(inputs, start=1):
        targets = [
            output_path(collection, source, "avif"),
            output_path(collection, source, "webp"),
        ]
        if not args.force and is_current(source, targets):
            skipped += 1
        else:
            generate_source(collection, source, bounding_box)
            generated += 1
        if index % 25 == 0 or index == len(inputs):
            print(f"Processed {index}/{len(inputs)} source images.", flush=True)

    print(
        f"Thumbnail generation complete: {generated} generated, {skipped} unchanged, "
        f"{len(inputs) * 2} variants present."
    )


if __name__ == "__main__":
    main()
