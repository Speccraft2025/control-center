import "server-only";

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";

export type ZeltechVenture = {
  id: string;
  name: string;
  mission?: string;
  stage?: string;
  owner?: string;
  priority?: string;
  status?: string;
  health?: number;
  lastDeploy?: string;
  revenue?: number;
  users?: number;
  openIssues?: number;
  links?: {
    website?: string;
    repo?: string;
  };
  _repoSrc?: string;
  _siteSrc?: string;
  _sbSrc?: string;
  commits30d?: number;
  stars?: number;
  deployState?: string;
  recentCommits?: Array<{ msg: string; date: string }>;
  pushedAt?: string | null;
  siteUrl?: string;
  next?: string;
  blocker?: string;
};

export type ZeltechAction = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  source: string;
  type: string;
  priority: string;
  venture: string;
  title: string;
  detail: string;
  requiresApproval: boolean;
  owner: string;
  channel?: string;
  githubIssue?: unknown;
  meta?: Record<string, unknown>;
};

export type ZeltechCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  link?: string;
};

export type ZeltechBrief = {
  subject: string;
  html?: string;
  text: string;
  meta?: {
    provider?: string;
    model?: string;
  };
};

export type ZeltechAccountingSnapshot = {
  connected: boolean;
  provider: "Manager.io";
  companyName?: string;
  currencyCode?: string;
  currencySymbol?: string;
  chartOfAccounts: string[];
  updatedAt?: string;
  note: string;
};

export type ZeltechLiveSnapshot = {
  ventures: ZeltechVenture[];
  actions: ZeltechAction[];
  calendar: ZeltechCalendarEvent[];
  brief: ZeltechBrief | null;
  accounting: ZeltechAccountingSnapshot | null;
  checkedAt: string;
  source: {
    state: "cloud-sync" | "inventory-fallback";
    actions: "live" | "unavailable";
    calendar: "live" | "unavailable";
    brief: "live" | "unavailable";
    accounting: "live" | "detected";
  };
  warnings: string[];
};

const HQ_ROOT = "/Users/speccraftmedialtd./Documents/Web/Zeltech HQ";
const HQ_INDEX_PATH = path.join(HQ_ROOT, "index.html");
const PUBLIC_BASE = "https://zeltech-hq.netlify.app/.netlify/functions";
const MANAGER_DB_PATH =
  "/Users/speccraftmedialtd./Documents/Manager.io/Spec Craft Media Ltd.manager";

