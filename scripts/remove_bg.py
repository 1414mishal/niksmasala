"""
Remove backgrounds from all product images in assets/products/.
- .webp files → transparent .webp (alpha channel)
- .png files  → transparent .png
- .jpg files  → transparent .png (JPG can't hold alpha)

Backup: git checkout 414b8ec -- assets/products/  (restores originals)
"""
import os, io, sys, time
from pathlib import Path
from rembg import remove, new_session
from PIL import Image

PRODUCTS_DIR = Path(__file__).parent.parent / "assets" / "products"
SKIP = {"nobgnikslogo.webp"}  # already transparent

session = new_session("u2net")

image_exts = {".webp", ".png", ".jpg", ".jpeg"}
files = sorted([
    f for f in PRODUCTS_DIR.iterdir()
    if f.suffix.lower() in image_exts and f.name not in SKIP
])

print(f"Processing {len(files)} images in {PRODUCTS_DIR}")
print("=" * 60)

converted_jpg_to_png = []
errors = []

for i, fpath in enumerate(files, 1):
    start = time.time()
    try:
        raw = fpath.read_bytes()
        out_bytes = remove(raw, session=session)          # always returns RGBA PNG
        img = Image.open(io.BytesIO(out_bytes)).convert("RGBA")

        ext = fpath.suffix.lower()

        if ext in (".jpg", ".jpeg"):
            # Save as PNG alongside original; original stays for git history
            new_path = fpath.with_suffix(".png")
            img.save(new_path, "PNG", optimize=True)
            converted_jpg_to_png.append((fpath.name, new_path.name))
            elapsed = time.time() - start
            print(f"[{i:3d}/{len(files)}] {fpath.name} → {new_path.name}  ({elapsed:.1f}s)")

        elif ext == ".webp":
            img.save(fpath, "WEBP", lossless=False, quality=90, method=4)
            elapsed = time.time() - start
            print(f"[{i:3d}/{len(files)}] {fpath.name}  ({elapsed:.1f}s)")

        else:  # .png
            img.save(fpath, "PNG", optimize=True)
            elapsed = time.time() - start
            print(f"[{i:3d}/{len(files)}] {fpath.name}  ({elapsed:.1f}s)")

    except Exception as e:
        errors.append((fpath.name, str(e)))
        print(f"[{i:3d}/{len(files)}] ERROR {fpath.name}: {e}")

print("=" * 60)
print(f"Done. Errors: {len(errors)}")
if converted_jpg_to_png:
    print("\nJPG → PNG conversions (update app.js references):")
    for old, new in converted_jpg_to_png:
        print(f"  {old}  →  {new}")
if errors:
    print("\nFailed images:")
    for name, err in errors:
        print(f"  {name}: {err}")
