import type { ProductOption, Variant } from "./types";

// A variant that lacks an option key (extraction left it out) is offered as "Standard".
export const NONE = "\u0000none";
const NONE_LABEL = "Standard";

type PickerAxis = { name: string; order: string[] };

export type PickerRow = {
  name: string;
  selected: string;
  values: { value: string; label: string; enabled: boolean }[];
};

export type PickerResult = {
  rows: PickerRow[];
  // Variants that match every selection. More than one means the SKU itself must be picked.
  candidates: Variant[];
  variant: Variant;
};

const valueOf = (v: Variant, name: string) => v.optionValues[name] ?? NONE;

/** Option axes that actually vary among the orderable variants, in display order. */
export function pickerAxes(options: ProductOption[], variants: Variant[]): PickerAxis[] {
  const names = options.map((o) => o.name);
  for (const v of variants) for (const k of Object.keys(v.optionValues)) if (!names.includes(k)) names.push(k);

  const axes: PickerAxis[] = [];
  for (const name of names) {
    const present = new Set(variants.map((v) => valueOf(v, name)));
    if (present.size <= 1) continue; // same for every variant: not a choice
    const declared = options.find((o) => o.name === name)?.values ?? [];
    const order = declared.filter((x) => present.has(x));
    for (const x of present) if (!order.includes(x) && x !== NONE) order.push(x);
    if (present.has(NONE)) order.push(NONE);
    axes.push({ name, order });
  }
  return axes;
}

/**
 * Resolve selections top-down: each axis only enables values that exist together with the
 * choices above it, so an impossible combination can never be selected. A selection that
 * stops being valid falls back to the first valid value.
 */
export function resolvePicker(
  axes: PickerAxis[],
  variants: Variant[],
  wanted: Record<string, string>,
  wantedVariantId?: string,
): PickerResult {
  let candidates = variants;
  const rows: PickerRow[] = [];

  for (const axis of axes) {
    const available = new Set(candidates.map((v) => valueOf(v, axis.name)));
    const want = wanted[axis.name];
    const selected = want !== undefined && available.has(want) ? want : axis.order.find((x) => available.has(x))!;
    rows.push({
      name: axis.name,
      selected,
      values: axis.order.map((value) => ({
        value,
        label: value === NONE ? NONE_LABEL : value,
        enabled: available.has(value),
      })),
    });
    candidates = candidates.filter((v) => valueOf(v, axis.name) === selected);
  }

  const variant = candidates.find((v) => v.id === wantedVariantId) ?? candidates[0];
  return { rows, candidates, variant };
}

/** Selections that point at a given variant, for starting the picker on it. */
export function selectionsFor(axes: PickerAxis[], variant: Variant): Record<string, string> {
  return Object.fromEntries(axes.map((a) => [a.name, valueOf(variant, a.name)]));
}
