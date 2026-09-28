"""Extract products + variants from the Kraft Tool Co. catalog PDF.

Layout-aware: uses word coordinates and fonts from pdfplumber.
- Table header line  = line containing a bold "No." word
- Variant group label = bold-italic text just above a "No." column (e.g. "ProForm® Handle")
- Product title       = nearest heading-font block above the table, overlapping it horizontally
"""
import json, re, sys
import pdfplumber

PDF = sys.argv[1] if len(sys.argv) > 1 else "catalog.pdf"
OUT = sys.argv[2] if len(sys.argv) > 2 else "products.json"

HANDLES = {"ProForm", "Wood", "Leather", "Cork", "Plastic", "Soft Grip", "Rubber", "Camel Back", "Aluminum", "Steel", "Fiberglass"}
SKU_RE = re.compile(r"^[A-Z]{1,5}\d{1,6}[A-Z0-9]*(?:-[A-Z0-9]+)*(?: \d/\d[A-Z]*)?\*?$")

# printed page ranges from the table of contents (printed page == PDF page)
SECTIONS = [
    (3, 12, "Flat Finishing Trowels", "Concrete", "Kraft Tool"),
    (13, 89, "Concrete", "Concrete", "Kraft Tool"),
    (90, 96, "Gator Tools", "Concrete", "Gator Tools"),
    (97, 100, "Asphalt", "General", "Kraft Tool"),
    (101, 110, "General Contractor", "General", "Kraft Tool"),
    (111, 115, "Hi-Craft", "General", "Hi-Craft"),
    (116, 126, "Sands Level & Tool", "Levels & Measuring", "Sands Level"),
    (127, 135, "W. Rose", "Masonry", "W. Rose"),
    (136, 151, "Masonry", "Masonry", "Kraft Tool"),
    (152, 161, "Plaster and EIFS", "Drywall & Plaster", "Kraft Tool"),
    (162, 173, "Drywall", "Drywall & Plaster", "Kraft Tool"),
    (174, 184, "Tile and Floor Covering", "Tile & Floor", "Kraft Tool"),
    (185, 187, "Apprentice Kits", "General", "Kraft Tool"),
    (188, 196, "Apparel", "General", "Kraft Tool"),
]


def section_for(page):
    for a, b, cat, grp, brand in SECTIONS:
        if a <= page <= b:
            return cat, grp, brand
    return None


def font(w):
    return w["fontname"].split("+")[-1]


def is_heading(w):
    f = font(w)
    if w["size"] > 24:
        return False
    return (("BlkCond" in f or "BoldCond" in f or "Caslon" in f and "Bold" in f) and w["size"] >= 11) and w["top"] > 38


def is_label(w):
    f = font(w)
    return "BdIt" in f or ("Caslon" in f and "Bold" in f and w["size"] < 11)


def is_bold(w):
    f = font(w)
    return any(k in f for k in ("Bd", "Bold", "Blk", "Black", "Heavy", "Semibold")) and w["size"] < 11


def is_sku(t):
    t = t.strip(",;").rstrip("*")
    return bool(SKU_RE.match(t)) and len(t) >= 4 and any(c.isdigit() for c in t)


def clean_sku(t):
    return t.strip(",;").rstrip("*")


def lines_of(words, tol=2.5):
    lines = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(lines[-1]["top"] - w["top"]) <= tol:
            lines[-1]["words"].append(w)
        else:
            lines.append({"top": w["top"], "words": [w]})
    for ln in lines:
        ln["words"].sort(key=lambda w: w["x0"])
    return lines


def cells_from(words, gap=6):
    cells = []
    for w in words:
        if cells and w["x0"] - cells[-1]["x1"] < gap and not w["text"].startswith("No"):
            cells[-1]["text"] += " " + w["text"]
            cells[-1]["x1"] = w["x1"]
        else:
            cells.append({"text": w["text"], "x0": w["x0"], "x1": w["x1"]})
    return cells


def undouble(t):
    if len(t) >= 6 and len(t) % 2 == 0 and all(t[i] == t[i + 1] for i in range(0, len(t), 2)):
        return t[::2]
    return t


