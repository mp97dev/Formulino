import { of, throwError } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { FormsService } from './services/forms.service';
import { I18nService } from './services/i18n.service';

const store: Record<string, string> = {};
const mockSessionStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

const mockClipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
const mockTitle = { setTitle: jest.fn() };

beforeAll(() => {
  Object.defineProperty(global, 'sessionStorage', { value: mockSessionStorage, configurable: true });
  Object.defineProperty(global.navigator, 'clipboard', { value: mockClipboard, configurable: true });
  if (typeof (global as unknown as Record<string, unknown>)['window'] === 'undefined') {
    (global as unknown as Record<string, unknown>)['window'] = { location: { href: '' } };
  }
});

function makeService() {
  return { validate: jest.fn(), createForm: jest.fn() };
}

function makeI18n(): Pick<I18nService, 't' | 'lang' | 'toggle'> {
  return { t: (k: string) => k, lang: () => 'it' as const, toggle: jest.fn() };
}

describe('AppComponent', () => {
  let comp: AppComponent;
  let svc: ReturnType<typeof makeService>;

  beforeEach(() => {
    svc = makeService();
    comp = new AppComponent(
      svc as unknown as FormsService,
      makeI18n() as unknown as I18nService,
      mockTitle as unknown as Title,
    );
    mockSessionStorage.clear();
  });

  it('isWorking is false when state is idle', () => {
    expect(comp.isWorking).toBe(false);
  });

  it('isWorking is true while validating', () => {
    comp.dslJson = '{}';
    let seenWorking = false;
    svc.validate.mockImplementation(() => {
      seenWorking = comp.isWorking;
      return of({ valid: true, errors: [] });
    });
    comp.validate();
    expect(seenWorking).toBe(true);
  });

  it('validate: sets errors on invalid JSON', () => {
    comp.dslJson = 'not-json';
    comp.validate();
    expect(comp.errors).toEqual(['invalidJson']);
    expect(comp.state).toBe('error');
  });

  it('validate: sets validationOk on successful validation', () => {
    comp.dslJson = '{"title":"T"}';
    svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
    comp.validate();
    expect(comp.validationOk).toBe(true);
    expect(comp.state).toBe('idle');
  });

  it('validate: sets errors array on validation failure', () => {
    comp.dslJson = '{}';
    svc.validate.mockReturnValue(of({ valid: false, errors: ['missing title'] }));
    comp.validate();
    expect(comp.errors).toEqual(['missing title']);
  });

  it('validate: sets serverError on http failure', () => {
    comp.dslJson = '{"title":"T"}';
    svc.validate.mockReturnValue(throwError(() => ({ message: 'Network error' })));
    comp.validate();
    expect(comp.serverError).toBe('Network error');
    expect(comp.state).toBe('error');
  });

  it('create: saves pending_dsl and redirects when not authenticated', () => {
    comp.dslJson = '{"title":"T"}';
    mockSessionStorage.removeItem('access_token');
    comp.create();
    expect(mockSessionStorage.getItem('pending_dsl')).toBe('{"title":"T"}');
    expect(svc.createForm).not.toHaveBeenCalled();
  });

  it('create: sets formUrl on success', () => {
    comp.dslJson = '{"title":"T"}';
    mockSessionStorage.setItem('access_token', 'tok');
    svc.createForm.mockReturnValue(of({ formId: 'id1', formUrl: 'https://forms.google.com/d/abc/viewform' }));
    comp.create();
    expect(comp.formUrl).toBe('https://forms.google.com/d/abc/viewform');
    expect(comp.state).toBe('success');
  });

  it('create: sets serverError on http failure', () => {
    comp.dslJson = '{"title":"T"}';
    mockSessionStorage.setItem('access_token', 'tok');
    svc.createForm.mockReturnValue(throwError(() => ({ message: 'Server error' })));
    comp.create();
    expect(comp.serverError).toBe('Server error');
    expect(comp.state).toBe('error');
  });

  it('create: uses error.error.message when present', () => {
    comp.dslJson = '{"title":"T"}';
    mockSessionStorage.setItem('access_token', 'tok');
    svc.createForm.mockReturnValue(throwError(() => ({ error: { message: 'Upstream error' } })));
    comp.create();
    expect(comp.serverError).toBe('Upstream error');
  });

  it('copyPrompt: calls clipboard.writeText with the schema prompt', async () => {
    mockClipboard.writeText.mockClear();
    await comp.copyPrompt();
    expect(mockClipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('"mode":"form"|"quiz"'));
    expect(comp.promptCopied).toBe(true);
  });

  it('copyPrompt: resets promptCopied after 2s', async () => {
    jest.useFakeTimers();
    await comp.copyPrompt();
    expect(comp.promptCopied).toBe(true);
    jest.advanceTimersByTime(2001);
    expect(comp.promptCopied).toBe(false);
    jest.useRealTimers();
  });

  it('onPaste: triggers validate after 500ms', () => {
    jest.useFakeTimers();
    comp.dslJson = '{"title":"T"}';
    svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
    comp.onPaste();
    expect(svc.validate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    expect(svc.validate).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('onPaste: debounces rapid calls — validate fires only once', () => {
    jest.useFakeTimers();
    comp.dslJson = '{}';
    svc.validate.mockReturnValue(of({ valid: false, errors: [] }));
    comp.onPaste();
    comp.onPaste();
    comp.onPaste();
    jest.advanceTimersByTime(600);
    expect(svc.validate).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('ngOnInit: restores pending_dsl from sessionStorage and auto-validates', () => {
    mockSessionStorage.setItem('pending_dsl', '{"title":"restored"}');
    svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
    comp.ngOnInit();
    expect(comp.dslJson).toBe('{"title":"restored"}');
    expect(mockSessionStorage.getItem('pending_dsl')).toBeNull();
    expect(svc.validate).toHaveBeenCalledTimes(1);
  });

  it('ngOnInit: does nothing when no pending_dsl', () => {
    comp.ngOnInit();
    expect(comp.dslJson).toBe('');
    expect(svc.validate).not.toHaveBeenCalled();
  });

  it('restores the wizard on the persisted step after OAuth', () => {
    mockSessionStorage.setItem('pending_dsl', '{"title":"restored"}');
    mockSessionStorage.setItem('pending_step', 'step4');
    svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
    comp.ngOnInit();
    expect(comp.currentStep).toBe('step4');
    expect(mockSessionStorage.getItem('pending_dsl')).toBeNull();
    expect(mockSessionStorage.getItem('pending_step')).toBeNull();
  });

  it('falls back to step3 when pending_step is absent', () => {
    mockSessionStorage.setItem('pending_dsl', '{"title":"restored"}');
    svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
    comp.ngOnInit();
    expect(comp.currentStep).toBe('step3');
  });

  it('falls back to step3 when pending_step is a tampered/unknown value', () => {
    mockSessionStorage.setItem('pending_dsl', '{"title":"restored"}');
    mockSessionStorage.setItem('pending_step', 'bogus');
    svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
    comp.ngOnInit();
    expect(comp.currentStep).toBe('step3');
  });

  it('falls back to step3 when pending_step is "done"', () => {
    mockSessionStorage.setItem('pending_dsl', '{"title":"restored"}');
    mockSessionStorage.setItem('pending_step', 'done');
    svc.validate.mockReturnValue(of({ valid: true, errors: [] }));
    comp.ngOnInit();
    expect(comp.currentStep).toBe('step3');
  });

  it('create: persists the current step alongside pending_dsl when not authenticated', () => {
    comp.dslJson = '{"title":"T"}';
    comp.currentStep = 'step4';
    mockSessionStorage.removeItem('access_token');
    comp.create();
    expect(mockSessionStorage.getItem('pending_step')).toBe('step4');
  });

  it('clears the stored token on a 401 from create', () => {
    comp.dslJson = '{"title":"T"}';
    mockSessionStorage.setItem('access_token', 'tok');
    svc.createForm.mockReturnValue(throwError(() => ({ status: 401 })));
    comp.create();
    expect(mockSessionStorage.getItem('access_token')).toBeNull();
    expect(comp.serverError).toBe('sessionExpired');
  });

  it('clears the stored token on a 502 that looks like an expired Google credential', () => {
    comp.dslJson = '{"title":"T"}';
    mockSessionStorage.setItem('access_token', 'tok');
    svc.createForm.mockReturnValue(
      throwError(() => ({ status: 502, error: { message: 'Google API error: Invalid Credentials' } })),
    );
    comp.create();
    expect(mockSessionStorage.getItem('access_token')).toBeNull();
    expect(comp.serverError).toBe('sessionExpired');
  });

  it('does NOT clear the stored token on a 403', () => {
    comp.dslJson = '{"title":"T"}';
    mockSessionStorage.setItem('access_token', 'tok');
    svc.createForm.mockReturnValue(throwError(() => ({ status: 403, error: { message: 'Forbidden' } })));
    comp.create();
    expect(mockSessionStorage.getItem('access_token')).toBe('tok');
    expect(comp.serverError).toBe('Forbidden');
  });
});
