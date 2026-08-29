import { readZeltechSnapshot } from "@/lib/server/zeltech-hq";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await readZeltechSnapshot();
    return Response.json(snapshot);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not read Zeltech HQ data.",
      },
      { status: 500 },
    );
  }
}
