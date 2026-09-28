// Parses pasted supplier costs for bulk entry. Two shapes are accepted:
//   SKU mode:    "CFE435  25.90" per line (tab, comma, semicolon or spaces; "$" and thousands commas ok)
//   column mode: one cost per line, applied to the listed rows in order
// Returns costs by row index plus anything that couldn't be used.

export type PasteResult =
  | { mode: "sku"; costs: Map<number, number>; unknown: string[]; invalid: string[] }
  | { mode: "column"; costs: Map<number, number>; invalid: string[]; countMismatch: { pasted: number; rows: number } | null }
  | { mode: "empty" };

const MONEY = /^\$?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\$?\d+(\.\d{1,2})?$/;
const toNumber = (s: string) => Number(s.replace(/[$,]/g, ""));

export function parsePaste(text: string, skus: string[]): PasteResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { mode: "empty" };

  // "CFE435 25.90", "CFE435\t25.90", "CFE435; 25.90", "CFE435, 25.90" or "CFE435,25.90".
  // Anything between the first and last token (e.g. a description) is ignored.
  const tokenize = (l: string) => {
    if (/[\s;]/.test(l)) return l.split(/[\s;]+/).map((t) => t.replace(/,+$/, "")).filter(Boolean);
    const i = l.indexOf(",");
    return i < 0 ? [l] : [l.slice(0, i), l.slice(i + 1)];
  };
  const isColumn = lines.every((l) => MONEY.test(l.replace(/\s/g, "")));

  const costs = new Map<number, number>();
  const invalid: string[] = [];

  if (isColumn) {
    lines.forEach((l, i) => {
      if (i < skus.length) costs.set(i, toNumber(l.replace(/\s/g, "")));
    });
    return {
      mode: "column",
      costs,
      invalid,
      countMismatch: lines.length === skus.length ? null : { pasted: lines.length, rows: skus.length },
    };
  }

  const index = new Map(skus.map((s, i) => [s.toUpperCase(), i]));
  const unknown: string[] = [];
  for (const line of lines) {
    const tokens = tokenize(line);
    const sku = tokens[0]?.toUpperCase();
    const value = tokens[tokens.length - 1];
    if (!sku || tokens.length < 2 || !MONEY.test(value)) {
      invalid.push(line);
      continue;
    }
    const i = index.get(sku);
    if (i === undefined) unknown.push(sku);
    else costs.set(i, toNumber(value));
  }
  return { mode: "sku", costs, unknown, invalid };
}
