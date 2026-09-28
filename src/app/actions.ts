"use server";

import { getCartLineInfo, searchCatalog } from "@/lib/catalog";
import type { CartLineInfo, SearchResult } from "@/lib/types";

export async function searchAction(query: string): Promise<SearchResult> {
  if (typeof query !== "string") return { products: [], categories: [] };
  return searchCatalog(query, 8);
}

export async function cartLinesAction(variantIds: string[]): Promise<CartLineInfo[]> {
  if (!Array.isArray(variantIds)) return [];
  return getCartLineInfo(variantIds.filter((id) => typeof id === "string"));
}
