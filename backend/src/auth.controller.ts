import { Controller, Get, Query, Req, Res } from '@nestjs/common';

import { AuthService, OAUTH_STATE_COOKIE } from './auth.service';

// Express's Response provides redirect/cookie/clearCookie natively — that is
// why cookie-parser (for writing) is not needed, only this duck type.
type HttpResponse = {
  redirect(url: string): void;
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options?: Record<string, unknown>): void;
};

@Controller('auth/google')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login')
  login(@Res() response: HttpResponse) {
    const { authorizationUrl, state } = this.authService.buildGoogleAuthorizationUrl();

    response.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      // Lax, not Strict: the callback arrives as a top-level GET navigation
      // from accounts.google.com — Lax still sends the cookie on that,
      // Strict would drop it and break every login.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      // path: '/' is deliberate, not the default oversight it looks like: in
      // production nginx serves the backend under /api/, so the browser sees
      // this cookie set from /api/auth/google/login, while dev sees it set
      // from /auth/google/login. A narrower path would silently not match
      // one of the two environments.
      path: '/',
      maxAge: 5 * 60_000,
    });

    return response.redirect(authorizationUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: { headers: { cookie?: string } },
    @Res() res: HttpResponse,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const stateCookie = this.readCookie(request.headers.cookie, OAUTH_STATE_COOKIE);

    // Cleared on every exit path so a failed attempt never leaves a live
    // state cookie behind for a later request to (mis)match against.
    const clearStateCookie = () => res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    if (!code) {
      clearStateCookie();
      return res.redirect(`${frontendUrl}/callback?error=no_code`);
    }

    try {
      const token = await this.authService.handleOAuthCallback(code, state, stateCookie);
      clearStateCookie();
      return res.redirect(`${frontendUrl}/callback#access_token=${encodeURIComponent(token)}`);
    } catch (err: unknown) {
      clearStateCookie();
      const isBadRequest =
        err instanceof Error && err.constructor.name === 'BadRequestException';
      const errorCode = isBadRequest ? 'invalid_state' : 'exchange_failed';
      return res.redirect(`${frontendUrl}/callback?error=${errorCode}`);
    }
  }

  // Minimal manual cookie parse — deliberately not cookie-parser, to avoid a
  // new runtime dependency for reading a single first-party cookie value.
  private readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      if (key === name) return decodeURIComponent(trimmed.slice(eq + 1));
    }
    return undefined;
  }
}
