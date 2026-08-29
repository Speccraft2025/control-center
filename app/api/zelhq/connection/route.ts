import { readZeltechBackendConfig } from "@/lib/server/zeltech-config";

export const runtime = "nodejs";

export async function GET() {
  const config = readZeltechBackendConfig();
  return Response.json({
    ...config,
    checkedAt: new Date().toISOString(),
    summary:
      config.mode === "shared-backend"
        ? "Control Center is attached to the same ZelHQ backend and can read private synced state server-side."
        : "Control Center is reading ZelHQ public endpoints only. Add HQ_SYNC_SECRET locally to attach the private synced backend too.",
  });
}