function extractInventory(html: string) {
  const match = html.match(/const INVENTORY = (\[[\s\S]*?\]);\s*function seed\(/);
  if (!match) throw new Error("Could not find Zeltech HQ inventory.");
  return JSON.parse(match[1]) as ZeltechVenture[];
}

async function readInventory() {
  const html = readFileSync(HQ_INDEX_PATH, "utf8");
  return extractInventory(html);
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url} with ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchMetrics(venture: ZeltechVenture) {
  const params = new URLSearchParams();
  if (venture._repoSrc) params.set("repo", venture._repoSrc);
  if (venture._siteSrc) params.set("site", venture._siteSrc);
  if (venture._sbSrc) params.set("sb", venture._sbSrc);
  if (![...params].length) return {};
  try {
    return await fetchJson<Partial<ZeltechVenture>>(
      `${PUBLIC_BASE}/venture-metrics?${params.toString()}`,
    );
  } catch {
    return {};
  }
}

async function enrichVentures(ventures: ZeltechVenture[]) {
  return Promise.all(
    ventures.map(async (venture) => ({
      ...venture,
      ...(await fetchMetrics(venture)),
    })),
  );
}

async function readCloudState() {
  const secret = process.env.HQ_SYNC_SECRET;
  if (!secret) return null;
  try {
    const payload = await fetchJson<{
      state?: { ventures?: ZeltechVenture[] };
      empty?: boolean;
    }>(`${PUBLIC_BASE}/hq-state`, {
      headers: { "x-hq-secret": secret },
    });
    if (!payload.state?.ventures?.length) return null;
    return payload.state.ventures;
  } catch {
    return null;
  }
}

async function readActions() {
  try {
    const payload = await fetchJson<{
      actions?: ZeltechAction[];
    }>(`${PUBLIC_BASE}/zel-actions`);
    return payload.actions || [];
  } catch {
    return [];
  }
}

async function readCalendar() {
  try {
    const payload = await fetchJson<{
      events?: ZeltechCalendarEvent[];
      error?: string;
    }>(`${PUBLIC_BASE}/gcal?action=upcoming&days=14`);
    return payload.events || [];
  } catch {
    return [];
  }
}

async function readBrief() {
  try {
    const payload = await fetchJson<{
      subject?: string;
      html?: string;
      text?: string;
      meta?: ZeltechBrief["meta"];
      error?: string;
    }>(`${PUBLIC_BASE}/zel-brief`);
    if (!payload.text || !payload.subject) return null;
    return {
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      meta: payload.meta,
    } satisfies ZeltechBrief;
  } catch {
    return null;
  }
}

function decodeAscii(blob: Uint8Array) {
  return Buffer.from(blob)
    .toString("utf8")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readAccountingSnapshot() {
  try {
    const database = new DatabaseSync(MANAGER_DB_PATH, { readOnly: true });
    const rows = database
      .prepare(
        "SELECT ContentType, Key, Content, Timestamp FROM Objects ORDER BY Timestamp DESC",
      )
      .all() as Array<{
      ContentType: string;
      Key: string;
      Content: Uint8Array;
      Timestamp: number;
    }>;
    database.close();

    const names = new Set<string>();
    let companyName: string | undefined;
    let currencyCode: string | undefined;
    let currencySymbol: string | undefined;
    let updatedAt: string | undefined;

    for (const row of rows) {
      const text = decodeAscii(row.Content);
      if (!text) continue;
      if (!updatedAt) {
        const unixMs = Math.max(0, Math.round((row.Timestamp - 621355968000000000) / 10000));
        if (unixMs > 0) updatedAt = new Date(unixMs).toISOString();
      }
      if (!companyName) {
        const companyMatch = text.match(/([A-Z][A-Za-z&.\s]+Ltd\.?)/);
        if (companyMatch) companyName = companyMatch[1].trim();
      }
      if (!currencyCode || !currencySymbol) {
        const currencyMatch = text.match(/\b([A-Z]{3})\s+"?\s*([A-Za-z]{2,5})\b/);
        if (currencyMatch) {
          currencyCode = currencyMatch[1];
          currencySymbol = currencyMatch[2];
        }
      }
      if (/income|sales|revenue|fees|tax|assets|allowance|loan|investment/i.test(text)) {
        const accountMatch = text.match(/([A-Za-z][A-Za-z0-9&./\-()' ]{2,80})/g) || [];
        for (const candidate of accountMatch) {
          const clean = candidate.trim();
          if (
            clean.length >= 4 &&
            !/^[A-Z]{2,5}$/.test(clean) &&
            !/\d{4,}/.test(clean)
          ) {
            names.add(clean);
          }
        }
      }
    }

    return {
      connected: true,
      provider: "Manager.io",
      companyName,
      currencyCode,
      currencySymbol,
      chartOfAccounts: [...names].slice(0, 24),
      updatedAt,
      note:
        "Manager.io ledger detected locally. Control Center is using this as the authoritative money source, but the raw object store does not expose report totals directly without a report export or API bridge.",
    } satisfies ZeltechAccountingSnapshot;
  } catch {
    return null;
  }
}

export async function readZeltechVentures() {
  const live = await readZeltechSnapshot();
  return live.ventures;
}

export async function readZeltechSnapshot(): Promise<ZeltechLiveSnapshot> {
  const warnings: string[] = [];
  const cloudVentures = await readCloudState();
  const baseVentures = cloudVentures || (await readInventory());
  if (!cloudVentures) {
    warnings.push(
      "HQ_SYNC_SECRET is not available locally, so the private synced ZelHQ state could not be pulled. Using the local venture registry plus live venture metrics instead.",
    );
  }

  const [ventures, actions, calendar, brief] = await Promise.all([
    enrichVentures(baseVentures),
    readActions(),
    readCalendar(),
    readBrief(),
  ]);
  const accounting = readAccountingSnapshot();
  if (!accounting) {
    warnings.push("Manager.io was not readable from this machine.");
  }

  return {
    ventures,
    actions,
    calendar,
    brief,
    accounting,
    checkedAt: new Date().toISOString(),
    source: {
      state: cloudVentures ? "cloud-sync" : "inventory-fallback",
      actions: actions.length ? "live" : "unavailable",
      calendar: calendar.length ? "live" : "unavailable",
      brief: brief ? "live" : "unavailable",
      accounting: accounting?.connected ? "live" : "detected",
    },
    warnings,
  };
}
