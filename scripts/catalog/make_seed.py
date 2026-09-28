"""Turn products.json into supabase/seed.sql (idempotent, deterministic UUIDs)."""
import csv, json, os, uuid

NS = uuid.UUID("6f1c2a9e-8d3b-4c1e-9a55-0b7e2d4f1a10")
# pages 188+ are dealer display fixtures and apparel (garbled layout) -> excluded
P = [p for p in json.load(open("products.json")) if p["catalog_page"] < 188]

GROUPS = ["Concrete", "Masonry", "Drywall & Plaster", "Tile & Floor", "Levels & Measuring", "General"]
CATS = [  # (name, group, first page, last page)
    ("Flat Finishing Trowels", "Concrete", 3, 12), ("Concrete", "Concrete", 13, 89),
    ("Gator Tools", "Concrete", 90, 96), ("Masonry", "Masonry", 136, 151), ("W. Rose", "Masonry", 127, 135),
    ("Drywall", "Drywall & Plaster", 162, 173), ("Plaster and EIFS", "Drywall & Plaster", 152, 161),
    ("Tile and Floor Covering", "Tile & Floor", 174, 184), ("Sands Level & Tool", "Levels & Measuring", 116, 126),
    ("General Contractor", "General", 101, 110), ("Asphalt", "General", 97, 100), ("Hi-Craft", "General", 111, 115),
    ("Apprentice Kits", "General", 185, 187),
]
BRANDS = ["Kraft Tool", "Gator Tools", "Hi-Craft", "Sands Level", "W. Rose"]
NOISE = {"•", "NOT", "-", "*"}


def uid(*parts):
    return str(uuid.uuid5(NS, "|".join(parts)))


def slug(s):
    import re
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, cols, rows, conflict="id"):
    out = []
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        vals = ",\n".join("(" + ", ".join(q(r[c]) for c in cols) + ")" for r in chunk)
        out.append(f"insert into public.{table} ({', '.join(cols)}) values\n{vals}\non conflict ({conflict}) do nothing;\n")
    return "\n".join(out)


# ---- shape products: constant attributes -> specs, varying -> options
products, options, variants, review = [], [], [], []
for p in P:
    vs = p["variants"]
    for v in vs:
        v["options"] = {k: val for k, val in v["options"].items() if val and val not in NOISE}
    keys = []
    for v in vs:
        for k in v["options"]:
            if k not in keys:
                keys.append(k)
    specs, opt_keys = {}, []
    for k in keys:
        vals = [v["options"].get(k) for v in vs]
        distinct = {x for x in vals if x}
        if len(vs) == 1 or (len(distinct) == 1 and all(vals)):
            specs[k] = next(iter(distinct))
        else:
            opt_keys.append(k)
    pid = uid("product", p["slug"])
    products.append({
        "id": pid, "slug": p["slug"], "name": p["name"],
        "category_id": uid("category", p["category"]), "brand_id": uid("brand", p["brand"]),
        "supplier_id": uid("supplier", "Kraft Tool Co."),
        "description": p["description"] or None, "features": p["features"], "specs": specs,
        "catalog_page": p["catalog_page"], "is_featured": False, "is_new": False,
        "needs_review": p["name"].startswith("Untitled") or len(p["name"].split()) <= 2,
    })
    for i, k in enumerate(opt_keys):
        vals = []
        for v in vs:
            x = v["options"].get(k)
            if x and x not in vals:
                vals.append(x)
        options.append({"id": uid("option", pid, k), "product_id": pid, "name": k, "sort": i, "values": vals})
    for i, v in enumerate(vs):
        ov = {k: v["options"][k] for k in opt_keys if k in v["options"]}
        variants.append({"id": uid("variant", v["sku"]), "product_id": pid, "sku": v["sku"], "option_values": ov,
                         "usd_cost": None, "price_override": None, "is_orderable": True, "sort": i})
        review.append([v["sku"], p["name"], p["catalog_page"], p["category"], p["brand"],
                       "; ".join(f"{k}: {x}" for k, x in ov.items()),
                       "yes" if products[-1]["needs_review"] else ""])

# product images (from images.py) -> storage paths in the product-images bucket
images = []
if os.path.exists("images.json"):
    imap = json.load(open("images.json"))
    for p in products:
        for i, f in enumerate(imap.get(p["slug"], [])):
            images.append({"id": uid("image", p["id"], f), "product_id": p["id"], "variant_id": None,
                           "storage_path": f"catalog/{f}", "sort": i})

# values arrays are text[]; render them specially
def opt_rows():
    rows = []
    for o in options:
        arr = "array[" + ", ".join(q(x) for x in o["values"]) + "]::text[]" if o["values"] else "'{}'::text[]"
        rows.append(f"({q(o['id'])}, {q(o['product_id'])}, {q(o['name'])}, {o['sort']}, {arr})")
    out = []
    for i in range(0, len(rows), 500):
        out.append("insert into public.product_options (id, product_id, name, sort, \"values\") values\n"
                   + ",\n".join(rows[i:i + 500]) + "\non conflict (id) do nothing;\n")
    return "\n".join(out)


def feat_fix(sql_rows):
    return sql_rows


sql = ["-- Seed generated from Kraft Tool Co. Series 0126 catalog (PDF).",
       "-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING.",
       f"-- {len(products)} products, {len(variants)} variants. Prices intentionally null (Price on request).\n",
       "begin;\n",
       insert("suppliers", ["id", "name"], [{"id": uid("supplier", "Kraft Tool Co."), "name": "Kraft Tool Co."}]),
       insert("category_groups", ["id", "name", "slug", "sort"],
              [{"id": uid("group", g), "name": g, "slug": slug(g), "sort": i} for i, g in enumerate(GROUPS)]),
       insert("categories", ["id", "group_id", "name", "slug", "sort", "catalog_pages"],
              [{"id": uid("category", c), "group_id": uid("group", g), "name": c, "slug": slug(c), "sort": i,
                "catalog_pages": f"{a}-{b}"} for i, (c, g, a, b) in enumerate(CATS)]),
       insert("brands", ["id", "name", "slug"], [{"id": uid("brand", b), "name": b, "slug": slug(b)} for b in BRANDS]),
       insert("products", ["id", "slug", "name", "category_id", "brand_id", "supplier_id", "description", "features",
                           "specs", "catalog_page", "is_featured", "is_new", "needs_review"], products),
       opt_rows(),
       insert("variants", ["id", "product_id", "sku", "option_values", "usd_cost", "price_override",
                           "is_orderable", "sort"], variants),
       insert("product_images", ["id", "product_id", "variant_id", "storage_path", "sort"], images) if images else "",
       "insert into public.settings (id, exchange_rate, markup_pct) values (1, null, null) on conflict (id) do nothing;\n",
       "commit;\n"]
open("seed.sql", "w").write("\n".join(sql))

with open("variants_review.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["sku", "product", "catalog_page", "category", "brand", "options", "name_needs_review"])
    w.writerows(review)

print(len(images), "images,", len(products), "products", len(options), "option sets", len(variants), "variants",
      sum(p["needs_review"] for p in products), "names flagged for review")
