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
    // they may be named in the "do not add" list, but never defined as fields
    expect(p).not.toContain('"id":');
    expect(p).not.toContain('"settings":');
  });

  it('extract: solves unanswered tests with score 1 and mentions figures and illegible text', () => {
    const p = buildPrompt('extract');
    expect(p).toContain('solve each question yourself');
    expect(p).not.toContain('NEVER guess');
    expect(p).toContain('imageHint');
    expect(p).toContain('[ILLEGGIBILE]');
    expect(p).toContain('attached');
  });

  it.each(['generate', 'extract'] as const)('%s: forbids escapes and extra keys, has example and checklist', (mode) => {
    const p = buildPrompt(mode);
    expect(p).toContain('NOT a string');
    expect(p).toContain('Do NOT add any other key');
    expect(p).toContain('EXAMPLE OF A VALID REPLY');
    expect(p).toContain('CHECK BEFORE REPLYING');
    expect(p).toContain('copied character by character');
    expect(p).toContain('NEVER add "options"');
  });

  it('example is itself valid JSON that follows the rules', () => {
    const m = buildPrompt('generate').match(/```json\n([\s\S]*?)```/);
    expect(m).not.toBeNull();
    const form = JSON.parse(m![1]);
    expect(form.mode).toBe('quiz');
    for (const q of form.pages[0].questions) {
      if (q.options) expect(q.options).toContain(q.correctAnswer);
      expect(q.score).toBeGreaterThan(0);
    }
  });

  it('extract: demands literal transcription and an answer-key search', () => {
    const p = buildPrompt('extract');
    expect(p).toContain('LITERALLY');
    expect(p).toContain('answer key');
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

  it('includes the rejected reply, truncated', () => {
    const p = buildRepairPrompt(['x'], '{"a":1}');
    expect(p).toContain('{"a":1}');
    expect(buildRepairPrompt(['x'], 'y'.repeat(30000))).not.toContain('y'.repeat(20001));
  });

  it('omits the rejected-reply section when none is given', () => {
    expect(buildRepairPrompt(['x'])).not.toContain('rejected:');
  });

  it('caps the list at 10 problems', () => {
    const many = Array.from({ length: 25 }, (_, i) => `problem ${i}`);
    const p = buildRepairPrompt(many);
    expect(p).toContain('problem 9');
    expect(p).not.toContain('problem 10');
  });
});
