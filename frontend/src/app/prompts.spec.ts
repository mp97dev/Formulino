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
