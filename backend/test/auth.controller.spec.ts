import { AuthController } from '../src/auth.controller';
import { AuthService } from '../src/auth.service';

function makeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    buildGoogleAuthorizationUrl: () => ({
      authorizationUrl: 'https://accounts.google.com/auth?...',
      state: 'the-state',
    }),
    handleOAuthCallback: async () => 'test-access-token',
    ...overrides,
  } as unknown as AuthService;
}

function makeResponse() {
  let redirectedTo = '';
  const cookies: Record<string, { value: string; options: Record<string, unknown> }> = {};
  const cleared: Array<{ name: string; options?: Record<string, unknown> }> = [];
  return {
    redirect(url: string) {
      redirectedTo = url;
    },
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies[name] = { value, options };
    },
    clearCookie(name: string, options?: Record<string, unknown>) {
      cleared.push({ name, options });
    },
    get url() {
      return redirectedTo;
    },
    get cookies() {
      return cookies;
    },
    get clearedCookies() {
      return cleared;
    },
  };
}

function makeRequest(cookieHeader?: string) {
  return { headers: { cookie: cookieHeader } };
}

describe('AuthController', () => {
  describe('login', () => {
    it('redirects to the Google authorization URL', () => {
      const service = makeAuthService();
      const controller = new AuthController(service);
      const res = makeResponse();

      controller.login(res);

      expect(res.url).toBe('https://accounts.google.com/auth?...');
    });

    it('sets the state cookie as HttpOnly with SameSite=Lax', () => {
      const service = makeAuthService();
      const controller = new AuthController(service);
      const res = makeResponse();

      controller.login(res);

      const cookie = res.cookies['formulino_oauth_state'];
      expect(cookie.value).toBe('the-state');
      expect(cookie.options.httpOnly).toBe(true);
      expect(cookie.options.sameSite).toBe('lax');
      expect(cookie.options.path).toBe('/');
    });
  });

  describe('callback', () => {
    it('redirects to frontend with access_token on success', async () => {
      const service = makeAuthService({ handleOAuthCallback: async () => 'tok-abc' });
      const controller = new AuthController(service);
      const res = makeResponse();
      process.env.FRONTEND_URL = 'http://localhost:4200';

      await controller.callback('auth-code', 'valid-state', makeRequest('formulino_oauth_state=valid-state'), res);

      expect(res.url).toBe('http://localhost:4200/callback#access_token=tok-abc');
    });

    it('clears the state cookie on success', async () => {
      const service = makeAuthService({ handleOAuthCallback: async () => 'tok-abc' });
      const controller = new AuthController(service);
      const res = makeResponse();
      process.env.FRONTEND_URL = 'http://localhost:4200';

      await controller.callback('auth-code', 'valid-state', makeRequest('formulino_oauth_state=valid-state'), res);

      expect(res.clearedCookies).toEqual([{ name: 'formulino_oauth_state', options: { path: '/' } }]);
    });

    it('redirects to error=no_code when code is absent', async () => {
      const controller = new AuthController(makeAuthService());
      const res = makeResponse();
      process.env.FRONTEND_URL = 'http://localhost:4200';

      await controller.callback(undefined, undefined, makeRequest(), res);

      expect(res.url).toBe('http://localhost:4200/callback?error=no_code');
    });

    it('clears the state cookie when code is absent', async () => {
      const controller = new AuthController(makeAuthService());
      const res = makeResponse();
      process.env.FRONTEND_URL = 'http://localhost:4200';

      await controller.callback(undefined, undefined, makeRequest(), res);

      expect(res.clearedCookies).toEqual([{ name: 'formulino_oauth_state', options: { path: '/' } }]);
    });

    it('redirects to error=exchange_failed when service throws a non-BadRequest error', async () => {
      const service = makeAuthService({
        handleOAuthCallback: async () => {
          throw new Error('token exchange failed');
        },
      });
      const controller = new AuthController(service);
      const res = makeResponse();
      process.env.FRONTEND_URL = 'http://localhost:4200';

      await controller.callback('some-code', 'state', makeRequest('formulino_oauth_state=state'), res);

      expect(res.url).toBe('http://localhost:4200/callback?error=exchange_failed');
    });

    it('clears the state cookie on failure too', async () => {
      const service = makeAuthService({
        handleOAuthCallback: async () => {
          throw new Error('token exchange failed');
        },
      });
      const controller = new AuthController(service);
      const res = makeResponse();
      process.env.FRONTEND_URL = 'http://localhost:4200';

      await controller.callback('some-code', 'state', makeRequest('formulino_oauth_state=state'), res);

      expect(res.clearedCookies).toEqual([{ name: 'formulino_oauth_state', options: { path: '/' } }]);
    });

    it('falls back to http://localhost:4200 when FRONTEND_URL is unset', async () => {
      const service = makeAuthService({ handleOAuthCallback: async () => 'tok-xyz' });
      const controller = new AuthController(service);
      const res = makeResponse();
      delete process.env.FRONTEND_URL;

      await controller.callback('code', 'state', makeRequest('formulino_oauth_state=state'), res);

      expect(res.url).toBe('http://localhost:4200/callback#access_token=tok-xyz');
    });

    it('passes the state cookie value read from the request headers to the service', async () => {
      let receivedCookie: string | undefined;
      const service = makeAuthService({
        handleOAuthCallback: async (_code: string, _state?: string, stateCookie?: string) => {
          receivedCookie = stateCookie;
          return 'tok';
        },
      });
      const controller = new AuthController(service);
      const res = makeResponse();
      process.env.FRONTEND_URL = 'http://localhost:4200';

      await controller.callback(
        'code',
        'state-value',
        makeRequest('other=1; formulino_oauth_state=state-value; another=2'),
        res,
      );

      expect(receivedCookie).toBe('state-value');
    });

    it('URL-encodes the access token in the success redirect fragment', async () => {
      const service = makeAuthService({ handleOAuthCallback: async () => 'tok with spaces' });
      const controller = new AuthController(service);
      const res = makeResponse();
      process.env.FRONTEND_URL = 'http://localhost:4200';

      await controller.callback('code', 'state', makeRequest('formulino_oauth_state=state'), res);

      expect(res.url).toBe('http://localhost:4200/callback#access_token=tok%20with%20spaces');
    });
  });
});
