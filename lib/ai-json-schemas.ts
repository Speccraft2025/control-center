// Local models return the right field names but routinely drop the wrapper
// object every validator requires: a 7B model answers the newsletter prompt
// with a bare array, which parseAiJson happily accepts and
// validateNewsletterAiStories then rejects as "not a stories list". Both local
// servers can constrain decoding to a schema, so the envelope is sent as a
// schema instead of resting on the prompt's example alone.
//
// Only the strict-mode keyword subset is used (type, properties, required,
// additionalProperties, items): LM Studio rejects an unsupported keyword
// outright, so length and range limits stay in the validators, which still
// reject anything thin, off-range, or carrying a URL.
export type AiJsonSchema = {
  name: string;
  schema: Record<string, unknown>;
};

const TEXT = { type: "string" } as const;
const SCORE = { type: "number" } as const;
const TEXT_LIST = { type: "array", items: TEXT } as const;

function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    // Strict mode requires every property listed as required.
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function listSchema(name: string, key: string, properties: Record<string, unknown>): AiJsonSchema {
  return { name, schema: objectSchema({ [key]: { type: "array", items: objectSchema(properties) } }) };
}

export const INDUSTRY_SELECTION_SCHEMA = listSchema("industry_selections", "selections", {
  id: TEXT,
  score: SCORE,
  reason: TEXT,
});

export const MENTION_CURATION_SCHEMA = listSchema("mention_curations", "mentions", {
  id: TEXT,
  summary: TEXT,
  score: SCORE,
  reason: TEXT,
});

// `sponsored` stays an unconstrained boolean. validateNewsletterAiStories drops
// every story whose sponsored flag is not exactly false, so pinning the schema
// to false would relabel advertising as news instead of filtering it out.
export const NEWSLETTER_STORY_SCHEMA = listSchema("newsletter_stories", "stories", {
  title: TEXT,
  summary: TEXT,
  linkIds: TEXT_LIST,
  score: SCORE,
  reason: TEXT,
  sponsored: { type: "boolean" },
});

export const NEWSLETTER_GROUP_SCHEMA = listSchema("newsletter_groups", "groups", {
  ids: TEXT_LIST,
  title: TEXT,
  summary: TEXT,
  score: SCORE,
  reason: TEXT,
});

export const NEWSLETTER_PRIORITY_SCHEMA = listSchema("newsletter_priorities", "priorities", {
  id: TEXT,
  score: SCORE,
  reason: TEXT,
});