def run_of(line_words, seed, pred, gap=15):
    """Extend a set of heading words along the line while gaps stay small."""
    ws = sorted(line_words, key=lambda w: w["x0"])
    sel = [w for w in ws if w in seed]
    if not sel:
        return sel
    lo, hi = min(ws.index(w) for w in sel), max(ws.index(w) for w in sel)
    while lo > 0 and pred(ws[lo - 1]) and ws[lo]["x0"] - ws[lo - 1]["x1"] < gap:
        lo -= 1
    while hi + 1 < len(ws) and pred(ws[hi + 1]) and ws[hi + 1]["x0"] - ws[hi]["x1"] < gap:
        hi += 1
    return ws[lo:hi + 1]


def join(ws):
    s = " ".join(undouble(w["text"]) for w in sorted(ws, key=lambda w: (round(w["top"] / 3), w["x0"])))
    s = re.sub(r"\s+®", "®", s)
    s = re.sub(r"\s+™", "™", s)
    return s.strip()


def overlap(a0, a1, b0, b1):
    return min(a1, b1) - max(a0, b0) > 0


def parse_page(page, pno):
    words = page.extract_words(extra_attrs=["size", "fontname"])
    words = [w for w in words if w["top"] > 32 and w["top"] < page.height - 30]
    merged = []
    for w in words:
        if merged and is_sku(merged[-1]["text"]) and re.match(r"^\d/\d[A-Z]*$", w["text"]) \
                and abs(merged[-1]["top"] - w["top"]) < 2 and 0 <= w["x0"] - merged[-1]["x1"] < 5:
            merged[-1] = dict(merged[-1], text=merged[-1]["text"] + " " + w["text"], x1=w["x1"])
        else:
            merged.append(w)
    words = merged
    lines = lines_of(words)
    tables = []

    for li, ln in enumerate(lines):
        nos = [w for w in ln["words"] if w["text"] in ("No.", "No") and is_bold(w)]
        if not nos:
            continue
        hdr = [w for w in ln["words"] if is_bold(w)]
        cells = cells_from(hdr)
        # split into groups at each "No." cell; cells before first No. are shared
        shared, groups, cur = [], [], None
        for c in cells:
            if c["text"].startswith("No"):
                cur = {"no": c, "attrs": []}
                groups.append(cur)
            elif cur is None:
                shared.append(c)
            else:
                cur["attrs"].append(c)
        if not groups:
            continue
        # a unit = one table; shared-leading tables form one unit with all groups
        units = [groups] if shared else [[g] for g in groups]
        for ui, ugroups in enumerate(units):
            all_cells = shared + [c for g in ugroups for c in [g["no"]] + g["attrs"]]
            x0 = min(c["x0"] for c in all_cells)
            # right boundary: next unit's left edge on this header line, else page edge
            if not shared and ui + 1 < len(units):
                xr = units[ui + 1][0]["no"]["x0"] - 3
            else:
                xr = page.width
            # group labels: BdIt / Bd text up to ~26pt above, over the No. column
            for g in ugroups:
                nx = g["no"]["x0"]
                lab = []
                for pl in lines[max(0, li - 3):li]:
                    if ln["top"] - pl["top"] > 26:
                        continue
                    lab += [w for w in pl["words"] if (is_label(w) or is_bold(w))
                            and nx - 8 <= w["x0"] <= nx + 55 and w["x0"] < xr]
                g["label"] = join(lab)
            # boundaries for every cell (sorted by x)
            ordered = sorted(all_cells, key=lambda c: c["x0"])
            for i, c in enumerate(ordered):
                nxt = ordered[i + 1]["x0"] - 3 if i + 1 < len(ordered) else min(xr, c["x0"] + 120)
                c["xb"] = nxt
            # rows
            rows, last_top = [], ln["top"]
            for ln2 in lines[li + 1:]:
                if ln2["top"] - last_top > 20:
                    break
                in_unit = [w for w in ln2["words"] if x0 - 8 <= w["x0"] < xr]
                skus = []
                for g in ugroups:
                    nx = g["no"]["x0"]
                    hit = [w for w in in_unit if abs(w["x0"] - nx) <= 10 and is_sku(w["text"])]
                    if hit:
                        skus.append((g, hit[0]))
                if not skus:
                    at_col = [w for w in in_unit if any(abs(w["x0"] - g["no"]["x0"]) <= 10 for g in ugroups)]
                    if at_col:
                        lab_ws = [w for w in in_unit if is_label(w) or is_bold(w)]
                        if lab_ws and len(lab_ws) == len(in_unit) and not any(w["text"].startswith("No") for w in in_unit):
                            # sub-table label (e.g. "ProForm® Handle") continuing the same columns
                            for g in ugroups:
                                nx = g["no"]["x0"]
                                g["label"] = join([w for w in lab_ws if nx - 8 <= w["x0"] <= nx + 55]) or g["label"]
                            last_top = ln2["top"]
                            continue
                        break
                    continue
                last_top = ln2["top"]

                def val(c):
                    ws = [w for w in in_unit if c["x0"] - 8 <= w["x0"] < c["xb"] and not is_sku(w["text"])]
                    return join(ws)

                base = {c["text"]: val(c) for c in shared}
                for g, sw in skus:
                    attrs = dict(base)
                    for c in g["attrs"]:
                        v = val(c)
                        if v:
                            attrs[c["text"]] = v
                    rows.append({"sku": clean_sku(sw["text"]), "label": g["label"], "attrs": attrs})
            if rows:
                ys = [ln["top"]]
                tables.append({"x0": x0, "x1": max(c["xb"] for c in all_cells) if xr == page.width else xr,
                               "top": ln["top"] - 26, "bottom": last_top, "rows": rows, "line": li})

    # inline "No. SKU" single items
    for li, ln in enumerate(lines):
        ws = ln["words"]
        for i, w in enumerate(ws[:-1]):
            if w["text"] in ("No.", "No") and is_sku(ws[i + 1]["text"]) and ws[i + 1]["x0"] - w["x1"] < 40:
                if any(t["top"] - 26 <= ln["top"] <= t["bottom"] + 2 and t["x0"] - 8 <= w["x0"] <= t["x1"] for t in tables):
                    continue
                tables.append({"x0": w["x0"], "x1": w["x0"] + 150, "top": ln["top"], "bottom": ln["top"],
                               "rows": [{"sku": clean_sku(ws[i + 1]["text"]), "label": "", "attrs": {}}], "line": li})

    # titles + descriptions
    tables.sort(key=lambda t: (t["top"], t["x0"]))
    for t in tables:
        t["title"], t["parent"], desc = None, None, []
        start = t["line"]
        # walk upward through lines
        for lj in range(start - 1, -1, -1):
            pl = lines[lj]
            if pl["top"] >= t["top"] + 26 and lj >= start:
                continue
            ws = [w for w in pl["words"] if overlap(w["x0"], w["x1"], t["x0"] - 12, min(t["x1"], t["x0"] + 260))]
            if not ws:
                continue
            # crossed another table?
            prev = [o for o in tables if o is not t and o["bottom"] <= pl["top"] + 3 and o["bottom"] >= pl["top"] - 3
                    and overlap(o["x0"], o["x1"], t["x0"], t["x1"]) and o["bottom"] < t["top"] + 26]
            if prev:
                t["parent"] = prev[0]
                break
            heads = [w for w in ws if is_heading(w)]
            if heads:
                heads = run_of(pl["words"], heads, is_heading)
                title_ws = list(heads)
                # extend upward over adjacent heading lines
                top_ref = pl["top"]
                for lk in range(lj - 1, -1, -1):
                    if top_ref - lines[lk]["top"] > 26:
                        break
                    hk = [w for w in lines[lk]["words"] if is_heading(w)
                          and overlap(w["x0"], w["x1"], heads[0]["x0"] - 12, heads[-1]["x1"] + 12)]
                    if hk:
                        hk = run_of(lines[lk]["words"], hk, is_heading)
                        title_ws = hk + title_ws; top_ref = lines[lk]["top"]
                title = join(title_ws)
                # a short sub-heading only: prefix the nearest main heading above in this column
                if len(title.split()) <= 2 and not any("BlkCond" in font(w) for w in title_ws):
                    for lk in range(lj - 1, -1, -1):
                        if pl["top"] - lines[lk]["top"] > 320:
                            break
                        hk = [w for w in lines[lk]["words"] if is_heading(w) and "BlkCond" in font(w)
                              and overlap(w["x0"], w["x1"], t["x0"] - 12, t["x0"] + 200)]
                        if hk:
                            title = join(run_of(lines[lk]["words"], hk, is_heading)) + " " + title
                            break
                t["title"] = title
                t["title_top"] = min(w["top"] for w in title_ws)
                t["title_x0"] = min(w["x0"] for w in title_ws)
                break
            if pl["top"] < t["top"] and not any(is_label(w) or is_bold(w) for w in ws):
                ext = sorted(ws, key=lambda w: w["x0"])
                for w in pl["words"]:
                    if w["x0"] > ext[-1]["x0"] and 0 <= w["x0"] - ext[-1]["x1"] < 12:
                        ext.append(w)
                desc.insert(0, join(ext))
            if t["top"] - pl["top"] > 260:
                break
        t["desc"] = desc
    return tables


