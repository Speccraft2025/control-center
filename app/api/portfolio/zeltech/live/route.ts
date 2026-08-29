import { readZeltechSnapshot } from "@/lib/server/zeltech-hq";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await readZeltechSnapshot());
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not read Zeltech HQ live data.",
      },
      { status: 500 },
    );
  }
}
