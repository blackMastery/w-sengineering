export type OptionValues = Record<string, string>;

export type Category = { id: string; name: string; slug: string; count: number };

export type Group = {
  id: string;
  name: string;
  slug: string;
  categories: Category[];
  count: number;
  image: string | null; // storage_path of a representative photo
};

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  image: string | null;
  price: number | null; // lowest price among orderable variants; null = Price on request
  hasFrom: boolean; // variants differ in price, show "From"
  variantCount: number;
  // Set when the product has exactly one orderable variant, so it can be added from a tile.
  quickAdd: { variantId: string; sku: string } | null;
  isFeatured: boolean;
  isNew: boolean;
};

export type Variant = {
  id: string;
  sku: string;
  optionValues: OptionValues;
  price: number | null;
  sort: number;
};

export type ProductOption = { name: string; values: string[] };

export type ProductImage = { id: string; path: string; variantId: string | null };

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: string[];
  specs: Record<string, string>;
  brand: { name: string; slug: string };
  category: { id: string; name: string; slug: string };
  group: { name: string; slug: string };
  options: ProductOption[];
  variants: Variant[]; // orderable only
  images: ProductImage[];
};

export type CartLineInfo = {
  variantId: string;
  sku: string;
  price: number | null;
  optionValues: OptionValues;
  productSlug: string;
  productName: string;
  image: string | null;
};

export type SearchResult = {
  products: (ProductCard & { matchedSku: string | null })[];
  categories: { name: string; href: string; count: number }[];
};
