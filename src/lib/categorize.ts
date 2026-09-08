import { getCategory } from "./categories";
import { merchantKey, redactDescription } from "./redact";
import { PRIORITY, SEED_RULES, type Rule } from "./rules";

export type Suggestion = { categoryId: string; ruleId: string; score: number };

export type CategorizeResult =
  | {
      status: "matched";
      categoryId: string;
      ruleId: string;
      confidence: number;
      /** Category default; a transaction can still override it. */
      oneOff: boolean;
    }
  | {
      status: "needs_review";
      reason: "no_match" | "ambiguous";
      suggestions: Suggestion[];
    };

const CONFIDENCE: Record<number, number> = {
  [PRIORITY.userMerchant]: 1,
  [PRIORITY.userRegex]: 0.95,
  [PRIORITY.seedSpecific]: 0.9,
  [PRIORITY.seed]: 0.85,
  [PRIORITY.seedBroad]: 0.7,
};

const regexCache = new Map<string, RegExp>();

function compile(pattern: string): RegExp | null {
  const cached = regexCache.get(pattern);
  if (cached) return cached;
  try {
    const re = new RegExp(pattern, "i");
    regexCache.set(pattern, re);
    return re;
  } catch {
    // A user-authored pattern that no longer compiles must not take the whole
    // upload down — it just stops matching.
    return null;
  }
}

function matches(rule: Rule, description: string, key: string): boolean {
  if (rule.matchType === "merchant") return Boolean(key) && rule.pattern.toUpperCase() === key;
  const re = compile(rule.pattern);
  return re ? re.test(description) : false;
}

/**
 * Decide a category for one transaction description.
 *
 * Anything that does not match cleanly, or matches two categories equally
 * well, is handed to the review queue rather than guessed at — a wrong
 * category that nobody is asked about is worse than an untagged one.
 */
export function categorize(rawDescription: string, userRules: Rule[] = []): CategorizeResult {
  const description = redactDescription(rawDescription);
  const key = merchantKey(rawDescription);
  const all = [...userRules, ...SEED_RULES];

  const hits = all
    .filter((r) => getCategory(r.categoryId) && matches(r, description, key))
    .sort((a, b) => b.priority - a.priority);

  if (hits.length === 0) return { status: "needs_review", reason: "no_match", suggestions: [] };

  const top = hits[0];
  const topTier = hits.filter((r) => r.priority === top.priority);
  const distinct = new Set(topTier.map((r) => r.categoryId));

  if (distinct.size > 1) {
    return {
      status: "needs_review",
      reason: "ambiguous",
      suggestions: topTier.map((r) => ({
        categoryId: r.categoryId,
        ruleId: r.id,
        score: CONFIDENCE[r.priority] ?? 0.5,
      })),
    };
  }

  return {
    status: "matched",
    categoryId: top.categoryId,
    ruleId: top.id,
    confidence: CONFIDENCE[top.priority] ?? 0.5,
    oneOff: getCategory(top.categoryId)!.oneOff,
  };
}

/** The rule created when a user tags a transaction by hand. */
export function userMerchantRule(description: string, categoryId: string, id: string): Rule {
  return {
    id,
    pattern: merchantKey(description),
    categoryId,
    matchType: "merchant",
    source: "user",
    priority: PRIORITY.userMerchant,
  };
}
