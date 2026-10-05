import { Form, FormMode, Media, Page, Question, QuestionType } from './models/form-dsl';

export type WarningCode =
  | 'invalid_media_removed'
  | 'unknown_type_replaced'
  | 'empty_questions_removed'
  | 'unknown_keys_removed'
  | 'options_removed'
  | 'answer_resolved'
  | 'answer_not_in_options'
  | 'mode_set_quiz'
  | 'answers_missing';

export interface NormalizeWarning {
  code: WarningCode;
  /** form-wide, page or question level (for unknown_keys_removed) */
  scope?: 'form' | 'page' | 'question';
  /** 1-based page or question number, as the user sees them in the pasted JSON */
  n?: number;
  /** unknown keys, or question numbers for answers_missing */
  keys?: string[];
  from?: string;
  to?: string;
}

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
const TYPES_WITHOUT_OPTIONS: QuestionType[] = ['text', 'short_answer'];
const TYPES_WITH_OPTIONS: QuestionType[] = ['multiple_choice', 'checkbox', 'dropdown', 'true_false'];
const TYPE_ALIASES: Record<string, QuestionType> = {
  multiple_choice: 'multiple_choice',
  single_choice: 'multiple_choice',
  radio: 'multiple_choice',
  scelta_multipla: 'multiple_choice',
  checkboxes: 'checkbox',
  multi_select: 'checkbox',
  multiple_select: 'checkbox',
  select: 'dropdown',
  boolean: 'true_false',
  true_false: 'true_false',
  vero_falso: 'true_false',
  short: 'short_answer',
  short_text: 'short_answer',
  open: 'text',
  paragraph: 'text',
  long_answer: 'text',
  long_text: 'text',
};
// Alias -> canonical key; only applied when the canonical key is absent.
const KEY_ALIASES: Record<string, string> = {
  question: 'title',
  text: 'title',
  prompt: 'title',
  answer: 'correctAnswer',
  correct_answer: 'correctAnswer',
  correct: 'correctAnswer',
  points: 'score',
  choices: 'options',
};
const FORM_KEYS = ['title', 'description', 'mode', 'pages', 'questions', 'settings', 'id'];
const PAGE_KEYS = ['title', 'questions', 'id'];
const QUESTION_KEYS = [
  'id', 'type', 'title', 'required', 'options', 'correctAnswer', 'score', 'media', 'metadata', 'imageHint',
];
const METADATA_KEYS = ['topic', 'difficulty', 'imageHint'];
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

/** Human-readable reason why a reply could not be read as JSON (for the repair prompt). */
export function diagnoseJson(raw: string): string {
  const text = raw.trim();
  if (!text) return 'The reply is empty.';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1) return 'No JSON object found: the reply must contain a block starting with "{".';
  if (end <= start) return 'The JSON object is not closed: the reply seems truncated (missing "}").';
  try {
    JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return `Invalid JSON syntax: ${e instanceof Error ? e.message : String(e)}`;
  }
  return 'The reply could not be read as JSON.';
}

function reportUnknownKeys(
  raw: Record<string, unknown>,
  known: string[],
  extraAliases: boolean,
  warn: Omit<NormalizeWarning, 'code' | 'keys'>,
  warnings: NormalizeWarning[],
): void {
  const keys = Object.keys(raw).filter(
    (k) => !known.includes(k) && !(extraAliases && k in KEY_ALIASES),
  );
  if (keys.length > 0) warnings.push({ code: 'unknown_keys_removed', ...warn, keys });
}

/** Copies known alias keys (question -> title, ...) when the canonical key is missing. */
function applyAliases(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  for (const [alias, canonical] of Object.entries(KEY_ALIASES)) {
    if (alias in out && !(canonical in out)) out[canonical] = out[alias];
  }
  return out;
}

function resolveAnswer(answer: string, options: string[]): string | undefined {
  if (options.includes(answer)) return answer;
  const clean = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
  const byText = options.find((o) => clean(o) === clean(answer));
  if (byText) return byText;
  const letter = answer.trim().match(/^\(?([A-Za-z])[).:]?$/);
  if (letter) {
    const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
    if (idx < options.length) return options[idx];
  }
  return undefined;
}

function normalizeMedia(raw: unknown, n: number, warnings: NormalizeWarning[]): Media | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (
    isRecord(raw) &&
    (raw['type'] === 'image' || raw['type'] === 'video') &&
    typeof raw['url'] === 'string' &&
    /^https:\/\//.test(raw['url'])
  ) {
    return { type: raw['type'], url: raw['url'] };
  }
  warnings.push({ code: 'invalid_media_removed', n });
  return undefined;
}

