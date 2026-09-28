export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Publishable key preferred; the legacy anon key works the same for these reads.
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
