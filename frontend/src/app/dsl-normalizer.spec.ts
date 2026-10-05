import { diagnoseJson, extractJson, normalizeDsl } from './dsl-normalizer';

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
    expect(r.warnings).toContainEqual({ code: 'invalid_media_removed', n: 1 });
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
    expect(r.warnings).toContainEqual({ code: 'unknown_type_replaced', n: 1, from: 'matching', to: 'multiple_choice' });
  });

  it('drops questions without a title and warns', () => {
    const raw = JSON.stringify({ title: 'T', pages: [{ title: 'P', questions: [{ type: 'text', title: '  ' }, { type: 'text', title: 'ok' }] }] });
    const r = ok(raw);
    expect(r.form.pages[0].questions).toHaveLength(1);
    expect(r.warnings).toContainEqual({ code: 'empty_questions_removed', n: 1 });
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

function q(extra: Record<string, unknown>, top: Record<string, unknown> = {}) {
  return JSON.stringify({ title: 'T', ...top, pages: [{ title: 'P', questions: [{ type: 'text', title: 'Q', ...extra }] }] });
}

describe('normalizeDsl precise warnings', () => {
  it('names the unknown keys at form, page and question level', () => {
    const raw = JSON.stringify({
      title: 'T',
      zeta: 1,
      pages: [{ title: 'P', foo: 1, questions: [{ type: 'text', title: 'A' }, { type: 'text', title: 'B', hint: 'x', explanation: 'y' }] }],
    });
    const w = ok(raw).warnings;
    expect(w).toContainEqual({ code: 'unknown_keys_removed', scope: 'form', keys: ['zeta'] });
    expect(w).toContainEqual({ code: 'unknown_keys_removed', scope: 'page', n: 1, keys: ['foo'] });
    expect(w).toContainEqual({ code: 'unknown_keys_removed', scope: 'question', n: 2, keys: ['hint', 'explanation'] });
  });

  it('does not report ids, aliases or known keys as unknown', () => {
    const r = ok(q({ id: 'x', question: 'Alt', imageHint: 'h' }, { id: 'f' }));
    expect(r.warnings.filter((w) => w.code === 'unknown_keys_removed')).toEqual([]);
  });

  it('reports unknown metadata keys on the question', () => {
    const w = ok(q({ metadata: { topic: 't', zzz: 1 } })).warnings;
    expect(w).toContainEqual({ code: 'unknown_keys_removed', scope: 'question', n: 1, keys: ['zzz'] });
  });

  it('maps key aliases when the canonical key is missing', () => {
    const raw = JSON.stringify({
      title: 'T',
      pages: [{ title: 'P', questions: [{ type: 'multiple_choice', question: 'Cap?', choices: ['Roma', 'Parigi'], answer: 'Roma', points: 3 }] }],
    });
    const qn = ok(raw).form.pages[0].questions[0];
    expect(qn).toMatchObject({ title: 'Cap?', options: ['Roma', 'Parigi'], correctAnswer: 'Roma', score: 3 });
  });

  it('maps type aliases silently', () => {
    const r = ok(q({ type: 'Scelta multipla', options: ['a', 'b'] }));
    expect(r.form.pages[0].questions[0].type).toBe('multiple_choice');
    expect(r.warnings.some((w) => w.code === 'unknown_type_replaced')).toBe(false);
  });

  it('removes options on short_answer/text and says which type', () => {
    const r = ok(q({ type: 'short_answer', options: ['a', 'b'] }));
    expect(r.form.pages[0].questions[0].options).toBeUndefined();
    expect(r.warnings).toContainEqual({ code: 'options_removed', n: 1, from: 'short_answer' });
  });

  it('resolves correctAnswer given as a letter or with different case', () => {
    const letter = ok(q({ type: 'multiple_choice', options: ['Roma', 'Parigi'], correctAnswer: 'B' }));
    expect(letter.form.pages[0].questions[0].correctAnswer).toBe('Parigi');
    expect(letter.warnings).toContainEqual({ code: 'answer_resolved', n: 1, from: 'B', to: 'Parigi' });
    const loose = ok(q({ type: 'multiple_choice', options: ['Roma', 'Parigi'], correctAnswer: ' roma ' }));
    expect(loose.form.pages[0].questions[0].correctAnswer).toBe('Roma');
  });

  it('drops a correctAnswer that matches no option and reports it', () => {
    const r = ok(q({ type: 'multiple_choice', options: ['a', 'b'], correctAnswer: 'zzz' }));
    expect(r.form.pages[0].questions[0].correctAnswer).toBeUndefined();
    expect(r.warnings).toContainEqual({ code: 'answer_not_in_options', n: 1, from: 'zzz' });
  });

  it('forces quiz when mode is "form" but answers exist, and defaults score to 1', () => {
    const r = ok(q({ type: 'multiple_choice', options: ['a', 'b'], correctAnswer: 'a' }, { mode: 'form' }));
    expect(r.form.mode).toBe('quiz');
    expect(r.form.pages[0].questions[0].score).toBe(1);
    expect(r.warnings).toContainEqual({ code: 'mode_set_quiz' });
  });

  it('lists quiz questions that have options but no correct answer', () => {
    const raw = JSON.stringify({
      title: 'T',
      mode: 'quiz',
      pages: [{ title: 'P', questions: [
        { type: 'multiple_choice', title: 'A', options: ['x', 'y'], correctAnswer: 'x' },
        { type: 'multiple_choice', title: 'B', options: ['x', 'y'] },
        { type: 'checkbox', title: 'C', options: ['x', 'y'] },
      ] }],
    });
    expect(ok(raw).warnings).toContainEqual({ code: 'answers_missing', keys: ['2', '3'] });
  });

  it('numbers questions across pages in the order of the pasted JSON', () => {
    const raw = JSON.stringify({
      title: 'T',
      pages: [
        { title: 'A', questions: [{ type: 'text', title: 'one' }] },
        { title: 'B', questions: [{ type: 'text', title: 'two', zzz: 1 }] },
      ],
    });
    expect(ok(raw).warnings).toContainEqual({ code: 'unknown_keys_removed', scope: 'question', n: 2, keys: ['zzz'] });
  });
});

describe('diagnoseJson', () => {
  it('tells apart empty, no object, truncated and syntax errors', () => {
    expect(diagnoseJson('')).toMatch(/empty/i);
    expect(diagnoseJson('ciao')).toMatch(/No JSON object/);
    expect(diagnoseJson('{"a": [1,2')).toMatch(/truncated|not closed/i);
    expect(diagnoseJson('{"a": nope}')).toMatch(/Invalid JSON syntax/);
  });
});