function normalizeQuestion(
  rawInput: unknown,
  id: string,
  n: number,
  warnings: NormalizeWarning[],
): Question | null {
  if (!isRecord(rawInput)) return null;
  reportUnknownKeys(rawInput, QUESTION_KEYS, true, { scope: 'question', n }, warnings);
  const raw = applyAliases(rawInput);
  const title = str(raw['title']);
  if (!title) {
    warnings.push({ code: 'empty_questions_removed', n });
    return null;
  }

  const options = Array.isArray(raw['options'])
    ? raw['options'].map(str).filter((o): o is string => !!o)
    : [];

  const rawType = typeof raw['type'] === 'string' ? raw['type'] : '';
  const typeKey = rawType.trim().toLowerCase().replace(/[\s/-]+/g, '_');
  let type: QuestionType;
  if (QUESTION_TYPES.includes(typeKey as QuestionType)) {
    type = typeKey as QuestionType;
  } else if (TYPE_ALIASES[typeKey]) {
    type = TYPE_ALIASES[typeKey];
  } else {
    type = options.length > 0 ? 'multiple_choice' : 'short_answer';
    warnings.push({ code: 'unknown_type_replaced', n, from: rawType || '(missing)', to: type });
  }

  const question: Question = { id, type, title, required: bool(raw['required'], false) };
  if (TYPES_WITH_OPTIONS.includes(type) && options.length > 0) {
    question.options = options;
  } else if (TYPES_WITHOUT_OPTIONS.includes(type) && options.length > 0) {
    warnings.push({ code: 'options_removed', n, from: type });
  }

  const correctAnswer = str(raw['correctAnswer']);
  if (correctAnswer) {
    if (question.options) {
      const resolved = resolveAnswer(correctAnswer, question.options);
      if (resolved) {
        question.correctAnswer = resolved;
        if (resolved !== correctAnswer) {
          warnings.push({ code: 'answer_resolved', n, from: correctAnswer, to: resolved });
        }
      } else {
        warnings.push({ code: 'answer_not_in_options', n, from: correctAnswer });
      }
    } else {
      question.correctAnswer = correctAnswer;
    }
  }

  const scoreRaw = raw['score'];
  const score =
    typeof scoreRaw === 'string' && scoreRaw.trim() !== '' ? Number(scoreRaw) : scoreRaw;
  if (typeof score === 'number' && Number.isFinite(score) && score >= 0) question.score = score;

  const media = normalizeMedia(raw['media'], n, warnings);
  if (media) question.media = media;

  const meta = isRecord(raw['metadata']) ? raw['metadata'] : {};
  reportUnknownKeys(meta, METADATA_KEYS, false, { scope: 'question', n }, warnings);
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

  const warnings: NormalizeWarning[] = [];
  reportUnknownKeys(parsed, FORM_KEYS, false, { scope: 'form' }, warnings);
  const title = str(parsed['title']) ?? 'Nuovo form';
  let counter = 0;

  const rawPages: unknown[] = Array.isArray(parsed['pages'])
    ? parsed['pages']
    : Array.isArray(parsed['questions'])
      ? [{ title, questions: parsed['questions'] }]
      : [];

  const pages: Page[] = rawPages.filter(isRecord).map((p, i) => {
    reportUnknownKeys(p, PAGE_KEYS, false, { scope: 'page', n: i + 1 }, warnings);
    return {
      id: `p${i + 1}`,
      title: str(p['title']) ?? (i === 0 ? title : `Sezione ${i + 1}`),
      questions: (Array.isArray(p['questions']) ? p['questions'] : [])
        .map((q) => {
          counter += 1;
          return normalizeQuestion(q, `q${counter}`, counter, warnings);
        })
        .filter((q): q is Question => q !== null),
    };
  });

  const hasAnswerKey = pages.some((p) => p.questions.some((q) => q.correctAnswer));
  const rawMode = parsed['mode'];
  const mode: FormMode = rawMode === 'quiz' || hasAnswerKey ? 'quiz' : 'form';
  if (rawMode === 'form' && hasAnswerKey) warnings.push({ code: 'mode_set_quiz' });

  if (mode === 'quiz') {
    const missing: string[] = [];
    pages.forEach((p) =>
      p.questions.forEach((q) => {
        if (q.options && !q.correctAnswer) missing.push(q.id.slice(1));
        if (q.correctAnswer && q.score === undefined) q.score = 1;
      }),
    );
    if (missing.length > 0) warnings.push({ code: 'answers_missing', keys: missing });
  }

  const settings = isRecord(parsed['settings']) ? parsed['settings'] : {};

  return {
    ok: true,
    warnings,
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
