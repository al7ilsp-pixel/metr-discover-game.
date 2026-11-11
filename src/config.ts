const env = import.meta.env as Record<string, string | undefined>;

export const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const METR_MAIN_URL = (env.VITE_METR_MAIN_URL ?? '').trim();

/** Demo mode runs entirely in one browser (several tabs) – for UI testing only. */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
