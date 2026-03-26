import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const LEARNING_FILE = path.join(DATA_DIR, "learning-examples.json");

export interface LearningExample {
  id: string;
  subject: string;
  fromDomain: string;
  bodySnippet: string;
  category: string | null;
  suggestedTags: string[];
  isContract: boolean;
  isDemandeInfo: boolean;
  confirmedAt: string;
  confirmedBy: "user" | "auto";
}

const MAX_EXAMPLES = 80;

function readExamples(): LearningExample[] {
  try {
    if (!fs.existsSync(LEARNING_FILE)) return [];
    return JSON.parse(fs.readFileSync(LEARNING_FILE, "utf-8")) as LearningExample[];
  } catch {
    return [];
  }
}

function writeExamples(examples: LearningExample[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LEARNING_FILE, JSON.stringify(examples, null, 2), "utf-8");
}

/** Extract the domain portion from a full "From:" header */
export function extractDomain(from: string): string {
  const match = from.match(/<([^>]+)>/) ?? from.match(/([^\s@]+@[^\s]+)/);
  const email = match?.[1] ?? from;
  return email.split("@")[1]?.replace(/\s.*$/, "").toLowerCase().trim() ?? "";
}

/** Save a confirmed example. Deduplicates by subject+domain within 24h. */
export function saveLearningExample(
  example: Omit<LearningExample, "id" | "confirmedAt">
): void {
  const examples = readExamples();

  const duplicate = examples.some(
    (e) =>
      e.subject === example.subject &&
      e.fromDomain === example.fromDomain &&
      Date.now() - new Date(e.confirmedAt).getTime() < 86_400_000
  );
  if (duplicate) return;

  const newExample: LearningExample = {
    ...example,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    confirmedAt: new Date().toISOString(),
  };

  writeExamples([newExample, ...examples].slice(0, MAX_EXAMPLES));
}

/**
 * Return the most relevant confirmed examples to inject as few-shot context.
 * Scoring: same domain > subject keyword overlap > recency.
 * Ensures diversity across categories so the AI sees different classes.
 */
export function getRelevantExamples(
  subject: string,
  from: string,
  limit = 10
): LearningExample[] {
  const examples = readExamples();
  if (examples.length === 0) return [];

  const domain = extractDomain(from);
  const subjectWordsArr = subject
    .toLowerCase()
    .split(/[\s\-–—:,]+/)
    .filter((w) => w.length > 3);

  const scored = examples.map((ex) => {
    let score = 0;

    // Domain match (highest signal)
    if (domain && ex.fromDomain) {
      if (ex.fromDomain === domain) score += 20;
      else if (ex.fromDomain.endsWith(`.${domain}`) || domain.endsWith(`.${ex.fromDomain}`)) score += 8;
    }

    // Subject keyword overlap
    const exWords = ex.subject.toLowerCase().split(/[\s\-–—:,]+/).filter((w) => w.length > 3);
    for (const w of exWords) {
      if (subjectWordsArr.includes(w)) score += 3;
    }

    // Recency bonus (last 14 days)
    const ageMs = Date.now() - new Date(ex.confirmedAt).getTime();
    if (ageMs < 14 * 86_400_000) score += 3;

    // User-confirmed > auto
    if (ex.confirmedBy === "user") score += 2;

    return { ex, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick diverse set: prioritise one high-score per category, then fill
  const result: LearningExample[] = [];
  const seenCats: string[] = [];

  for (const { ex } of scored) {
    if (result.length >= limit) break;
    const cat = ex.category ?? "__null__";
    if (!seenCats.includes(cat)) {
      result.push(ex);
      seenCats.push(cat);
    }
  }
  for (const { ex } of scored) {
    if (result.length >= limit) break;
    if (!result.includes(ex)) result.push(ex);
  }

  return result.slice(0, limit);
}

export function getAllExamples(): LearningExample[] {
  return readExamples();
}
