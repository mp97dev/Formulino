import { Form, FormMode, Media, Page, Question, QuestionType } from './models/form-dsl';

export type NormalizeWarning =
  | 'invalid_media_removed'
  | 'unknown_type_replaced'
  | 'empty_questions_removed';

export type NormalizeResult =
  | { ok: true; form: Form; warnings: NormalizeWarning[] }
  | { ok: false };

const QUESTION_TYPES: QuestionType[] = [
  'text',
  'multiple_choice',
  'checkbox',
  'dropdown',
  'true_false',
  'short_answer',
];
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const MAX_IMAGE_HINT = 300;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Only used after a plain parse failed, so legitimate curly quotes inside
// string values are never touched on well-formed input.
function repairText(text: string): string {
  return text
    .replace(/[“”„‟]/g, '"')
    .replace(/\\_/g, '_')
    .replace(/,\s*([}\]])/g, '$1');
}

export function extractJson(raw: string): unknown | undefined {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  // Double-encoded: the whole answer is a JSON string that contains the JSON.
  if (text.startsWith('"')) {
    const inner = tryParse(text);
    if (typeof inner === 'string') return extractJson(inner);
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  const candidate = text.slice(start, end + 1);

  const attempts = [candidate, repairText(candidate), repairText(candidate.replace(/\\"/g, '"'))];
  for (const attempt of attempts) {
    const parsed = tryParse(attempt);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function normalizeMedia(raw: unknown, warnings: Set<NormalizeWarning>): Media | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (
    isRecord(raw) &&
    (raw['type'] === 'image' || raw['type'] === 'video') &&
    typeof raw['url'] === 'string' &&
    /^https:\/\//.test(raw['url'])
  ) {
    return { type: raw['type'], url: raw['url'] };
  }
  warnings.add('invalid_media_removed');
  return undefined;
}

function normalizeQuestion(
  raw: unknown,
  id: string,
  warnings: Set<NormalizeWarning>,
): Question | null {
  if (!isRecord(raw)) return null;
  const title = str(raw['title']);
  if (!title) {
    warnings.add('empty_questions_removed');
    return null;
  }

  const options = Array.isArray(raw['options'])
    ? raw['options'].map(str).filter((o): o is string => !!o)
    : [];

  let type = raw['type'] as QuestionType;
  if (!QUESTION_TYPES.includes(type)) {
    type = options.length > 0 ? 'multiple_choice' : 'short_answer';
    warnings.add('unknown_type_replaced');
  }

  const question: Question = { id, type, title, required: bool(raw['required'], false) };
  if (options.length > 0) question.options = options;

  const correctAnswer = str(raw['correctAnswer']);
  if (correctAnswer) question.correctAnswer = correctAnswer;

  const scoreRaw = raw['score'];
  const score =
    typeof scoreRaw === 'string' && scoreRaw.trim() !== '' ? Number(scoreRaw) : scoreRaw;
  if (typeof score === 'number' && Number.isFinite(score) && score >= 0) question.score = score;

  const media = normalizeMedia(raw['media'], warnings);
  if (media) question.media = media;

  const meta = isRecord(raw['metadata']) ? raw['metadata'] : {};
  const metadata: NonNullable<Question['metadata']> = {};
  const topic = str(meta['topic']);
  if (topic) metadata.topic = topic;
  const difficulty = meta['difficulty'];
  if (DIFFICULTIES.some((d) => d === difficulty)) {
    metadata.difficulty = difficulty as (typeof DIFFICULTIES)[number];
  }
  const imageHint = str(raw['imageHint']) ?? str(meta['imageHint']);
  if (imageHint) metadata.imageHint = imageHint.slice(0, MAX_IMAGE_HINT);
  if (Object.keys(metadata).length > 0) question.metadata = metadata;

  return question;
}

export function normalizeDsl(raw: string): NormalizeResult {
  const parsed = extractJson(raw);
  if (!isRecord(parsed)) return { ok: false };

  const warnings = new Set<NormalizeWarning>();
  const title = str(parsed['title']) ?? 'Nuovo form';
  let counter = 0;

  const rawPages: unknown[] = Array.isArray(parsed['pages'])
    ? parsed['pages']
    : Array.isArray(parsed['questions'])
      ? [{ title, questions: parsed['questions'] }]
      : [];

  const pages: Page[] = rawPages.filter(isRecord).map((p, i) => ({
    id: `p${i + 1}`,
    title: str(p['title']) ?? (i === 0 ? title : `Sezione ${i + 1}`),
    questions: (Array.isArray(p['questions']) ? p['questions'] : [])
      .map((q) => normalizeQuestion(q, `q${++counter}`, warnings))
      .filter((q): q is Question => q !== null),
  }));

  const hasAnswerKey = pages.some((p) => p.questions.some((q) => q.correctAnswer));
  const rawMode = parsed['mode'];
  const mode: FormMode =
    rawMode === 'quiz' || rawMode === 'form' ? rawMode : hasAnswerKey ? 'quiz' : 'form';

  const settings = isRecord(parsed['settings']) ? parsed['settings'] : {};

  return {
    ok: true,
    warnings: [...warnings],
    form: {
      id: 'form-1',
      title,
      description: typeof parsed['description'] === 'string' ? parsed['description'].trim() : '',
      mode,
      settings: {
        collectEmails: bool(settings['collectEmails'], false),
        limitOneResponse: bool(settings['limitOneResponse'], false),
        shuffleQuestions: bool(settings['shuffleQuestions'], false),
      },
      pages,
    },
  };
}
