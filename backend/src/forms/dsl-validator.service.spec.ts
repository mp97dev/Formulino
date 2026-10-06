import { DslValidatorService } from './dsl-validator.service';

describe('DslValidatorService', () => {
  let service: DslValidatorService;

  beforeEach(() => {
    service = new DslValidatorService();
  });

  const validForm = {
    id: 'form-1',
    title: 'Test',
    description: 'desc',
    mode: 'form',
    settings: { collectEmails: true, limitOneResponse: false, shuffleQuestions: false },
    pages: [
      {
        id: 'p1',
        title: 'Page 1',
        questions: [
          { id: 'q1', type: 'short_answer', title: 'Name?', required: true },
        ],
      },
    ],
  };

  it('accepts a valid form', () => {
    const result = service.validateForm(validForm);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing required top-level fields', () => {
    const result = service.validateForm({ title: 'Only title' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid mode', () => {
    const result = service.validateForm({ ...validForm, mode: 'invalid' });
    expect(result.valid).toBe(false);
  });

  it('rejects multiple_choice question without options', () => {
    const form = {
      ...validForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [{ id: 'q1', type: 'multiple_choice', title: 'Pick one?', required: true }],
        },
      ],
    };
    const result = service.validateForm(form);
    expect(result.valid).toBe(false);
  });

  it('accepts quiz mode with correctAnswer and score', () => {
    const form = {
      ...validForm,
      mode: 'quiz',
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'multiple_choice',
              title: 'Capital of Italy?',
              required: true,
              options: ['Rome', 'Milan'],
              correctAnswer: 'Rome',
              score: 2,
            },
          ],
        },
      ],
    };
    const result = service.validateForm(form);
    expect(result.valid).toBe(true);
  });

  it('rejects empty pages array', () => {
    const result = service.validateForm({ ...validForm, pages: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects media.type audio (not supported by Google Forms)', () => {
    const form = {
      ...validForm,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          questions: [
            {
              id: 'q1',
              type: 'short_answer',
              title: 'Listen?',
              required: false,
              media: { type: 'audio', url: 'https://example.com/audio.mp3' },
            },
          ],
        },
      ],
    };
    const result = service.validateForm(form);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('audio') || e.includes('media'))).toBe(true);
  });

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
});

describe('DslValidatorService fidelity metadata', () => {
  it('accepts metadata.fidelity and rejects unknown values', () => {
    const svc = new DslValidatorService();
    const base = (fidelity: string) => ({
      id: 'f', title: 'T', description: '', mode: 'form',
      settings: { collectEmails: false, limitOneResponse: false, shuffleQuestions: false },
      pages: [{ id: 'p', title: 'P', questions: [{ id: 'q', type: 'text', title: 'Q', required: false, metadata: { fidelity } }] }],
    });
    expect(svc.validateForm(base('interpreted')).valid).toBe(true);
    expect(svc.validateForm(base('bogus')).valid).toBe(false);
  });
});
