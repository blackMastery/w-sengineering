#!/usr/bin/env bash
# Rebuild products.json, images, and supabase/seed.sql from the catalog PDF.
# Needs: docs/catalog/kraft-catalog-0126.pdf (not committed, 179 MB) and
#        pip install -r scripts/catalog/requirements.txt
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PDF="${1:-$ROOT/docs/catalog/kraft-catalog-0126.pdf}"
cd "$ROOT/data"
python3 ../scripts/catalog/extract.py "$PDF" products.json
rm -rf images && python3 ../scripts/catalog/images.py "$PDF"
python3 ../scripts/catalog/make_seed.py
mv seed.sql ../supabase/seed.sql
echo "Done: data/products.json, data/images/, data/variants_review.csv, supabase/seed.sql"
