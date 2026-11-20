# Migration Guide: formulino.michelepasetto.it → formulino.michelepasetto.it

This guide migrates Formulino from `formulino.michelepasetto.it` to the new custom
domain `formulino.michelepasetto.it`.

DNS for `michelepasetto.it` is hosted on **Cloudflare**; the domain itself is
registered with **Aruba** (Aruba is only the registrar — all DNS record
changes happen in the Cloudflare dashboard, not Aruba's).

The migration has zero downtime: the old domain stays active until you
explicitly remove it, and DNS + OAuth changes can be made before any Railway
variable is touched.

---

## What changes

| Setting | Before | After |
|---|---|---|
| Public URL | `https://formulino.michelepasetto.it` | `https://formulino.michelepasetto.it` |
| `GOOGLE_REDIRECT_URI` | `https://formulino.michelepasetto.it/api/auth/google/callback` | `https://formulino.michelepasetto.it/api/auth/google/callback` |
| `FRONTEND_URL` | `https://formulino.michelepasetto.it` | `https://formulino.michelepasetto.it` |
| `CORS_ORIGIN` | `https://formulino.michelepasetto.it` | `https://formulino.michelepasetto.it` |

Nothing in the codebase changes — all configuration lives in Railway environment
variables and Google Cloud Console. (The SEO-facing strings — canonical URLs,
Open Graph tags, the JSON-LD `url`, the DSL schema `$id`, and the README link —
were already updated to `formulino.michelepasetto.it` in this migration.)

---

## Step 1 — Railway: add the custom domain

1. Open [railway.app](https://railway.app) → your project → the Formulino service.
2. Go to **Settings → Networking**.
3. Click **Add Custom Domain**.
4. Enter `formulino.michelepasetto.it` and confirm.
5. Railway displays a **CNAME target** — a string like `<hash>.up.railway.app`.
   Copy it; you need it in the next step.

> Do **not** remove the old `formulino.michelepasetto.it` domain from Railway or
> Google Cloud yet — keep both active during the transition so existing
> sessions and bookmarks are not broken.

---

## Step 2 — Cloudflare: create the CNAME record

Log in to the [Cloudflare dashboard](https://dash.cloudflare.com) → select
the `michelepasetto.it` zone → **DNS → Records → Add record**:

| Type | Name | Target | Proxy status | TTL |
|---|---|---|---|---|
| `CNAME` | `formulino` | `<CNAME target from Step 1>` | **DNS only** (grey cloud) | Auto |

**Important — keep the proxy status "DNS only" (grey cloud) at first.**
If the record is proxied (orange cloud), Cloudflare terminates TLS and
intercepts the domain-validation request Railway needs to issue its own
Let's Encrypt certificate — Railway's dashboard will show "Certificate
pending" indefinitely and never issue it. Once Railway shows **"Certificate
issued"**, you can optionally switch the record to proxied (orange cloud) for
Cloudflare's CDN/WAF — verify the site still loads and OAuth still completes
after switching, since double TLS-termination through a proxy can occasionally
interact with redirect handling.

**Verify propagation** (usually near-instant on Cloudflare, but allow a minute):

```bash
dig formulino.michelepasetto.it CNAME +short
# expected: <hash>.up.railway.app.

curl -I https://formulino.michelepasetto.it/health
# expected: HTTP/2 200
```

Do not proceed to Step 3 until Railway's dashboard shows **"Certificate issued"**
for the new domain.

---

## Step 3 — Google Cloud Console: update OAuth credentials

Google Cloud has two separate places for domain configuration. They behave
differently and must not be confused.

### 3a — OAuth consent screen: Authorized domains

Go to **APIs & Services → OAuth consent screen → Edit App → Authorized domains**.

This field only accepts the **top private domain** — no subdomain prefix, no
`https://`, no path. Add (do not remove `michelepasetto.it` yet):

```
michelepasetto.it
```

Entering `formulino.michelepasetto.it` here will fail with *"must be a top
private domain"*. The root domain `michelepasetto.it` covers all subdomains
automatically — including `formulino.michelepasetto.it` and any other
subdomain you host there (e.g. your portfolio site).

### 3b — OAuth 2.0 Client ID: Origins and Redirect URIs

Go to **APIs & Services → Credentials** → click your OAuth 2.0 Client ID.
These fields accept full URLs including subdomains.

**Authorized JavaScript Origins** — add the new origin, keep the old one:

```
https://formulino.michelepasetto.it
https://formulino.michelepasetto.it
```

**Authorized Redirect URIs** — add the new callback, keep the old one:

```
https://formulino.michelepasetto.it/api/auth/google/callback
https://formulino.michelepasetto.it/api/auth/google/callback
```

Click **Save**. Google propagates the change within seconds.

> The old entries must stay until Railway variables are updated and redeployed —
> any active OAuth flow that started on the old domain would break otherwise.

---

## Step 4 — Railway: update environment variables

In the Railway dashboard → your service → **Variables**, change these three values:

| Variable | New value |
|---|---|
| `GOOGLE_REDIRECT_URI` | `https://formulino.michelepasetto.it/api/auth/google/callback` |
| `FRONTEND_URL` | `https://formulino.michelepasetto.it` |
| `CORS_ORIGIN` | `https://formulino.michelepasetto.it` |

Save — Railway redeploys automatically. The redeploy takes ~1 minute.

---

## Step 5 — Verify end-to-end

```bash
# 1. Health check on the new domain
curl https://formulino.michelepasetto.it/health
# expected: {"service":"backend","status":"ok"}

# 2. Frontend HTML served
curl -sI https://formulino.michelepasetto.it/ | grep -i content-type
# expected: text/html

# 3. OAuth redirect starts correctly
curl -sI https://formulino.michelepasetto.it/api/auth/google/login | grep -i location
# expected: Location: https://accounts.google.com/o/oauth2/...
```

Then open `https://formulino.michelepasetto.it` in a browser and complete a full
OAuth login → form creation flow to confirm everything works. Since the OAuth
token is passed as a URL fragment (`#access_token=…`, not a query param — see
`docs/security-audit-2026-05-14.md` H1), also confirm the token never appears
in the address bar's query string or in Railway's access logs.

---

## Step 6 — Cleanup (wait 24–48 h after verifying)

Once you are confident the new domain is stable:

### Google Cloud Console

Remove the old entries:

- Authorized domains: delete `michelepasetto.it` (only if nothing else on that domain
  needs it)
- Authorized JavaScript Origins: delete `https://formulino.michelepasetto.it`
- Authorized Redirect URIs: delete `https://formulino.michelepasetto.it/api/auth/google/callback`

### Railway

Go to **Settings → Networking** and delete the old `formulino.michelepasetto.it`
custom domain. This prevents users from bypassing the new domain and hitting
the old one directly.

### Cloudflare / DNS

Remove or repoint the old `formulino.michelepasetto.it` DNS record (in whichever
provider hosts the `michelepasetto.it` zone) once you've confirmed no traffic is
still landing on it.

### SEO

- Update Google Search Console: add `formulino.michelepasetto.it` as a new
  property, submit its sitemap, and (once traffic has shifted) set up a
  redirect or note the change of address if the old property should be
  retired. See `docs/seo-traffic-guide.md`.
- Google Search Console's **google-site-verification** meta tag in
  `frontend/src/index.html` is tied to the property it was issued for — a new
  property on the new domain will need its own verification tag.

---

## Troubleshooting

### Railway shows "Certificate pending" for more than 10 minutes

Almost always the Cloudflare proxy (orange cloud) is on. Switch the `formulino`
CNAME record to **DNS only** (grey cloud) in Cloudflare and wait — Railway
needs to see your origin directly to complete domain validation. If the record
is already DNS-only, verify with `dig formulino.michelepasetto.it CNAME`.

### `redirect_uri_mismatch` after switching

The `GOOGLE_REDIRECT_URI` variable still has the old domain, or the new URI
was not saved in Google Cloud Console. Double-check both exactly match
`https://formulino.michelepasetto.it/api/auth/google/callback` with no
trailing slash.

### Old domain still works, new domain returns 502

Railway redeployed with the new variables but the backend failed to start.
Check deployment logs — a missing or malformed `GOOGLE_REDIRECT_URI` causes
`getRequiredEnv` to throw on the first request. Correct the variable and
trigger a manual redeploy from the Railway dashboard.

### CORS errors in the browser console

`CORS_ORIGIN` was not updated or the redeployment did not pick it up. Confirm
the variable value in Railway, then trigger a manual redeploy if needed.

### Site loads but OAuth callback hangs or shows a certificate warning after enabling Cloudflare proxy

Switch the `formulino` record back to **DNS only** (grey cloud) and confirm
Railway's certificate is still valid. Re-enable the proxy only after
confirming the plain DNS-only setup works end-to-end.
