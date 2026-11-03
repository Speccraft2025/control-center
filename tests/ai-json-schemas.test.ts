import assert from "node:assert/strict";
import test from "node:test";
import {
  INDUSTRY_SELECTION_SCHEMA,
  MENTION_CURATION_SCHEMA,
  NEWSLETTER_GROUP_SCHEMA,
  NEWSLETTER_PRIORITY_SCHEMA,
  NEWSLETTER_STORY_SCHEMA,
  type AiJsonSchema,
} from "../lib/ai-json-schemas";
import { validateMentionCurations } from "../lib/mention-curation";
import {
  applyNewsletterAiGroups,
  applyNewsletterAiPriorities,
  buildNewsletterTopics,
  validateNewsletterAiStories,
  type NewsletterMentionRecord,
} from "../lib/newsletter-intelligence";

const ALL_SCHEMAS = [
  INDUSTRY_SELECTION_SCHEMA,
  MENTION_CURATION_SCHEMA,
  NEWSLETTER_STORY_SCHEMA,
  NEWSLETTER_GROUP_SCHEMA,
  NEWSLETTER_PRIORITY_SCHEMA,
];

// LM Studio rejects a strict schema containing any keyword outside this set,
// so a well-meaning minLength would disable structured output instead of
// tightening it. Length and range limits belong in the validators.
const STRICT_KEYWORDS = new Set(["type", "properties", "required", "additionalProperties", "items"]);

function walk(node: unknown, visit: (object: Record<string, unknown>) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((entry) => walk(entry, visit));
  const object = node as Record<string, unknown>;
  visit(object);
  for (const value of Object.values(object)) walk(value, visit);
}

// A reply that satisfies the schema, with text long enough to clear the
// validators' own minimum lengths.
function sampleFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return Object.fromEntries(Object.entries(properties).map(([key, property]) => {
    if (property.type === "number") return [key, 80];
    if (property.type === "boolean") return [key, false];
    if (property.type === "string") return [key, `A neutral ${key} long enough to pass validation`];
    if (property.type === "array") {
      const items = property.items as Record<string, unknown>;
      return [key, [items.type === "string" ? `${key}-1` : sampleFromSchema(items)]];
    }
    return [key, sampleFromSchema(property)];
  }));
}

function envelope(schema: AiJsonSchema) {
  const keys = Object.keys((schema.schema.properties ?? {}) as Record<string, unknown>);
  assert.equal(keys.length, 1, `${schema.name} should wrap exactly one list`);
  return keys[0];
}

function reply(schema: AiJsonSchema, entries: Record<string, unknown>[]) {
  return { [envelope(schema)]: entries };
}

function entryOf(schema: AiJsonSchema, overrides: Record<string, unknown> = {}) {
  const list = (schema.schema.properties as Record<string, Record<string, unknown>>)[envelope(schema)];
  return { ...sampleFromSchema(list.items as Record<string, unknown>), ...overrides };
}

function mention(overrides: Partial<NewsletterMentionRecord>): NewsletterMentionRecord {
  return {
    id: "mention-one",
    issueId: "issue-one",
    canonicalUrl: "https://example.com/news/story",
    url: "https://example.com/news/story",
    title: "Acme launches a major new research model",
    context: "Acme launched a major new research model this morning.",
    publisher: "example.com",
    newsletterSender: "Daily Brief",
    newsletterSubject: "Today's news",
    receivedAt: "2026-08-25T16:00:00.000Z",
    gmailUrl: "https://mail.google.com/mail/u/test@example.com/#all/issue-one",
    firstSeenAt: "2026-08-25T17:00:00.000Z",
    ...overrides,
  };
}

test("every local curation schema stays inside the strict keyword subset", () => {
  for (const schema of ALL_SCHEMAS) {
    assert.match(schema.name, /^[a-z][a-z0-9_]*$/, `${schema.name} needs a plain identifier for LM Studio`);
    walk(schema.schema, (object) => {
      if (typeof object.type !== "string") return;
      for (const key of Object.keys(object)) {
        assert.ok(STRICT_KEYWORDS.has(key), `${schema.name} uses unsupported keyword "${key}"`);
      }
      if (object.type === "object") {
        assert.equal(object.additionalProperties, false, `${schema.name} must close its objects`);
        assert.deepEqual(object.required, Object.keys(object.properties as Record<string, unknown>),
          `${schema.name} must require every property under strict mode`);
      }
    });
  }
});

test("the mention schema's envelope is what the mention validator accepts", () => {
  const entry = entryOf(MENTION_CURATION_SCHEMA, { id: "men-1" });
  assert.equal(validateMentionCurations(reply(MENTION_CURATION_SCHEMA, [entry]), new Set(["men-1"])).length, 1);
  // The observed local-model failure: correct fields, no wrapper object.
  assert.throws(() => validateMentionCurations([entry], new Set(["men-1"])), /summaries list/);
});

test("the newsletter story schema's envelope is what the story validator accepts", () => {
  const links = [{ id: "linkIds-1", url: "https://example.com/story", title: "Acme ships a model" }];
  const entry = entryOf(NEWSLETTER_STORY_SCHEMA);
  assert.equal(validateNewsletterAiStories(reply(NEWSLETTER_STORY_SCHEMA, [entry]), links).length, 1);
  assert.throws(() => validateNewsletterAiStories([entry], links), /stories list/);
});

test("a sponsored story the schema permits is still dropped as advertising", () => {
  const links = [{ id: "linkIds-1", url: "https://example.com/story", title: "Acme ships a model" }];
  const entry = entryOf(NEWSLETTER_STORY_SCHEMA, { sponsored: true });
  assert.equal(validateNewsletterAiStories(reply(NEWSLETTER_STORY_SCHEMA, [entry]), links).length, 0);
});

test("the newsletter group and priority schemas match their validators", () => {
  const topics = [
    ...buildNewsletterTopics([mention({})], "scope-one"),
    ...buildNewsletterTopics([mention({
      id: "mention-two",
      issueId: "issue-two",
      canonicalUrl: "https://other.example/acme-model",
      url: "https://other.example/acme-model",
      title: "Acme confirms the research model release",
    })], "scope-one"),
  ];
  assert.equal(topics.length, 2);

  const group = entryOf(NEWSLETTER_GROUP_SCHEMA, { ids: topics.map((topic) => topic.id) });
  assert.equal(applyNewsletterAiGroups(reply(NEWSLETTER_GROUP_SCHEMA, [group]), topics, "ollama").length, 1);
  assert.throws(() => applyNewsletterAiGroups([group], topics, "ollama"), /groups list/);

  const priorities = topics.map((topic) => entryOf(NEWSLETTER_PRIORITY_SCHEMA, { id: topic.id }));
  const ranked = applyNewsletterAiPriorities(reply(NEWSLETTER_PRIORITY_SCHEMA, priorities), topics, "ollama");
  assert.equal(ranked.length, 2);
  assert.ok(ranked.every((topic) => topic.importanceBaseScore !== undefined));
  assert.throws(() => applyNewsletterAiPriorities(priorities, topics, "ollama"), /priority list/);
});

test("the industry schema carries the fields the industry curator reads", () => {
  // validatedSelections is module-local to lib/server/industry-ai.ts; this
  // pins the contract it parses so the schema cannot drift away from it.
  assert.equal(envelope(INDUSTRY_SELECTION_SCHEMA), "selections");
  assert.deepEqual(Object.keys(entryOf(INDUSTRY_SELECTION_SCHEMA)), ["id", "score", "reason"]);
});
