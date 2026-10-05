# User Feedback Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three issues from the first user test (unclear copy/paste steps, "Crea form" that silently returns from Google login, AI output rejected by Formulino) and add a second prompt that extracts questions from attached files.

**Architecture:** (1) A tolerant, pure-TS normalizer in the frontend turns whatever the AI pasted into a schema-valid `Form` before it reaches the (still strict) backend validator. (2) Two prompts (`generate` / `extract`) plus a "repair" prompt live in one module and share a single, smaller output spec. (3) The OAuth return auto-resumes form creation, and the step-4 button reflects whether a Google token is present. (4) A new optional `metadata.imageHint` carries "a figure goes here" from the AI to the edit step and into the created form's item description (no image upload).

**Tech Stack:** Angular 19 (standalone, jest with `@angular/*` mocked: components are tested by instantiating the class, never TestBed), NestJS, Ajv draft-07 schema, TypeScript.

**Spec:** none written separately. Source of truth is the analysis in the conversation of 2026-10-05; the decisions it fixes are restated in "Global Constraints".

## Global Constraints

- Image **upload is out of scope**. `media.url` stays `https://`-only; `imageHint` is text only.
- The backend schema stays strict (`additionalProperties: false` everywhere). All tolerance lives in the frontend normalizer.
- Every new user-visible string goes in **both** `it` and `en` blocks of `frontend/src/app/services/i18n.service.ts` (Italian is the primary language).
- Prompt text is English (instructions to the AI) and tells the AI to write form content in the source's language, Italian if unsure.
- No base64 or other encoding of the AI's reply. The reply is one fenced ```` ```json ```` block, pretty-printed (not minified).
- Do not store Google tokens anywhere new: `sessionStorage` only, as today.
- Tests: `npm test -w backend`, `npm test -w frontend` must pass after every task; `npm run lint` and `npm run build` must pass at the end.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Work on a new branch off the current HEAD: `git switch -c feat/user-feedback-round-1`.

## Review Focus

1. **Double creation:** returning from Google must create the form exactly once, even if the page is reloaded or creation fails (flags removed before the call). Pinned in Task 3.
2. **Stale token:** a token older than 55 min must show the "connect" state and must NOT trigger auto-resume. Pinned in Task 3.
3. **Hostile shapes:** the normalizer must never throw on `null`, arrays, numbers, nested nulls, or huge strings. Pinned in Task 2.
4. **Answer key absent:** the extract prompt must forbid guessing `correctAnswer`. Pinned in Task 4 (text assertion; real behaviour is checked manually in Task 6).
5. **`imageHint` + `media` both present:** the mapper must not add a hint when a real image exists; very long hints are capped at 300 chars. Pinned in Tasks 1 and 2.

## File Structure

| File | Responsibility |
|---|---|
| `dsl/schema/form.v1.schema.json`, `dsl/form-dsl.ts`, `backend/src/forms/dsl-types.ts`, `frontend/src/app/models/form-dsl.ts` | add optional `metadata.imageHint` |
| `backend/src/forms/mapper.service.ts` | write `imageHint` into the Google item `description` |
| `frontend/src/app/dsl-normalizer.ts` (new) | pure: raw AI text → `Form` + warnings |
| `frontend/src/app/prompts.ts` (new) | `buildPrompt(mode)`, `buildRepairPrompt(problems)` |
| `frontend/src/app/services/google-session.ts` (new) | token store with 55-min TTL |
| `frontend/src/app/callback/callback.component.ts` | use `saveToken` |
| `frontend/src/app/app.component.ts` | wizard UI/logic wiring |
| `frontend/src/app/services/i18n.service.ts` | strings |

---

### Task 1: `imageHint` in schema, types and mapper

**Files:**
- Modify: `dsl/schema/form.v1.schema.json` (metadata properties)
- Modify: `dsl/form-dsl.ts:157-167`, `backend/src/forms/dsl-types.ts:36-40`, `frontend/src/app/models/form-dsl.ts` (`metadata` type)
- Modify: `backend/src/forms/mapper.service.ts` (item type + `mapDslToGoogleRequests`)
- Test: `backend/src/forms/dsl-validator.service.spec.ts`, `backend/src/forms/mapper.service.spec.ts`

**Interfaces:**
- Produces: `Question.metadata.imageHint?: string` (all three type files). Mapper sets `createItem.item.description` on the question item when `imageHint` is present and `media` is absent.

- [ ] **Step 1: Write failing tests**

Append inside the `describe` of `dsl-validator.service.spec.ts`:

```ts
  it('accepts metadata.imageHint on a question', () => {
    const form = {
      ...validForm,
      pages: [
        {
          id: 'p1',
          title: 'P',
          questions: [
            {
              id: 'q1',
              type: 'short_answer',
              title: 'Area?',
              required: false,
              metadata: { imageHint: 'triangolo ABC con lati 3, 4, 5 cm' },
            },
          ],
        },
      ],
    };
    expect(service.validateForm(form).valid).toBe(true);
  });
```

Append inside the `describe` of `mapper.service.spec.ts`:

```ts
  it('writes imageHint into the item description when there is no media', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'P',
          questions: [
            {
              id: 'q1',
              type: 'short_answer',
              title: 'Area?',
              required: false,
              metadata: { imageHint: 'triangolo ABC' },
            },
          ],
        },
      ],
    };
    const [req] = mapDslToGoogleRequests(form);
    expect(req.createItem?.item.description).toBe('[📷 Figura da inserire: triangolo ABC]');
  });

  it('ignores imageHint when the question already has media', () => {
    const form: Form = {
      ...baseForm,
      pages: [
        {
          id: 'p1',
          title: 'P',
          questions: [
            {
              id: 'q1',
              type: 'short_answer',
              title: 'Area?',
              required: false,
              media: { type: 'image', url: 'https://example.com/a.png' },
              metadata: { imageHint: 'triangolo ABC' },
            },
          ],
        },
      ],
    };
    const [req] = mapDslToGoogleRequests(form);
    expect(req.createItem?.item.description).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w backend -- dsl-validator mapper`
Expected: FAIL (validator: `must NOT have additional properties`; mapper: TS/undefined description).

- [ ] **Step 3: Implement**

In `dsl/schema/form.v1.schema.json`, inside `metadata.properties` add after `difficulty`:

