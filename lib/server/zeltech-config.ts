import "server-only";

export type ZeltechBackendConfig = {
  baseUrl: string;
  hasSyncSecret: boolean;
  hasSupabaseStorage: boolean;
  hasGoogleCalendar: boolean;
  hasGitHubToken: boolean;
  mode: "shared-backend" | "public-fallback";
};

export function readZeltechBackendConfig(): ZeltechBackendConfig {
  const baseUrl =
    process.env.ZELHQ_BASE_URL?.trim() || "https://zeltech-hq.netlify.app";
  const hasSyncSecret = Boolean(process.env.HQ_SYNC_SECRET?.trim());
  const hasSupabaseStorage =
    Boolean(process.env.HQ_SUPABASE_URL?.trim()) &&
    Boolean(process.env.HQ_SUPABASE_KEY?.trim());
  const hasGoogleCalendar =
    Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());
  const hasGitHubToken = Boolean(process.env.GITHUB_TOKEN?.trim());
  return {
    baseUrl,
    hasSyncSecret,
    hasSupabaseStorage,
    hasGoogleCalendar,
    hasGitHubToken,
    mode: hasSyncSecret ? "shared-backend" : "public-fallback",
  };
}
