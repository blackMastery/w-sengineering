"""Extract product photos from the catalog PDF and match them to products by position.

For each image placed on a page (skipping full-page backgrounds, tiny icons and
logos reused across many pages), find the product on that page whose table/title
region is closest. Assign it if it's within MAX_DIST points.
Outputs: images/<xref>.webp and images.json {slug: [file, ...]}.
"""
import collections, io, json, math, os, sys
import pymupdf
from PIL import Image

PDF = sys.argv[1] if len(sys.argv) > 1 else "catalog.pdf"
PRODUCTS = "products.json"
OUT_DIR = "images"
MAX_DIST = 110       # points (1/72")
MAX_PER_PRODUCT = 4
MAX_PX = 900

doc = pymupdf.open(PDF)
P = [p for p in json.load(open(PRODUCTS)) if p["catalog_page"] < 188]
by_page = collections.defaultdict(list)
for p in P:
    by_page[p["catalog_page"]].append(p)

# images reused on many pages are logos / badges
use = collections.Counter()
for pg in doc:
    for xr in {i["xref"] for i in pg.get_image_info(xrefs=True)}:
        use[xr] += 1


def rect_dist(a, b):
    dx = max(b[0] - a[2], a[0] - b[2], 0)
    dy = max(b[1] - a[3], a[1] - b[3], 0)
    return math.hypot(dx, dy)


def save(xref):
    path = os.path.join(OUT_DIR, f"{xref}.webp")
    if os.path.exists(path):
        return path
    pix = pymupdf.Pixmap(doc, xref)
    img_info = doc.extract_image(xref)
    smask = img_info.get("smask") or 0
    if smask:
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
    if pix.n - pix.alpha >= 4:           # CMYK -> RGB
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    mode = "RGBA" if pix.alpha else "RGB"
    im = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
    im.thumbnail((MAX_PX, MAX_PX))
    im.save(path, "WEBP", quality=82)
    return path


os.makedirs(OUT_DIR, exist_ok=True)
matches = collections.defaultdict(list)   # slug -> [(dist, area, xref)]
stats = collections.Counter()
for pno, prods in by_page.items():
    page = doc[pno - 1]
    W, H = page.rect.width, page.rect.height
    seen = set()
    for info in page.get_image_info(xrefs=True):
        xr = info["xref"]
        x0, y0, x1, y1 = info["bbox"]
        w, h = x1 - x0, y1 - y0
        if not xr or xr in seen:
            continue
        seen.add(xr)
        if w * h > 0.35 * W * H:
            stats["background"] += 1; continue
        if min(w, h) < 28 or use[xr] > 4:
            stats["icon/logo"] += 1; continue
        cands = []
        for p in prods:
            d = min(rect_dist((x0, y0, x1, y1), r) for r in p.get("regions", [[0, 0, 0, 0]]))
            cands.append((d, p["slug"]))
        cands.sort()
        if not cands or cands[0][0] > MAX_DIST:
            stats["unmatched"] += 1; continue
        # ambiguous: two products almost equally close -> give it to both
        best = cands[0][0]
        for d, slug in cands:
            if d <= best + 8:
                matches[slug].append((d, -w * h, xr))
        stats["matched"] += 1

out = {}
for slug, lst in matches.items():
    lst.sort()
    # extras only if nearly as close as the best match (neighbours' photos otherwise creep in)
    lst = [x for x in lst if x[0] <= lst[0][0] + 20]
    files = []
    for d, a, xr in lst[:MAX_PER_PRODUCT]:
        try:
            files.append(os.path.basename(save(xr)))
        except Exception as e:  # unusual colorspaces etc.
            stats["failed"] += 1
    if files:
        out[slug] = files
json.dump(out, open("images.json", "w"), indent=1)
n_files = len(os.listdir(OUT_DIR))
size = sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR))
print(dict(stats))
print(f"{len(out)}/{len(P)} products have images; {n_files} files, {size/1e6:.1f} MB")