```json
                    "imageHint": { "type": "string", "maxLength": 300 }
```
(remember the comma after the `difficulty` entry).

In the three TS type files add to the `metadata` object type: `imageHint?: string;` (in `dsl/form-dsl.ts` with the doc comment `/** Text describing a figure the teacher must add manually */`).

In `mapper.service.ts` add `description?: string;` to the `createItem.item` type (next to `title`), then replace the loop body line `requests.push(mapQuestion(question, itemIndex, isQuizMode));` with:

```ts
      const questionRequest = mapQuestion(question, itemIndex, isQuizMode);
      // The Forms API cannot upload images, so when the source needed a figure
      // we leave a visible marker the teacher can search for and replace.
      if (question.metadata?.imageHint && !question.media && questionRequest.createItem) {
        questionRequest.createItem.item.description = `[📷 Figura da inserire: ${question.metadata.imageHint}]`;
      }
      requests.push(questionRequest);
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w backend`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add dsl backend frontend/src/app/models
git commit -m "feat: add optional metadata.imageHint and map it to the item description" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tolerant DSL normalizer

**Files:**
- Create: `frontend/src/app/dsl-normalizer.ts`
- Test: `frontend/src/app/dsl-normalizer.spec.ts`

**Interfaces:**
- Consumes: types from `./models/form-dsl` (incl. `metadata.imageHint` from Task 1).
- Produces:
  - `type NormalizeWarning = 'invalid_media_removed' | 'unknown_type_replaced' | 'empty_questions_removed'`
  - `type NormalizeResult = { ok: true; form: Form; warnings: NormalizeWarning[] } | { ok: false }`
  - `extractJson(raw: string): unknown | undefined`
  - `normalizeDsl(raw: string): NormalizeResult`
- Behaviour contract: ids are always regenerated (`p1…`, `q1…`); unknown keys dropped; defaults filled (`description:""`, `settings` all false, `required:false`, `mode` inferred = `quiz` if any `correctAnswer` else `form`, form title `"Nuovo form"`, page title = form title for page 1 else `"Sezione N"`); top-level `imageHint` is moved into `metadata.imageHint`, capped at 300 chars; top-level `questions[]` without `pages` becomes one page.

- [ ] **Step 1: Write the failing tests**

```ts
import { extractJson, normalizeDsl } from './dsl-normalizer';

const minimal = {
  title: 'Verifica',
  pages: [{ title: 'P', questions: [{ type: 'short_answer', title: 'Nome?' }] }],
};

function ok(raw: string) {
  const r = normalizeDsl(raw);
  if (!r.ok) throw new Error('expected ok');
  return r;
}

describe('extractJson', () => {
  it('reads a fenced block surrounded by prose', () => {
    const raw = 'Ecco il form:\n```json\n{"a":1}\n```\nFammi sapere!';
    expect(extractJson(raw)).toEqual({ a: 1 });
  });

  it('reads an unterminated fence (truncated chat copy)', () => {
    expect(extractJson('```json\n{"a":1}')).toEqual({ a: 1 });
  });

  it('unwraps a double-encoded JSON string', () => {
    expect(extractJson(JSON.stringify('{"a":1}'))).toEqual({ a: 1 });
  });

  it('un-escapes {\\"a\\":1} pasted without outer quotes', () => {
    expect(extractJson('{\\"a\\":1}')).toEqual({ a: 1 });
  });

  it('repairs smart quotes, escaped underscores and trailing commas', () => {
    expect(extractJson('{“a”: “b\\_c”, “d”: [1,2,],}')).toEqual({ a: 'b_c', d: [1, 2] });
  });

  it('returns undefined for text without JSON', () => {
    expect(extractJson('nessun json qui')).toBeUndefined();
    expect(extractJson('')).toBeUndefined();
  });
});

