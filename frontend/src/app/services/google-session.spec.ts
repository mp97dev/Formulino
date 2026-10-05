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
