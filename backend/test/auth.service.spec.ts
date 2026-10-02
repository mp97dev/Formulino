import { BadRequestException } from '@nestjs/common';
import { AuthService } from '../src/auth.service';

function makeService() {
  return new AuthService();
}

function extractState(url: string): string {
  return new URL(url).searchParams.get('state') ?? '';
}

describe('AuthService', () => {
  const requiredEnv = {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
  };

  beforeEach(() => {
    Object.assign(process.env, requiredEnv);
  });

  afterEach(() => {
    for (const key of Object.keys(requiredEnv)) {
      delete process.env[key];
    }
    jest.restoreAllMocks();
  });

  describe('buildGoogleAuthorizationUrl', () => {
    it('generates a unique state on each call', () => {
      const svc = makeService();
      const { authorizationUrl: url1 } = svc.buildGoogleAuthorizationUrl();
      const { authorizationUrl: url2 } = svc.buildGoogleAuthorizationUrl();
      expect(extractState(url1)).not.toBe(extractState(url2));
    });

    it('includes a UUID-shaped state in the authorization URL', () => {
      const svc = makeService();
      const { authorizationUrl: url } = svc.buildGoogleAuthorizationUrl();
      expect(extractState(url)).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('returns the same state as in the authorization URL', () => {
      const svc = makeService();
      const { authorizationUrl, state } = svc.buildGoogleAuthorizationUrl();
      expect(extractState(authorizationUrl)).toBe(state);
    });

    it('includes a PKCE code_challenge with S256 and no include_granted_scopes', () => {
      const svc = makeService();
      const { authorizationUrl } = svc.buildGoogleAuthorizationUrl();
      const params = new URL(authorizationUrl).searchParams;
      expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(params.get('code_challenge_method')).toBe('S256');
      expect(params.has('include_granted_scopes')).toBe(false);
    });
  });

  describe('handleOAuthCallback', () => {
    it('throws BadRequestException when state is missing', async () => {
      const svc = makeService();
      await expect(
        svc.handleOAuthCallback('code', undefined, 'some-cookie'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // The login-CSRF regression test: a state minted by an attacker's own
    // /login call is syntactically valid and live in the store, but no
    // cookie was ever set on the victim's browser for it. Without requiring
    // the cookie, this state would be accepted — that is the exact exploit
    // described in the plan (attacker lures victim to a callback URL
    // carrying the attacker's code + a state the attacker minted).
    it('rejects a valid, live state when no state cookie is present', async () => {
      const svc = makeService();
      const { state } = svc.buildGoogleAuthorizationUrl();
      await expect(
        svc.handleOAuthCallback('code', state, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a valid state when the cookie does not match it', async () => {
      const svc = makeService();
      const { state } = svc.buildGoogleAuthorizationUrl();
      await expect(
        svc.handleOAuthCallback('code', state, 'a-different-value'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for an unknown state', async () => {
      const svc = makeService();
      await expect(
        svc.handleOAuthCallback('code', 'not-a-real-state', 'not-a-real-state'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for an expired state', async () => {
      const svc = makeService();
      const realNow = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(realNow);
      const { state } = svc.buildGoogleAuthorizationUrl();

      jest.spyOn(Date, 'now').mockReturnValue(realNow + 6 * 60_000);

      await expect(
        svc.handleOAuthCallback('code', state, state),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a valid state matching the cookie and returns the access token', async () => {
      const svc = makeService();
      const { state } = svc.buildGoogleAuthorizationUrl();

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'tok-123' }),
      } as Response);

      const token = await svc.handleOAuthCallback('auth-code', state, state);
      expect(token).toBe('tok-123');
    });

    it('sends the PKCE code_verifier in the token-exchange body', async () => {
      const svc = makeService();
      const { state } = svc.buildGoogleAuthorizationUrl();

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'tok-123' }),
      } as Response);

      await svc.handleOAuthCallback('auth-code', state, state);

      const [, init] = fetchSpy.mock.calls[0];
      const body = init?.body as URLSearchParams;
      expect(body.get('code_verifier')).toBeTruthy();
    });

    it('deletes the state after use to prevent replay', async () => {
      const svc = makeService();
      const { state } = svc.buildGoogleAuthorizationUrl();

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'tok-abc' }),
      } as Response);

      await svc.handleOAuthCallback('code', state, state);

      await expect(
        svc.handleOAuthCallback('code', state, state),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