describe('normalizeDsl', () => {
  it('fails (ok:false) on unreadable input', () => {
    expect(normalizeDsl('boh').ok).toBe(false);
    expect(normalizeDsl('[1,2,3]').ok).toBe(false);
  });

  it('fills defaults and generates ids', () => {
    const { form } = ok(JSON.stringify(minimal));
    expect(form).toEqual({
      id: 'form-1',
      title: 'Verifica',
      description: '',
      mode: 'form',
      settings: { collectEmails: false, limitOneResponse: false, shuffleQuestions: false },
      pages: [
        {
          id: 'p1',
          title: 'P',
          questions: [{ id: 'q1', type: 'short_answer', title: 'Nome?', required: false }],
        },
      ],
    });
  });

  it('drops unknown keys at every level', () => {
    const raw = JSON.stringify({
      ...minimal,
      explanation: 'x',
      pages: [{ title: 'P', foo: 1, questions: [{ type: 'text', title: 'T', bar: 2, metadata: { zzz: 1 } }] }],
    });
    const { form } = ok(raw);
    expect(Object.keys(form)).not.toContain('explanation');
    expect(Object.keys(form.pages[0])).not.toContain('foo');
    expect(Object.keys(form.pages[0].questions[0])).not.toContain('bar');
    expect(form.pages[0].questions[0].metadata).toBeUndefined();
  });

  it('regenerates ids so duplicates cannot occur', () => {
    const raw = JSON.stringify({
      title: 'T',
      pages: [
        { id: 'x', title: 'A', questions: [{ id: 'same', type: 'text', title: '1' }, { id: 'same', type: 'text', title: '2' }] },
      ],
    });
    const ids = ok(raw).form.pages[0].questions.map((q) => q.id);
    expect(ids).toEqual(['q1', 'q2']);
  });

  it('infers quiz mode from correctAnswer and coerces score', () => {
    const raw = JSON.stringify({
      title: 'T',
      pages: [{ title: 'P', questions: [{ type: 'multiple_choice', title: 'Q', options: ['a', 'b'], correctAnswer: 'a', score: '2' }] }],
    });
    const { form } = ok(raw);
    expect(form.mode).toBe('quiz');
    expect(form.pages[0].questions[0].score).toBe(2);
  });

  it('wraps top-level questions into one page', () => {
    const { form } = ok(JSON.stringify({ title: 'T', questions: [{ type: 'text', title: 'Q' }] }));
    expect(form.pages).toHaveLength(1);
    expect(form.pages[0].title).toBe('T');
  });

  it('moves a question-level imageHint into metadata and caps it at 300 chars', () => {
    const raw = JSON.stringify({
      title: 'T',
      pages: [{ title: 'P', questions: [{ type: 'text', title: 'Q', imageHint: 'x'.repeat(500) }] }],
    });
    expect(ok(raw).form.pages[0].questions[0].metadata?.imageHint).toHaveLength(300);
  });

  it('removes invalid media and warns', () => {
    const raw = JSON.stringify({
      title: 'T',
      pages: [{ title: 'P', questions: [{ type: 'text', title: 'Q', media: { type: 'image', url: 'http://x/a.png' } }] }],
    });
    const r = ok(raw);
    expect(r.form.pages[0].questions[0].media).toBeUndefined();
    expect(r.warnings).toContain('invalid_media_removed');
  });

  it('keeps valid https media', () => {
    const raw = JSON.stringify({
      title: 'T',
      pages: [{ title: 'P', questions: [{ type: 'text', title: 'Q', media: { type: 'image', url: 'https://x/a.png' } }] }],
    });
    expect(ok(raw).form.pages[0].questions[0].media).toEqual({ type: 'image', url: 'https://x/a.png' });
  });

  it('replaces unknown types and warns', () => {
    const raw = JSON.stringify({
      title: 'T',
      pages: [{ title: 'P', questions: [{ type: 'matching', title: 'Q', options: ['a'] }, { type: 'weird', title: 'R' }] }],
    });
    const r = ok(raw);
    expect(r.form.pages[0].questions.map((q) => q.type)).toEqual(['multiple_choice', 'short_answer']);
    expect(r.warnings).toContain('unknown_type_replaced');
  });

  it('drops questions without a title and warns', () => {
    const raw = JSON.stringify({ title: 'T', pages: [{ title: 'P', questions: [{ type: 'text', title: '  ' }, { type: 'text', title: 'ok' }] }] });
    const r = ok(raw);
    expect(r.form.pages[0].questions).toHaveLength(1);
    expect(r.warnings).toContain('empty_questions_removed');
  });

  it('never throws on hostile shapes', () => {
    const shapes = [
      '{"title":null,"pages":null}',
      '{"pages":[null,1,"x",[],{"questions":null}]}',
      '{"pages":[{"questions":[null,5,{"title":{"a":1},"options":"no"}]}]}',
      '{"settings":"x","mode":5}',
    ];
    for (const s of shapes) {
      expect(() => normalizeDsl(s)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w frontend -- dsl-normalizer`
Expected: FAIL (`Cannot find module './dsl-normalizer'`).

- [ ] **Step 3: Implement `frontend/src/app/dsl-normalizer.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w frontend -- dsl-normalizer`
Expected: PASS. If the "smart quotes" case fails because `“b\_c”` loses the backslash differently, fix `repairText`, not the test.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dsl-normalizer.ts frontend/src/app/dsl-normalizer.spec.ts
git commit -m "feat(frontend): tolerant DSL normalizer for AI output" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Google session helper, auto-resume and stateful button

**Files:**
- Create: `frontend/src/app/services/google-session.ts`, `frontend/src/app/services/google-session.spec.ts`
- Modify: `frontend/src/app/callback/callback.component.ts`
- Modify: `frontend/src/app/app.component.ts` (`ngOnInit`, `create`, step-4 template, styles)
- Modify: `frontend/src/app/services/i18n.service.ts`
- Test: `frontend/src/app/app.component.spec.ts`, `frontend/src/app/callback/callback.component.spec.ts` (existing must keep passing)

**Interfaces:**
- Produces: `saveToken(token: string, now?: number): void`, `getToken(now?: number): string | null` (null and cleared when older than 55 min; legacy tokens without timestamp count as valid), `clearToken(): void`. `AppComponent.googleConnected: boolean` (getter), `AppComponent.formId: string`.
- i18n keys (replace `wizardStep4Cta`): `wizardStep4CtaCreate`, `wizardStep4CtaConnect`, `wizardStep4Connected`, `wizardStep4WillRedirect`; update `wizardStep4Desc`.

- [ ] **Step 1: Write failing tests**

`google-session.spec.ts`:

```ts
import { clearToken, getToken, saveToken } from './google-session';

const store: Record<string, string> = {};
beforeAll(() => {
  Object.defineProperty(global, 'sessionStorage', {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
    configurable: true,
  });
});
beforeEach(() => Object.keys(store).forEach((k) => delete store[k]));

describe('google-session', () => {
  it('returns a fresh token', () => {
    saveToken('tok', 1_000);
    expect(getToken(1_000 + 60_000)).toBe('tok');
  });

  it('expires and clears a token older than 55 minutes', () => {
    saveToken('tok', 1_000);
    expect(getToken(1_000 + 56 * 60_000)).toBeNull();
    expect(store['access_token']).toBeUndefined();
  });

  it('treats a legacy token without timestamp as valid', () => {
    store['access_token'] = 'old';
    expect(getToken()).toBe('old');
  });

  it('clearToken removes both keys', () => {
    saveToken('tok');
    clearToken();
    expect(getToken()).toBeNull();
  });
});
```

Append to `app.component.spec.ts` (inside the `describe`):

```ts
  describe('auto-resume after Google login', () => {
    const form = {
      id: 'form-1', title: 'T', description: '', mode: 'form',
      settings: { collectEmails: false, limitOneResponse: false, shuffleQuestions: false },
      pages: [{ id: 'p1', title: 'P', questions: [{ id: 'q1', type: 'text', title: 'Q', required: false }] }],
    };

    beforeEach(() => {
      mockSessionStorage.setItem('pending_dsl', JSON.stringify(form));
      mockSessionStorage.setItem('pending_step', 'step4');
      svc.createForm.mockReturnValue(of({ formId: 'id1', formUrl: 'https://forms.google.com/x' }));
    });

    it('creates the form once when a fresh token is present', () => {
      mockSessionStorage.setItem('access_token', 'tok');
      comp.ngOnInit();
      expect(svc.createForm).toHaveBeenCalledTimes(1);
      expect(svc.createForm).toHaveBeenCalledWith(form, 'tok');
      expect(comp.currentStep).toBe('done');
      // a reload must not create a second form
      expect(mockSessionStorage.getItem('pending_dsl')).toBeNull();
      comp.ngOnInit();
      expect(svc.createForm).toHaveBeenCalledTimes(1);
    });

    it('does not create when the token is older than 55 minutes', () => {
      mockSessionStorage.setItem('access_token', 'tok');
      mockSessionStorage.setItem('access_token_at', String(Date.now() - 56 * 60_000));
      svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
      comp.ngOnInit();
      expect(svc.createForm).not.toHaveBeenCalled();
      expect(comp.currentStep).toBe('step4');
      expect(comp.googleConnected).toBe(false);
    });

    it('does not create when resuming from an earlier step', () => {
      mockSessionStorage.setItem('access_token', 'tok');
      mockSessionStorage.setItem('pending_step', 'step3');
      svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
      comp.ngOnInit();
      expect(svc.createForm).not.toHaveBeenCalled();
    });

    it('keeps the session cleared after a 401 so the button reverts to "connect"', () => {
      mockSessionStorage.setItem('access_token', 'tok');
      svc.createForm.mockReturnValue(throwError(() => ({ status: 401 })));
      comp.ngOnInit();
      expect(comp.googleConnected).toBe(false);
      expect(comp.serverError).toBe('sessionExpired');
    });
  });

  it('create: stores formId on success', () => {
    comp.dslJson = '{"title":"T"}';
    mockSessionStorage.setItem('access_token', 'tok');
    svc.createForm.mockReturnValue(of({ formId: 'id1', formUrl: 'u' }));
    comp.create();
    expect(comp.formId).toBe('id1');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w frontend`
Expected: FAIL (module not found, `ngOnInit` does not create, `googleConnected`/`formId` undefined).

- [ ] **Step 3: Implement**

`google-session.ts`:

```ts
const TOKEN_KEY = 'access_token';
const TOKEN_AT_KEY = 'access_token_at';
// Google access tokens live ~1h. Treat them as expired a little earlier so the
// UI never offers a token that dies in the middle of a request.
const TOKEN_TTL_MS = 55 * 60 * 1000;

export function saveToken(token: string, now: number = Date.now()): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_AT_KEY, String(now));
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_AT_KEY);
}

export function getToken(now: number = Date.now()): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const savedAt = Number(sessionStorage.getItem(TOKEN_AT_KEY));
  // No timestamp (token stored by an older build) → keep it; a 401 will clear it.
  if (savedAt > 0 && now - savedAt > TOKEN_TTL_MS) {
    clearToken();
    return null;
  }
  return token;
}
```

`callback.component.ts`: import `saveToken` from `../services/google-session` and replace `sessionStorage.setItem('access_token', token);` with `saveToken(token);`.

`app.component.ts`:
1. Import `{ clearToken, getToken } from './services/google-session'`.
2. Add fields `formId = '';` and getter `get googleConnected(): boolean { return getToken() !== null; }`.
3. In `create()`: replace `const token = sessionStorage.getItem('access_token');` with `const token = getToken();`; in `next:` add `this.formId = res.formId;`; in the 401 branch replace `sessionStorage.removeItem('access_token');` with `clearToken();`.
4. In `ngOnInit`, replace the `this.validate();` at the end of the `if (pending)` block with:

```ts
      const resumed = this.parseStoredForm(pending);
      if (resumed && this.currentStep === 'step4' && getToken() !== null) {
        // The user already clicked "create" before being sent to Google:
        // finish the job instead of asking them to click again. The pending_*
        // flags were removed above, so a reload cannot create a second form.
        this.editableForm = resumed;
        this.create();
        return;
      }
      this.validate();
```

and add the private helper:

```ts
  private parseStoredForm(text: string): Form | null {
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Form)
        : null;
    } catch {
      return null;
    }
  }
```
5. Step-4 template: before the `result-error` div add

```html
      <p class="google-status" [class.connected]="googleConnected">
        {{ googleConnected ? '✓ ' + i18n.t('wizardStep4Connected') : i18n.t('wizardStep4WillRedirect') }}
      </p>
```
and replace the create button with

```html
        <button type="button" class="btn-primary step-cta-inline" [class.btn-connect]="!googleConnected" (click)="create()" [disabled]="isWorking">
          {{ state === 'creating' ? i18n.t('creating') : googleConnected ? i18n.t('wizardStep4CtaCreate') : i18n.t('wizardStep4CtaConnect') }}
        </button>
```
Styles (append to the styles array string): `.google-status{font-size:.9rem;color:var(--text-muted,#666);margin:0 0 .75rem}.google-status.connected{color:#1a7f37;font-weight:600}.btn-connect{background:#fff;color:#1a73e8;border:2px solid #1a73e8}` (check the file's existing CSS variable names and dark-mode rules and match them).

`i18n.service.ts` — remove `wizardStep4Cta` and set, in `it`:
- `wizardStep4Desc: 'Ultimo passo: Formulino crea il form nel tuo Google Drive.'`
- `wizardStep4Connected: 'Account Google collegato'`
- `wizardStep4WillRedirect: 'Si aprirà Google per autorizzare l\'accesso. Appena torni, il form viene creato automaticamente.'`
- `wizardStep4CtaCreate: 'Crea il mio Google Form →'`
- `wizardStep4CtaConnect: 'Collega Google e crea il form →'`

in `en`: `'Last step: Formulino creates the form in your Google Drive.'`, `'Google account connected'`, `'Google will open to authorize access. When you come back, the form is created automatically.'`, `'Create my Google Form →'`, `'Connect Google and create the form →'`.

Also update the existing test `create: saves pending_dsl and redirects when not authenticated`: `dslJson='{"title":"T"}'` is now normalized, so assert `JSON.parse(mockSessionStorage.getItem('pending_dsl')!).title` equals `'T'` instead of the raw string — **do this in Task 5 when `parseDsl` switches to the normalizer**, not here.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w frontend && npm run lint -w frontend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): auto-resume form creation after Google login, stateful create button" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Prompts module

**Files:**
- Create: `frontend/src/app/prompts.ts`
- Test: `frontend/src/app/prompts.spec.ts`

**Interfaces:**
- Produces: `type PromptMode = 'generate' | 'extract'`, `buildPrompt(mode: PromptMode): string`, `buildRepairPrompt(problems: string[]): string` (uses at most the first 10 problems).
- The output spec asks only for keys the normalizer keeps: `title, description?, mode, pages[{title, questions[{type,title,required,options?,correctAnswer?,score?,imageHint?}]}]`. No ids, no `settings`.

- [ ] **Step 1: Write the failing tests**

```ts
import { buildPrompt, buildRepairPrompt } from './prompts';

describe('buildPrompt', () => {
  it.each(['generate', 'extract'] as const)('%s: asks for ONE pretty-printed json block, never minified', (mode) => {
    const p = buildPrompt(mode);
    expect(p).toContain('exactly ONE fenced code block');
    expect(p).not.toMatch(/minif/i);
    expect(p).not.toMatch(/base64/i);
  });

  it.each(['generate', 'extract'] as const)('%s: does not ask for ids or settings', (mode) => {
    const p = buildPrompt(mode);
    expect(p).not.toContain('"id"');
    expect(p).not.toContain('"settings"');
  });

  it('extract: forbids inventing answers and mentions figures and illegible text', () => {
    const p = buildPrompt('extract');
    expect(p).toContain('NEVER guess');
    expect(p).toContain('imageHint');
    expect(p).toContain('[ILLEGGIBILE]');
    expect(p).toContain('attached');
  });

  it('generate: tells the AI the teacher request follows', () => {
    expect(buildPrompt('generate')).toContain("teacher's request follows");
  });

  it('generate does not contain the extraction rules', () => {
    expect(buildPrompt('generate')).not.toContain('[ILLEGGIBILE]');
  });
});

describe('buildRepairPrompt', () => {
  it('lists the problems and asks again for one json block', () => {
    const p = buildRepairPrompt(['/pages/0: must have required property title']);
    expect(p).toContain('/pages/0: must have required property title');
    expect(p).toContain('exactly ONE fenced code block');
  });

  it('caps the list at 10 problems', () => {
    const many = Array.from({ length: 25 }, (_, i) => `problem ${i}`);
    const p = buildRepairPrompt(many);
    expect(p).toContain('problem 9');
    expect(p).not.toContain('problem 10');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w frontend -- prompts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `frontend/src/app/prompts.ts`**

```ts
export type PromptMode = 'generate' | 'extract';

const OUTPUT_SPEC = `OUTPUT FORMAT
Reply with exactly ONE fenced code block tagged json and nothing outside it: no greeting, no explanation.
Inside the block put valid, pretty-printed JSON (double quotes, no comments, no trailing commas). Do not wrap the JSON in a string and do not escape its quotes.
Use ONLY these keys, any other key is rejected:
{
  "title": "string",
  "description": "string (optional)",
  "mode": "form" | "quiz",
  "pages": [
    {
      "title": "string",
      "questions": [
        {
          "type": "multiple_choice" | "checkbox" | "dropdown" | "true_false" | "short_answer" | "text",
          "title": "string",
          "required": true | false,
          "options": ["string"],
          "correctAnswer": "string",
          "score": 1,
          "imageHint": "string"
        }
      ]
    }
  ]
}
RULES
- "mode" is "quiz" only when answers must be graded, otherwise "form".
- "options" is required for multiple_choice, checkbox, dropdown and true_false (for true_false write them in the form's language, e.g. ["Vero","Falso"]); omit it for the other types.
- "correctAnswer" and "score" only in quiz mode; "correctAnswer" must be exactly equal to one of the "options".
- "short_answer" is a one-line answer, "text" is a long paragraph.
- Use a single page unless the content has clearly separate sections.
- Write all texts in the language of the content (Italian if unsure). Plain text only: no Markdown, no LaTeX (write x², √, ½ with Unicode characters).`;

const GENERATE_HEAD = `You are helping a teacher build a Google Form. Create the form the teacher describes.
If essential information is missing (topic or number of questions) ask ONE short question first; otherwise reply directly in the format below.`;

const EXTRACT_HEAD = `You are helping a teacher turn an existing test, exam or worksheet into a Google Form.
The source is attached to this message (one or more PDF, Word or image files) or pasted at the end of it.
Extract the questions faithfully:
- Copy question texts and answer options exactly as written, in the original order, across all attached files. Do not invent, rephrase, solve or improve anything.
- If the source contains the correct answers (answer key, marked options) use mode "quiz" with "correctAnswer" and "score" (the points printed in the source, otherwise 1). If it does not, use mode "form" and NEVER guess answers.
- Map exercises to types: single choice -> multiple_choice; several correct options -> checkbox; true/false -> true_false; fill-in-the-blank or one-word answer -> short_answer; open question -> text; matching -> one dropdown question per item, with the elements to match as options.
- If a question depends on a picture, figure, table, graph or drawing, still include the question and describe what the picture shows in "imageHint" (for example "triangolo ABC con lati 3, 4, 5 cm"). Never invent an image URL.
- If a word or number is illegible, write [ILLEGGIBILE] in its place.`;

export function buildPrompt(mode: PromptMode): string {
  const head = mode === 'extract' ? EXTRACT_HEAD : GENERATE_HEAD;
  const tail =
    mode === 'extract'
      ? ''
      : "\n\nThe teacher's request follows below this line.\n";
  return `${head}\n\n${OUTPUT_SPEC}${tail}`;
}

export function buildRepairPrompt(problems: string[]): string {
  const list = problems
    .slice(0, 10)
    .map((p) => `- ${p}`)
    .join('\n');
  return `The JSON you produced was rejected by the importer. Problems found:\n${list}\n\nFix them, keep the same questions, and reply again with exactly ONE fenced code block tagged json and nothing else.`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -w frontend -- prompts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/prompts.ts frontend/src/app/prompts.spec.ts
git commit -m "feat(frontend): generate/extract/repair prompts with a smaller output spec" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wizard UX wiring (steps 1–3b, done page)

**Files:**
- Modify: `frontend/src/app/app.component.ts` (template steps 1, 2, 3, 3b, done; class logic; styles)
- Modify: `frontend/src/app/services/i18n.service.ts`
- Test: `frontend/src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: `buildPrompt`, `buildRepairPrompt`, `PromptMode` (Task 4); `normalizeDsl`, `NormalizeWarning` (Task 2); `formId` (Task 3).
- Produces (component): `promptMode: PromptMode | null`, `chooseMode(mode: PromptMode): void` (sets mode, calls `goNext()`), `warnings: NormalizeWarning[]`, `repairProblems: string[]`, `copyRepairPrompt(): void`, `imageHintQuestions(): { n: number; title: string; hint: string }[]`, `get editUrl(): string`, `warningKey(w: NormalizeWarning): StringKey`.

- [ ] **Step 1: Write failing tests** (append inside the `describe`; also fix the two existing tests noted below)

```ts
  describe('step 1 mode choice', () => {
    it('chooseMode stores the mode and moves to step 2', () => {
      comp.chooseMode('extract');
      expect(comp.promptMode).toBe('extract');
      expect(comp.currentStep).toBe('step2');
    });

    it('copyPrompt copies the prompt of the chosen mode', async () => {
      mockClipboard.writeText.mockClear();
      comp.chooseMode('extract');
      await comp.copyPrompt();
      expect(mockClipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('attached'));
    });

    it('resetWizard clears the chosen mode', () => {
      comp.chooseMode('generate');
      comp.resetWizard();
      expect(comp.promptMode).toBeNull();
    });
  });

  describe('tolerant parsing in step 3', () => {
    it('accepts a fenced reply with missing ids/settings and sends a valid form to the backend', () => {
      comp.dslJson = 'Ecco:\n```json\n{"title":"T","pages":[{"title":"P","questions":[{"type":"text","title":"Q","extra":1}]}]}\n```';
      svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
      comp.validate();
      const sent = svc.validate.mock.calls[0][0];
      expect(sent.settings).toEqual({ collectEmails: false, limitOneResponse: false, shuffleQuestions: false });
      expect(sent.pages[0].questions[0]).not.toHaveProperty('extra');
      expect(comp.validationOk).toBe(true);
    });

    it('exposes warnings from the normalizer', () => {
      comp.dslJson = '{"title":"T","pages":[{"title":"P","questions":[{"type":"text","title":"Q","media":{"type":"image","url":"http://x"}}]}]}';
      svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
      comp.validate();
      expect(comp.warnings).toContain('invalid_media_removed');
    });

    it('unreadable input sets invalidJson and a generic repair problem', () => {
      comp.dslJson = 'boh';
      comp.validate();
      expect(comp.errors).toEqual(['invalidJson']);
      expect(comp.repairProblems).toEqual(['The reply could not be read as JSON.']);
    });

    it('validation errors become repair problems and the repair prompt lists them', async () => {
      comp.dslJson = '{"title":"T"}';
      svc.validate.mockReturnValue(of({ valid: false, errors: ['/pages: must NOT have fewer than 1 items'] }));
      comp.validate();
      mockClipboard.writeText.mockClear();
      await comp.copyRepairPrompt();
      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/pages: must NOT have fewer than 1 items'),
      );
    });
  });

  describe('image hints', () => {
    it('lists questions with an imageHint, numbered across pages', () => {
      comp.editableForm = {
        id: 'f', title: 'T', description: '', mode: 'form',
        settings: { collectEmails: false, limitOneResponse: false, shuffleQuestions: false },
        pages: [
          { id: 'p1', title: 'A', questions: [{ id: 'q1', type: 'text', title: 'Uno', required: false }] },
          { id: 'p2', title: 'B', questions: [{ id: 'q2', type: 'text', title: 'Due', required: false, metadata: { imageHint: 'triangolo' } }] },
        ],
      };
      expect(comp.imageHintQuestions()).toEqual([{ n: 2, title: 'Due', hint: 'triangolo' }]);
    });

    it('does not list a question that already has media', () => {
      comp.editableForm = {
        id: 'f', title: 'T', description: '', mode: 'form',
        settings: { collectEmails: false, limitOneResponse: false, shuffleQuestions: false },
        pages: [{ id: 'p1', title: 'A', questions: [{ id: 'q1', type: 'text', title: 'Uno', required: false, media: { type: 'image', url: 'https://x/a.png' }, metadata: { imageHint: 'x' } }] }],
      };
      expect(comp.imageHintQuestions()).toEqual([]);
    });

    it('editUrl is built from formId', () => {
      comp.formId = 'abc';
      expect(comp.editUrl).toBe('https://docs.google.com/forms/d/abc/edit');
    });
  });
```

Existing tests to adjust in the same file:
- `copyPrompt: calls clipboard.writeText with the schema prompt` → expect `stringContaining('exactly ONE fenced code block')` (default mode `generate` when `promptMode` is null).
- `create: saves pending_dsl and redirects when not authenticated` → replace the `toBe('{"title":"T"}')` assertion with `expect(JSON.parse(mockSessionStorage.getItem('pending_dsl') as string).title).toBe('T')`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -w frontend -- app.component`
Expected: FAIL (new members missing).

- [ ] **Step 3: Implement logic in `app.component.ts`**

Imports: `buildPrompt, buildRepairPrompt, PromptMode` from `./prompts`; `normalizeDsl, NormalizeWarning` from `./dsl-normalizer`. Delete the `LLM_PROMPT` field. New/changed members:

```ts
  promptMode: PromptMode | null = null;
  warnings: NormalizeWarning[] = [];
  repairProblems: string[] = [];

  private readonly WARNING_KEYS: Record<NormalizeWarning, StringKey> = {
    invalid_media_removed: 'normWarnInvalidMedia',
    unknown_type_replaced: 'normWarnUnknownType',
    empty_questions_removed: 'normWarnEmptyQuestions',
  };

  warningKey(w: NormalizeWarning): StringKey {
    return this.WARNING_KEYS[w];
  }

  chooseMode(mode: PromptMode): void {
    this.promptMode = mode;
    this.goNext();
  }

  private parseDsl(): Form | null {
    const result = normalizeDsl(this.dslJson);
    if (!result.ok) {
      this.errors = [this.i18n.t('invalidJson')];
      this.repairProblems = ['The reply could not be read as JSON.'];
      this.state = 'error';
      return null;
    }
    this.warnings = result.warnings;
    return result.form;
  }

  copyPrompt(): void {
    navigator.clipboard.writeText(buildPrompt(this.promptMode ?? 'generate')).then(() => {
      this.promptCopied = true;
      setTimeout(() => { this.promptCopied = false; }, 2000);
    });
  }

  copyRepairPrompt(): void {
    navigator.clipboard.writeText(buildRepairPrompt(this.repairProblems)).then(() => {
      this.repairCopied = true;
      setTimeout(() => { this.repairCopied = false; }, 2000);
    });
  }

  imageHintQuestions(): { n: number; title: string; hint: string }[] {
    const out: { n: number; title: string; hint: string }[] = [];
    let n = 0;
    for (const page of this.editableForm?.pages ?? []) {
      for (const q of page.questions) {
        n++;
        if (q.metadata?.imageHint && !q.media) {
          out.push({ n, title: q.title, hint: q.metadata.imageHint });
        }
      }
    }
    return out;
  }

  get editUrl(): string {
    return `https://docs.google.com/forms/d/${this.formId}/edit`;
  }
```
Also: add `repairCopied = false;` field; in `validate()` failure branch (`this.errors = res.errors;`) add `this.repairProblems = res.errors;`; in `reset()` add `this.warnings = []; this.repairProblems = [];`; in `resetWizard()` add `this.promptMode = null; this.formId = '';`. `validate()`'s `const payload = this.parseDsl(); if (!payload) return;` is unchanged; `this.editableForm = payload as Form` can drop the cast.

- [ ] **Step 4: Implement template + strings**

Step 1 (`wizardStep1*`): replace the CTA button (`wizardStep1Cta`) with two cards:

```html
      <div class="mode-cards">
        <button type="button" class="mode-card" (click)="chooseMode('extract')">
          <span class="mode-icon" aria-hidden="true">📄</span>
          <strong>{{ i18n.t('wizardStep1OptFile') }}</strong>
          <span>{{ i18n.t('wizardStep1OptFileDesc') }}</span>
        </button>
        <button type="button" class="mode-card" (click)="chooseMode('generate')">
          <span class="mode-icon" aria-hidden="true">✨</span>
          <strong>{{ i18n.t('wizardStep1OptNew') }}</strong>
          <span>{{ i18n.t('wizardStep1OptNewDesc') }}</span>
        </button>
      </div>
```
Keep the chat mockup and the "Non sai da dove cominciare?" help block, but show the help block only when `promptMode !== 'extract'`… (step 1 has no mode yet, so leave it as is). Style `.mode-cards{display:grid;gap:.75rem;margin-top:1rem}` and `.mode-card{display:flex;flex-direction:column;gap:.35rem;text-align:left;padding:1rem;border:2px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff);cursor:pointer}` `.mode-card:hover{border-color:#1a73e8}` (reuse existing CSS variables; check dark mode).

Step 2: replace the four hard-coded `micro-step`s (and remove `aria-hidden="true"`) with a vertical list in which each item has a "where" tag:

```html
      <ol class="micro-steps">
        <li class="micro-step"><span class="where where-here">{{ i18n.t('wizardWhereHere') }}</span>{{ i18n.t('wizardStep2Sub1') }}</li>
        <li class="micro-step"><span class="where where-ai">{{ i18n.t('wizardWhereAi') }}</span>{{ promptMode === 'extract' ? i18n.t('wizardStep2Sub2File') : i18n.t('wizardStep2Sub2New') }}</li>
        <li class="micro-step"><span class="where where-ai">{{ i18n.t('wizardWhereAi') }}</span>{{ i18n.t('wizardStep2Sub3') }}</li>
        <li class="micro-step"><span class="where where-ai">{{ i18n.t('wizardWhereAi') }}</span>{{ i18n.t('wizardStep2Sub4') }}</li>
      </ol>
      <p class="open-ai">{{ i18n.t('wizardOpenAi') }}
        <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer">ChatGPT</a> ·
        <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer">Gemini</a> ·
        <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Claude</a></p>
```
Change `.micro-steps` CSS to `list-style:none;padding:0;display:flex;flex-direction:column;gap:.5rem`, drop the `.micro-arrow` rules, add `.where{display:inline-block;margin-right:.5rem;padding:.1rem .5rem;border-radius:999px;font-size:.75rem;font-weight:600}` `.where-here{background:#e8f0fe;color:#1a56c4}` `.where-ai{background:#fef3e0;color:#9a5b00}` (add dark-mode overrides like the rest of the file). The step-2 description uses `promptMode === 'extract' ? wizardStep2DescFile : wizardStep2DescNew`.

Step 3: under the error block add

```html
      <div class="result result-warn" *ngIf="warnings.length > 0">
        <strong>{{ i18n.t('wizardStep3Fixed') }}</strong>
        <ul><li *ngFor="let w of warnings">{{ i18n.t(warningKey(w)) }}</li></ul>
      </div>
      <div class="repair-box" *ngIf="errors.length > 0">
        <p>{{ i18n.t('wizardStep3RepairHint') }}</p>
        <button type="button" class="copy-prompt-btn" (click)="copyRepairPrompt()">
          {{ repairCopied ? i18n.t('copied') : i18n.t('wizardStep3RepairBtn') }}
        </button>
      </div>
```
(add a `.result-warn` style next to `.result-valid`/`.result-error`, amber).

Step 3b: inside each question card, after the media block, add `<div class="image-hint" *ngIf="q.metadata?.imageHint && !q.media">📷 {{ i18n.t('wizardStep3bImageHint') }}: {{ q.metadata?.imageHint }}</div>`.

Done card: after the open-form button add

```html
      <div class="image-todo" *ngIf="imageHintQuestions().length > 0">
        <h3>{{ i18n.t('doneImagesTitle') }}</h3>
        <p>{{ i18n.t('doneImagesDesc') }}</p>
        <ul><li *ngFor="let h of imageHintQuestions()"><strong>{{ h.n }}.</strong> {{ h.title }} — {{ h.hint }}</li></ul>
        <a [href]="editUrl" target="_blank" rel="noopener noreferrer" class="btn-ghost">{{ i18n.t('doneEditForm') }}</a>
      </div>
```

i18n strings (add to both blocks; remove `wizardStep1Cta`, `wizardStep2Sub*` old values replaced as below; update existing `wizardStep1Title/Desc`, `wizardStep2Desc`, `wizardStep3Desc`, `wizardStep3ErrHint`, `wizardStep2Cta`):

IT:
- `wizardStep1Title: 'Dove sono le domande del tuo form?'`
- `wizardStep1Desc: 'Formulino non legge direttamente i tuoi file: li legge il tuo assistente AI (ChatGPT, Gemini o Claude). Scegli da dove partire.'`
- `wizardStep1OptFile: 'Ho una verifica o un file'`, `wizardStep1OptFileDesc: 'PDF, foto, scansione o documento Word: l\'AI estrae le domande per te.'`
- `wizardStep1OptNew: 'Voglio che l\'AI inventi le domande'`, `wizardStep1OptNewDesc: 'Descrivi argomento, numero di domande e classe: l\'AI le scrive per te.'`
- `wizardStep2DescFile: 'Questo prompt spiega al tuo AI come leggere il tuo file e come formattare la risposta, così Formulino la capisce.'`
- `wizardStep2DescNew: 'Questo prompt spiega al tuo AI come formattare la risposta, così Formulino la capisce.'`
- `wizardWhereHere: 'In Formulino'`, `wizardWhereAi: 'Nel tuo AI'`
- `wizardStep2Sub1: 'Copia il prompt con il pulsante qui sotto'`
- `wizardStep2Sub2File: 'Incolla il prompt e allega il file, nello stesso messaggio'`
- `wizardStep2Sub2New: 'Incolla il prompt e, sotto, scrivi che form vuoi (argomento, numero di domande, classe)'`
- `wizardStep2Sub3: 'Aspetta che l\'AI risponda'`
- `wizardStep2Sub4: 'Clicca "Copia" in alto a destra del riquadro con il codice'`
- `wizardOpenAi: 'Apri il tuo AI:'`
- `wizardStep2Cta: 'Ho copiato il codice →'`
- `wizardStep3Desc: 'Incolla qui sotto il codice che hai copiato dal riquadro dell\'AI. Anche se sembra incomprensibile, è normale!'`
- `wizardStep3ErrHint: 'Qualcosa non va nel codice incollato.'`
- `wizardStep3RepairHint: 'Copia questo messaggio e incollalo nella stessa chat dell\'AI: ti darà il codice corretto.'`, `wizardStep3RepairBtn: 'Copia il messaggio di correzione'`
- `wizardStep3Fixed: 'Abbiamo sistemato automaticamente alcuni punti:'`
- `normWarnInvalidMedia: 'Un link immagine non valido è stato rimosso (deve iniziare con https://).'`, `normWarnUnknownType: 'Un tipo di domanda sconosciuto è stato sostituito con quello più vicino.'`, `normWarnEmptyQuestions: 'Alcune domande senza testo sono state scartate.'`
- `wizardStep3bImageHint: 'Serve una figura'`
- `doneImagesTitle: 'Domande a cui aggiungere una figura'`, `doneImagesDesc: 'Apri il form in modifica e inserisci le immagini nelle domande elencate: il punto è segnato dal testo 📷 nella domanda.'`, `doneEditForm: 'Modifica il form ↗'`

EN:
- `'Where are your form questions?'`, `'Formulino does not read your files directly: your AI assistant (ChatGPT, Gemini or Claude) does. Choose where to start.'`
- `'I have a test or a file'`, `'PDF, photo, scan or Word document: the AI extracts the questions for you.'`
- `'I want the AI to write the questions'`, `'Describe topic, number of questions and class: the AI writes them for you.'`
- `'This prompt tells your AI how to read your file and how to format the answer so Formulino understands it.'`, `'This prompt tells your AI how to format the answer so Formulino understands it.'`
- `'In Formulino'`, `'In your AI'`, `'Copy the prompt with the button below'`, `'Paste the prompt and attach your file, in the same message'`, `'Paste the prompt and, below it, write the form you want (topic, number of questions, class)'`, `'Wait for the AI to answer'`, `'Click "Copy" at the top right of the code box'`, `'Open your AI:'`, `'I copied the code →'`
- `'Paste below the code you copied from the AI\'s code box. It looks cryptic, and that is normal!'`, `'Something is wrong with the pasted code.'`, `'Copy this message and paste it in the same AI chat: it will give you the corrected code.'`, `'Copy the correction message'`, `'We automatically fixed a few things:'`
- `'An invalid image link was removed (it must start with https://).'`, `'An unknown question type was replaced with the closest one.'`, `'Some questions without text were discarded.'`
- `'A figure is needed'`, `'Questions that need a figure'`, `'Open the form in edit mode and add the images to the listed questions: the spot is marked by the 📷 text in the question.'`, `'Edit the form ↗'`

- [ ] **Step 5: Run tests, lint, build**

Run: `npm test -w frontend && npm run lint -w frontend && npm run build -w frontend`
Expected: PASS. Fix any `StringKey` type errors (a key missing from `it` or `en`).

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(frontend): mode choice, explicit copy/paste steps, tolerant parsing, repair prompt, image hints" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification and manual check

**Files:**
- Modify: `docs/status-and-roadmap.md` (add a short "Post-MVP: user feedback round 1" entry)

- [ ] **Step 1: Full automated run**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 2: Manual walkthrough** (use the `run` skill / `npm run dev`, Google OAuth env as in `backend/.env.example`)

1. Step 1 shows two cards; choosing "file" leads to step 2 with the "attach the file" wording and `In Formulino` / `Nel tuo AI` tags; choosing "new" shows the "write the form you want" wording.
2. Paste into step 3 (a) a fenced reply with prose around it, (b) a double-escaped reply, (c) a reply with an extra key and no ids/settings: all validate; extra warnings only for media/type/empty questions.
3. Paste garbage with a missing `pages`: the backend error appears and "Copia il messaggio di correzione" puts the error list on the clipboard.
4. Step 4 logged out: button reads "Collega Google e crea il form" and the hint says Google will open. Click: after Google, the form is created **without a second click** and the done page appears. Reload the done page: no second form is created.
5. A reply with `imageHint` shows 📷 in step 3b and, after creation, the question in Google Forms has the `[📷 Figura da inserire: …]` description; the done page lists it with a working "Modifica il form" link.

- [ ] **Step 3: Real-model smoke test** (cannot be automated; note results in the PR description)

For each of ChatGPT, Gemini, Claude: run the `extract` prompt with (a) a photographed one-page quiz with a figure, (b) a PDF with an answer key, (c) a PDF without one; and the `generate` prompt with "quiz di 5 domande sulle frazioni, classe quinta". Record: validates without the repair step? answer key invented in (c)? `imageHint` present in (a)? If any model fails the formatting more than once in three tries, tune `OUTPUT_SPEC` in `frontend/src/app/prompts.ts` (test in `prompts.spec.ts` must still pass).

- [ ] **Step 4: Update docs and commit**

Add the entry to `docs/status-and-roadmap.md`, then:

```bash
git add docs
git commit -m "docs: record user feedback round 1 changes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
