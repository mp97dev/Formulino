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
