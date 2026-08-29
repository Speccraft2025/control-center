import type {
  BusinessProfile,
  OpportunityItem,
  ReminderItem,
  WorkspaceState,
} from "@/lib/types";
import { getDatabase } from "@/lib/server/database";
import { hasWorkspaceState, readWorkspaceState, writeWorkspaceState } from "@/lib/workspace-store";
import { cleanTaskItems } from "@/lib/tasks";
import { legacyBrowserImportAllowed } from "@/lib/server/settings";

export const runtime = "nodejs";

function cleanId(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? value : crypto.randomUUID();
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function cleanReminders(value: unknown): ReminderItem[] {
  if (!Array.isArray(value)) throw new Error("Reminders must be a list.");
  if (value.length > 10_000) throw new Error("The reminder list is too large.");
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ReminderItem>;
    const title = cleanText(candidate.title).trim();
    if (!title) return [];
    return [{
      id: cleanId(candidate.id),
      type: cleanText(candidate.type, candidate.url ? "Link" : "Saved"),
      title,
      source: cleanText(candidate.source, "Manual"),
      note: cleanText(candidate.note, "Saved for later."),
      accent: cleanText(candidate.accent, "teal"),
      url: cleanText(candidate.url) || undefined,
      createdAt: cleanText(candidate.createdAt) || undefined,
      archivedAt: cleanText(candidate.archivedAt) || undefined,
      added: cleanText(candidate.added) || undefined,
    }];
  });
}

function cleanMoney(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function cleanBusinesses(value: unknown): BusinessProfile[] {
  if (!Array.isArray(value)) throw new Error("Businesses must be a list.");
  if (value.length > 1_000) throw new Error("The business list is too large.");
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<BusinessProfile>;
    const name = cleanText(candidate.name).trim();
    if (!name) return [];
    return [{
      id: cleanId(candidate.id),
      name,
      stage: cleanText(candidate.stage, "Active"),
      owner: cleanText(candidate.owner, "Founder"),
      focus: cleanText(candidate.focus, "Clarify the next revenue move."),
      revenueTarget: cleanMoney(candidate.revenueTarget),
      cashCollected: cleanMoney(candidate.cashCollected),
      pipelineValue: cleanMoney(candidate.pipelineValue),
      nextAction: cleanText(candidate.nextAction, "Decide the next revenue action."),
      topBlocker: cleanText(candidate.topBlocker, "No blocker captured."),
      notes: cleanText(candidate.notes) || undefined,
      updatedAt: cleanText(candidate.updatedAt) || undefined,
    }];
  });
}

function cleanOpportunities(value: unknown): OpportunityItem[] {
  if (!Array.isArray(value)) throw new Error("Opportunities must be a list.");
  if (value.length > 10_000) throw new Error("The opportunity list is too large.");
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<OpportunityItem>;
    const title = cleanText(candidate.title).trim();
    if (!title) return [];
    const confidence = cleanText(candidate.confidence, "Medium");
    const speed = cleanText(candidate.speed, "This week");
    const status = cleanText(candidate.status, "Open");
    return [{
      id: cleanId(candidate.id),
      businessId: cleanId(candidate.businessId),
      title,
      description: cleanText(candidate.description, "Revenue opportunity."),
      value: cleanMoney(candidate.value),
      confidence:
        confidence === "High" || confidence === "Low" ? confidence : "Medium",
      speed:
        speed === "Now" || speed === "This month" ? speed : "This week",
      status:
        status === "In progress" || status === "Won" || status === "Lost"
          ? status
          : "Open",
      nextStep: cleanText(candidate.nextStep, "Decide the next step."),
      source: cleanText(candidate.source, "Manual"),
      createdAt: cleanText(candidate.createdAt) || undefined,
      updatedAt: cleanText(candidate.updatedAt) || undefined,
    }];
  });
}

export async function GET() {
  try {
    const database = getDatabase();
    return Response.json({
      ...readWorkspaceState(database),
      initialized: hasWorkspaceState(database),
      legacyBrowserImportAllowed: legacyBrowserImportAllowed(),
    });
  } catch {
    return Response.json(
      { error: "Tasks and reminders could not be read safely. Restore the local database from a backup before making changes." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Partial<WorkspaceState>;
    const state: WorkspaceState = {
      reminders: cleanReminders(body.reminders),
      tasks: cleanTaskItems(body.tasks),
      businesses: cleanBusinesses(body.businesses),
      opportunities: cleanOpportunities(body.opportunities),
    };
    return Response.json(writeWorkspaceState(getDatabase(), state));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save the local workspace." }, { status: 400 });
  }
}
