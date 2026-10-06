# Deploy Guide: Railway (Single Service)

This guide walks through deploying Formulino on Railway from scratch.
The deployment is a single container: Nginx serves the Angular frontend and proxies
`/api/*` traffic to the NestJS backend running on an internal port.

---

## Architecture overview

```
Internet
   │
   ▼
Railway public domain (HTTPS)
   │
   ▼
Nginx (PORT — injected by Railway, default 8080)
   ├── /health         → NestJS :3000/health     (healthcheck)
   ├── /api/*          → NestJS :3000/*           (backend API, /api/ prefix stripped)
   └── /*              → /srv/frontend/index.html (Angular SPA)
```

Key consequence: every backend route is reachable publicly under `/api/`. The
Google OAuth callback URL must therefore include this prefix.

---

## Prerequisites

- GitHub account with this repository pushed (Railway deploys from GitHub).
- Railway account — [railway.app](https://railway.app).
- Google Cloud project with billing enabled (required for OAuth consent screen).

---

## Step 1 — Set up Google Cloud OAuth credentials

### 1.1 Enable Google Forms API

1. Open [Google Cloud Console](https://console.cloud.google.com).
2. Select or create a project.
3. Go to **APIs & Services → Library**.
4. Search for **Google Forms API** and click **Enable**.

### 1.2 Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (works for any Google account; requires verification for production use).
3. Fill in:
   - **App name** — any name visible to users during login.
   - **User support email** — your email.
   - **Developer contact email** — your email.
4. Click **Save and Continue**.
5. On the **Scopes** screen, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/forms.body`
6. Click **Save and Continue**.
7. On the **Test users** screen, add the Google accounts you want to allow during
   development (while the app is in "Testing" status, only listed emails can log in).
8. Click **Save and Continue**.

### 1.3 Create an OAuth 2.0 Client ID

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: anything (e.g. `formulino-railway`).
5. Under **Authorized redirect URIs**, add:
   ```
   https://<your-railway-domain>/api/auth/google/callback
   ```
   Replace `<your-railway-domain>` with the public domain Railway assigns
   (e.g. `<your-app>.up.railway.app`). You can come back and add it
   after the Railway service is created if you do not know it yet.
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret** — you will need them in Step 3.

> **Note:** The redirect URI must match exactly what the backend sends to Google.
> With the Nginx proxy, the public path is `/api/auth/google/callback` even though
> the NestJS route is registered as `/auth/google/callback`.

---

## Step 2 — Create the Railway service

1. Log in at [railway.app](https://railway.app) and click **New Project**.
2. Select **Deploy from GitHub repo**.
3. Authorise Railway to access your GitHub account and select this repository.
4. Railway detects `railway.toml` and `Dockerfile` at the root automatically.
   No additional build configuration is required.
5. Click **Deploy** — Railway will build the Docker image and start the container.
   The first build takes approximately 3–5 minutes.
6. Once deployed, go to **Settings → Networking** and note the public domain
   (e.g. `<your-app>.up.railway.app`).

---

## Step 3 — Set environment variables

In the Railway dashboard, open your service and go to **Variables**.
Set the following:

### Required

| Variable | Example value | Where to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `123456789-abc...apps.googleusercontent.com` | Google Cloud Console → Credentials → your OAuth client |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Same OAuth client detail page |
| `GOOGLE_REDIRECT_URI` | `https://<your-railway-domain>/api/auth/google/callback` | Compose from your Railway domain |
| `FRONTEND_URL` | `https://<your-railway-domain>` | Your Railway domain (no trailing slash) |

### Optional but recommended

| Variable | Example value | Purpose |
|---|---|---|
| `CORS_ORIGIN` | `https://<your-railway-domain>` | Restricts CORS to your domain; falls back to `*` if unset |

### Do NOT set these

| Variable | Reason |
|---|---|
| `PORT` | Railway injects this automatically; overriding it breaks the container |
| `BACKEND_PORT` | Defaults to `3000` in the Dockerfile; no need to change |
| `NODE_ENV` | Set to `production` in the Dockerfile |

After saving variables, Railway automatically redeploys the service.

---

## Step 4 — Update the redirect URI in Google Cloud

If you created the OAuth client before knowing the Railway domain, go back to
**APIs & Services → Credentials → your OAuth client** and add the correct URI:

```
https://<your-railway-domain>/api/auth/google/callback
```

Google propagates the change in a few seconds.

---

## Step 5 — Verify the deployment

Run these checks in order:

```bash
# 1. Health endpoint — should return {"service":"backend","status":"ok"}
curl https://<your-railway-domain>/health

# 2. Frontend — should return HTML (Angular app)
curl -I https://<your-railway-domain>/

# 3. OAuth login redirect — should redirect to accounts.google.com
curl -I https://<your-railway-domain>/api/auth/google/login
```

Then open `https://<your-railway-domain>` in a browser:

1. Click **Login with Google**.
2. Google shows the consent screen — sign in with a test user account.
3. After consent, the browser redirects to
   `https://<your-railway-domain>/callback?access_token=<token>`.
4. You should land on the editor page with a valid session.

---

## Test locally with Docker before deploying

Build and run the same image locally before pushing to Railway:

```bash
docker build -t formulino:local .

docker run --rm -p 8080:8080 \
  -e GOOGLE_CLIENT_ID="<your-client-id>" \
  -e GOOGLE_CLIENT_SECRET="<your-client-secret>" \
  -e GOOGLE_REDIRECT_URI="http://localhost:8080/api/auth/google/callback" \
  -e FRONTEND_URL="http://localhost:8080" \
  -e CORS_ORIGIN="http://localhost:8080" \
  formulino:local
```

Then open:
- Frontend: `http://localhost:8080/`
- Health: `http://localhost:8080/health`
- Login: `http://localhost:8080/api/auth/google/login`

> For the full OAuth flow to complete locally, also add
> `http://localhost:8080/api/auth/google/callback` as an authorised redirect URI
> in the Google Cloud Console.

---

## Troubleshooting

### `redirect_uri_mismatch` from Google

The URI sent by the backend does not match any authorised redirect URI in Google Cloud.
Check that:
- `GOOGLE_REDIRECT_URI` is set to `https://<your-railway-domain>/api/auth/google/callback`.
- The exact same string (including `https://` and no trailing slash) appears in
  the **Authorized redirect URIs** list on the Google Cloud credentials page.

### `Authentication failed — invalid or expired OAuth state`

The CSRF state token expired (5-minute TTL) or the callback was received twice.
Start the login flow again from the beginning.

### Frontend loads but "Login with Google" does nothing / returns 404

Check that `GOOGLE_CLIENT_ID` is set. A missing client ID causes
`buildGoogleAuthorizationUrl` to throw and the login route to fail.

### 502 Bad Gateway on `/api/*` routes

The NestJS backend failed to start. Check Railway's deployment logs:
- A missing `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` causes `getRequiredEnv`
  to throw on the first request, returning 500 rather than 502 — check the
  response body for `"required environment variable"`.
- Run `curl https://<your-railway-domain>/health` — a 502 here means the backend
  process itself is down; a 500 means it started but a request-level error occurred.

### App is in "Testing" and Google shows "Access blocked"

While the OAuth consent screen is in **Testing** status, only accounts listed
under **Test users** can log in. Add the Google account you are testing with,
or publish the app (requires Google verification for sensitive scopes).

## Contatore "form creati"

Il backend salva una data (`YYYY-MM-DD`) per riga in un file di testo ogni volta che un form viene creato; nessun dato su utenti, form o token. Il totale e l'ultima settimana sono esposti da `GET /api/stats` e mostrati sopra il footer.

- `STATS_FILE`: percorso del file (default `./data/created-forms.log`).
- Il filesystem del container è effimero: per non azzerare il contatore a ogni deploy, monta un Volume Railway (es. su `/data`) e imposta `STATS_FILE=/data/created-forms.log`.
- Se il file non è scrivibile il conteggio resta in memoria e la creazione dei form non è affetta.
