const TOKEN_KEY = 'access_token';
const TOKEN_AT_KEY = 'access_token_at';
// Google access tokens live ~1h. Treat them as expired a little earlier so the
// UI never offers a token that dies in the middle of a request.
const TOKEN_TTL_MS = 55 * 60 * 1000;

export function saveToken(token: string, now: number = Date.now()): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_AT_KEY, String(now));
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_AT_KEY);
}

export function getToken(now: number = Date.now()): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const savedAt = Number(sessionStorage.getItem(TOKEN_AT_KEY));
  // No timestamp (token stored by an older build) → keep it; a 401 will clear it.
  if (savedAt > 0 && now - savedAt > TOKEN_TTL_MS) {
    clearToken();
    return null;
  }
  return token;
}
