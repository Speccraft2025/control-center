import { readZeltechBackendConfig } from "@/lib/server/zeltech-config";

export const runtime = "nodejs";

function actionsUrl() {
  const { baseUrl } = readZeltechBackendConfig();
  return `${baseUrl.replace(/\/$/, "")}/.netlify/functions/zel-actions`;
}

export async function GET() {
  const response = await fetch(actionsUrl(), { cache: "no-store" });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function PUT(request: Request) {
  const secret = process.env.HQ_SYNC_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { error: "HQ_SYNC_SECRET is not configured locally." },
      { status: 400 },
    );
  }
  const response = await fetch(actionsUrl(), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-hq-secret": secret,
    },
    body: await request.text(),
    cache: "no-store",
  });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const secret = process.env.HQ_SYNC_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { error: "HQ_SYNC_SECRET is not configured locally." },
      { status: 400 },
    );
  }
  const response = await fetch(actionsUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hq-secret": secret,
    },
    body: await request.text(),
    cache: "no-store",
  });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
