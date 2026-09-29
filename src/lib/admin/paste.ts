// Parses pasted GYD prices for bulk entry. Two shapes are accepted:
//   SKU mode:    "CFE435  5,299" per line (tab, comma, semicolon or spaces between SKU and price)
//   column mode: one price per line, applied to the listed rows in order
// Prices are whole Guyanese dollars: "5299", "5,299", "GYD 5,299", "G$5,299", "$5,299" and a
// spreadsheet's "5,299.00" are all 5299. Real fractions ("5,299.50") are rejected, not rounded.

export type PasteResult =
  | { mode: "sku"; prices: Map<number, number>; unknown: string[]; invalid: string[] }
  | { mode: "column"; prices: Map<number, number>; invalid: string[]; countMismatch: { pasted: number; rows: number } | null }
  | { mode: "empty" };

/** "GYD 5,299" → 5299; anything that isn't a whole GYD amount → null. */
export function parseGyd(input: string): number | null {
  const s = input.trim().replace(/^(GYD|G\$|\$)\s*/i, "");
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.0{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, "").replace(/\.0+$/, ""));
  return Number.isSafeInteger(n) && n < 1e9 ? n : null;
}

export function parsePaste(text: string, skus: string[]): PasteResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { mode: "empty" };

  const prices = new Map<number, number>();
  const invalid: string[] = [];

  // Column mode: every line is just a price.
  if (lines.every((l) => parseGyd(l) !== null)) {
    lines.forEach((l, i) => {
      if (i < skus.length) prices.set(i, parseGyd(l)!);
    });
    return {
      mode: "column",
      prices,
      invalid,
      countMismatch: lines.length === skus.length ? null : { pasted: lines.length, rows: skus.length },
    };
  }

  // SKU mode: first token is the SKU, the price is at the end of the line.
  // Anything in between (a description, a "GYD" label) is ignored.
  const index = new Map(skus.map((s, i) => [s.toUpperCase(), i]));
  const unknown: string[] = [];
  for (const line of lines) {
    const tokens = /[\s;\t]/.test(line)
      ? line.split(/[\s;\t]+/).map((t) => t.replace(/,+$/, "")).filter(Boolean)
      : line.includes(",")
        ? [line.slice(0, line.indexOf(",")), line.slice(line.indexOf(",") + 1)]
        : [line];
    const sku = tokens[0]?.toUpperCase();
    const price = tokens.length >= 2 ? parseGyd(tokens[tokens.length - 1]) : null;
    if (!sku || price === null) {
      invalid.push(line);
      continue;
    }
    const i = index.get(sku);
    if (i === undefined) unknown.push(sku);
    else prices.set(i, price);
  }
  return { mode: "sku", prices, unknown, invalid };
}