def parse_desc(lines):
    feats, para = [], []
    for s in lines:
        if s.startswith("•"):
            feats.append(s.lstrip("• ").strip())
        elif feats and s and s[0].islower():
            feats[-1] += " " + s
        else:
            para.append(s)
    return " ".join(para).strip(), feats


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80]


def main():
    pdf = pdfplumber.open(PDF)
    products, seen_sku = [], set()
    for pno in range(3, len(pdf.pages) + 1):
        sec = section_for(pno)
        if not sec:
            continue
        cat, grp, brand = sec
        tables = parse_page(pdf.pages[pno - 1], pno)
        byt = {}
        for t in tables:
            root = t
            while root.get("parent") and not root.get("title"):
                root = root["parent"]
            title = root.get("title") or f"Untitled item (p.{pno})"
            title = re.sub(r"\s+", " ", title).strip()
            key = title
            if key not in byt:
                d, f = parse_desc(root.get("desc", []))
                byt[key] = {"name": title, "category": cat, "group": grp, "brand": brand,
                            "catalog_page": pno, "description": d, "features": f, "variants": []}
            x1 = min(t["x1"], t["x0"] + 420)
            reg = [round(min(t["x0"], t.get("title_x0", t["x0"])), 1), round(t.get("title_top", t["top"]), 1),
                   round(x1, 1), round(t["bottom"] + 12, 1)]
            byt[key].setdefault("regions", []).append(reg)
            for r in t["rows"]:
                if r["sku"] in seen_sku:
                    continue
                seen_sku.add(r["sku"])
                opts = {}
                lab = r["label"]
                if lab:
                    h = re.sub(r"\s*Handles?$", "", lab).replace("®", "").replace("™", "").strip()
                    if "Handle" in lab or h in HANDLES:
                        opts["Handle"] = h or lab
                    else:
                        opts["Type"] = lab
                for k, v in r["attrs"].items():
                    if v:
                        opts[k.rstrip(":")] = v
                byt[key]["variants"].append({"sku": r["sku"], "options": opts})
        products += [p for p in byt.values() if p["variants"]]

    # unique slugs
    used = set()
    for p in products:
        s = slugify(p["name"]) or "item"
        base, n = s, 2
        while s in used:
            s = f"{base}-{n}"; n += 1
        used.add(s); p["slug"] = s
    json.dump(products, open(OUT, "w"), indent=1, ensure_ascii=False)
    nv = sum(len(p["variants"]) for p in products)
    unt = sum(1 for p in products if p["name"].startswith("Untitled"))
    print(f"{len(products)} products, {nv} variants, {unt} untitled")


if __name__ == "__main__":
    main()
