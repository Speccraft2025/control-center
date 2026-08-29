import { readZeltechBackendConfig } from "@/lib/server/zeltech-config";

export const runtime = "nodejs";

export async function POST() {
  const secret = process.env.HQ_SYNC_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { error: "HQ_SYNC_SECRET is not configured locally." },
      { status: 400 },
    );
  }
  const { baseUrl } = readZeltechBackendConfig();
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/.netlify/functions/zel-autopilot`,
    {
      method: "POST",
      headers: { "x-hq-secret": secret },
      cache: "no-store",
    },
  );
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
