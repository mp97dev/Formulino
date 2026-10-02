import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

// Name of the HttpOnly cookie that binds an OAuth `state` to the browser that
// started the flow — see AuthController for where it is set/read/cleared.
export const OAUTH_STATE_COOKIE = 'formulino_oauth_state';

@Injectable()
export class AuthService {
  private readonly authBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';
  // state → { expiry, PKCE code_verifier for this flow }. The state alone no
  // longer proves anything about the browser (any visitor of /login could
  // read it, e.g. via an open redirect or referrer leak) — the controller
  // also requires it to match an HttpOnly cookie set on the same browser.
  private readonly stateStore = new Map<string, { expiresAt: number; codeVerifier: string }>();

  buildGoogleAuthorizationUrl(): { authorizationUrl: string; state: string } {
    const clientId = this.getRequiredEnv('GOOGLE_CLIENT_ID');
    const redirectUri = this.getRequiredEnv('GOOGLE_REDIRECT_URI');

    // Only the forms.body scope is requested: it's the only one the backend
    // reads or uses. openid/email/profile and an offline (refresh-token)
    // grant were previously requested but never consumed — dropped per the
    // GDPR data-minimisation principle (Art. 5(1)(c)).
    const scopes = ['https://www.googleapis.com/auth/forms.body'];

    this.pruneExpiredStates();
    const state = randomUUID();
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    this.stateStore.set(state, { expiresAt: Date.now() + 5 * 60_000, codeVerifier });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      // include_granted_scopes deliberately omitted: incremental auth would
      // silently return whatever else this Google account already consented
      // to for this client, beyond the single forms.body scope we ask for.
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return { authorizationUrl: `${this.authBaseUrl}?${params.toString()}`, state };
  }

  async handleOAuthCallback(
    code: string,
    state: string | undefined,
    stateCookie: string | undefined,
  ): Promise<string> {
    if (!this.isValidState(state, stateCookie)) {
      this.stateStore.delete(state ?? '');
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    // state is defined here (isValidState checked it), the store entry with it.
    const entry = this.stateStore.get(state!)!;
    this.stateStore.delete(state!);

    const tokenPayload = new URLSearchParams({
      code,
      client_id: this.getRequiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: this.getRequiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: this.getRequiredEnv('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
      code_verifier: entry.codeVerifier,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenPayload,
    });

    const tokenData = (await response.json()) as GoogleTokenResponse;

    if (!response.ok || tokenData.error) {
      throw new InternalServerErrorException({
        message: 'Google token exchange failed',
        providerError: tokenData.error,
        providerErrorDescription: tokenData.error_description,
      });
    }

    if (!tokenData.access_token) {
      throw new InternalServerErrorException(
        'Google token exchange did not return access_token',
      );
    }

    return tokenData.access_token;
  }

  // `state` proves a login flow was started; the cookie proves it was started
  // by *this* browser. Without requiring both, an attacker can mint a state
  // via their own /login call and plant it on a victim's callback URL
  // (login-CSRF) — the victim's browser would then store the attacker's
  // Google session. Both must be present, equal, and match a live entry.
  private isValidState(state: string | undefined, stateCookie: string | undefined): boolean {
    if (!state || !stateCookie) return false;

    const stateBuf = Buffer.from(state);
    const cookieBuf = Buffer.from(stateCookie);
    // timingSafeEqual throws on unequal-length buffers — guard first.
    if (stateBuf.length !== cookieBuf.length || !timingSafeEqual(stateBuf, cookieBuf)) {
      return false;
    }

    const entry = this.stateStore.get(state);
    return entry !== undefined && Date.now() <= entry.expiresAt;
  }

  private pruneExpiredStates(): void {
    const now = Date.now();
    for (const [key, entry] of this.stateStore) {
      if (now > entry.expiresAt) this.stateStore.delete(key);
    }
  }

  private getRequiredEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
      throw new InternalServerErrorException(
        `Missing required environment variable: ${name}`,
      );
    }

    return value;
  }
}
