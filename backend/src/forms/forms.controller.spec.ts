import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { FormsController } from './forms.controller';
import { DslValidatorService } from './dsl-validator.service';
import { GoogleFormsService } from './google-forms.service';
import { StatsService } from '../stats/stats.service';
import type { Form } from './dsl-types';

const stats = { record: jest.fn().mockResolvedValue(undefined) } as unknown as StatsService;

const quizForm: Form = {
  id: 'f1',
  title: 'Quiz',
  description: '',
  mode: 'quiz',
  settings: { collectEmails: false, limitOneResponse: false, shuffleQuestions: false },
  pages: [
    {
      id: 'p1',
      title: 'Page 1',
      questions: [
        { id: 'q1', type: 'multiple_choice', title: 'Q?', required: true, options: ['A', 'B'], correctAnswer: 'A', score: 2 },
      ],
    },
  ],
};

function makeServices(overrides: Partial<GoogleFormsService> = {}) {
  const validator = {
    validateForm: jest.fn().mockReturnValue({ valid: true, errors: [] }),
  } as unknown as DslValidatorService;

  const googleForms = {
    createForm: jest.fn().mockResolvedValue({ formId: 'form-123', formUrl: 'https://example.com' }),
    batchUpdate: jest.fn().mockResolvedValue(undefined),
    patchFormSettings: jest.fn().mockResolvedValue(undefined),
    verifyTokenAudience: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as GoogleFormsService;

  return { validator, googleForms };
}

describe('FormsController.create', () => {
  it('throws UnauthorizedException when Authorization header is missing', async () => {
    const { validator, googleForms } = makeServices();
    const controller = new FormsController(validator, googleForms, stats);
    await expect(controller.create(quizForm, '')).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnprocessableEntityException when DSL validation fails', async () => {
    const { googleForms } = makeServices();
    const validator = {
      validateForm: jest.fn().mockReturnValue({ valid: false, errors: ['bad payload'] }),
    } as unknown as DslValidatorService;
    const controller = new FormsController(validator, googleForms, stats);
    await expect(controller.create({}, 'Bearer tok')).rejects.toThrow(UnprocessableEntityException);
  });

  it('returns formId and formUrl on success', async () => {
    const { validator, googleForms } = makeServices();
    const controller = new FormsController(validator, googleForms, stats);
    const result = await controller.create(quizForm, 'Bearer tok');
    expect(result.formId).toBe('form-123');
    expect(result.formUrl).toBe('https://example.com');
  });

  it('quiz mode: patchFormSettings is called BEFORE batchUpdate', async () => {
    const callOrder: string[] = [];
    const { validator } = makeServices();
    const googleForms = {
      verifyTokenAudience: jest.fn().mockResolvedValue(undefined),
      createForm: jest.fn().mockResolvedValue({ formId: 'form-123', formUrl: 'https://example.com' }),
      patchFormSettings: jest.fn().mockImplementation(async () => { callOrder.push('patchFormSettings'); }),
      batchUpdate: jest.fn().mockImplementation(async () => { callOrder.push('batchUpdate'); }),
    } as unknown as GoogleFormsService;

    const controller = new FormsController(validator, googleForms, stats);
    await controller.create(quizForm, 'Bearer tok');

    expect(callOrder).toEqual(['patchFormSettings', 'batchUpdate']);
  });

  it('quiz mode: patchFormSettings is called with isQuiz=true', async () => {
    const { validator, googleForms } = makeServices();
    const controller = new FormsController(validator, googleForms, stats);
    await controller.create(quizForm, 'Bearer tok');

    expect(googleForms.patchFormSettings).toHaveBeenCalledWith(
      'tok',
      'form-123',
      quizForm.settings,
      true,
    );
  });

  it('regular form: patchFormSettings is called with isQuiz=false', async () => {
    const regularForm: Form = { ...quizForm, mode: 'form' };
    const { validator, googleForms } = makeServices();
    const controller = new FormsController(validator, googleForms, stats);
    await controller.create(regularForm, 'Bearer tok');

    expect(googleForms.patchFormSettings).toHaveBeenCalledWith(
      'tok',
      'form-123',
      regularForm.settings,
      false,
    );
  });

  it('calls verifyTokenAudience before createForm', async () => {
    const callOrder: string[] = [];
    const { validator } = makeServices();
    const googleForms = {
      verifyTokenAudience: jest.fn().mockImplementation(async () => { callOrder.push('verifyTokenAudience'); }),
      createForm: jest.fn().mockImplementation(async () => { callOrder.push('createForm'); return { formId: 'form-123', formUrl: 'https://example.com' }; }),
      patchFormSettings: jest.fn().mockResolvedValue(undefined),
      batchUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as GoogleFormsService;

    const controller = new FormsController(validator, googleForms, stats);
    await controller.create(quizForm, 'Bearer tok');

    expect(callOrder).toEqual(['verifyTokenAudience', 'createForm']);
  });

  it('propagates UnauthorizedException from verifyTokenAudience without calling createForm', async () => {
    const { validator, googleForms } = makeServices({
      verifyTokenAudience: jest.fn().mockRejectedValue(
        new UnauthorizedException('Access token was not issued for this application'),
      ),
    });
    const controller = new FormsController(validator, googleForms, stats);

    await expect(controller.create(quizForm, 'Bearer tok')).rejects.toThrow(UnauthorizedException);
    expect(googleForms.createForm).not.toHaveBeenCalled();
  });
});

// These exercise the real GoogleFormsService.verifyTokenAudience implementation
// (mocking global.fetch, the Google tokeninfo call) rather than a stub, since
// that is where the audience check actually lives.
describe('GoogleFormsService.verifyTokenAudience', () => {
  const requiredEnv = { GOOGLE_CLIENT_ID: 'this-app-client-id' };

  beforeEach(() => {
    Object.assign(process.env, requiredEnv);
  });

  afterEach(() => {
    for (const key of Object.keys(requiredEnv)) {
      delete process.env[key];
    }
    jest.restoreAllMocks();
  });

  it('throws UnauthorizedException when aud does not match GOOGLE_CLIENT_ID', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ aud: 'someone-elses-client-id' }),
    } as Response);

    const service = new GoogleFormsService();
    await expect(service.verifyTokenAudience('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('proceeds (resolves) when aud matches GOOGLE_CLIENT_ID', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ aud: 'this-app-client-id' }),
    } as Response);

    const service = new GoogleFormsService();
    await expect(service.verifyTokenAudience('tok')).resolves.toBeUndefined();
  });

  it('proceeds (fails open) when fetch itself rejects', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    const service = new GoogleFormsService();
    await expect(service.verifyTokenAudience('tok')).resolves.toBeUndefined();
  });
});

describe('FormsController.create stats', () => {
  it('records the creation only after the form was built', async () => {
    const { validator, googleForms } = makeServices();
    const record = jest.fn().mockResolvedValue(undefined);
    const controller = new FormsController(validator, googleForms, { record } as unknown as StatsService);
    await controller.create(quizForm, 'Bearer tok');
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('does not record when creation fails', async () => {
    const { validator } = makeServices();
    const googleForms = makeServices({ batchUpdate: jest.fn().mockRejectedValue(new Error('x')) }).googleForms;
    const record = jest.fn();
    const controller = new FormsController(validator, googleForms, { record } as unknown as StatsService);
    await expect(controller.create(quizForm, 'Bearer tok')).rejects.toThrow('x');
    expect(record).not.toHaveBeenCalled();
  });
});
