# Plan: Fix Landing Preface, Broken Stepper Styling, and OAuth Step Regression

## Summary
Three user-reported defects on the **live site** (`formulino.michelepasetto.it`; local dev is unaffected):

1. **No preface.** The app boots straight into wizard step 1. The real title, description and FAQ exist only in the crawler-only fallback markup inside `<app-root>` in `index.html`, which Angular wipes on bootstrap. The in-app hero is one small truncated grey line and its description is `display: none`.
2. **Stepper renders unstyled** — a bare vertical list of words with a raw `✓`. Root cause: the production build emits **unhashed** filenames (`styles.css`, `main.js`) while nginx serves every `.css`/`.js` with `Cache-Control: public, immutable` + `expires 1y`. Returning visitors are pinned to a pre-wizard `styles.css` that has no `.wp-*` rules. All other styling survives because it is component-inline CSS compiled into `main.js`.
3. **"Genera form" bounces back a step.** After the Google OAuth round-trip, `ngOnInit` restores the pasted JSON but hard-codes `currentStep = 'step3'`, so the user is dropped two steps back and must re-walk 3 → 3b → 4. Compounded by a stale access token never being cleared on 401.

## User Story
As a teacher landing on Formulino, I want to understand what the app does before I am asked to do anything, see a legible progress indicator, and have "Genera form" work on the first click after signing in with Google.

## Problem → Solution
| # | Problem | Solution |
|---|---|---|
| 1 | Wizard starts with no context | Render a real hero (H1 + visible description) and an in-app FAQ section sourced from the same content as the crawler fallback |
| 2 | Stale global CSS cached forever under a fixed filename | Enable `outputHashing: "all"` for production + narrow the nginx `immutable` rule so only hashed assets get it and `index.html` is never cached |
| 3 | OAuth return lands on step 3 | Persist the wizard step across the redirect and restore step 4; clear a stale token on 401 so the retry re-authenticates instead of looping |

## Metadata
- **Complexity**: Medium
- **Source PRD**: N/A (user bug report, 2026-09-10)
- **Estimated Files**: 5 (`angular.json`, `default.conf.template`, `app.component.ts`, `i18n.service.ts`, `app.component.spec.ts`)

---

## UX Design

**Landing (above the wizard), decided with the user — "full hero + FAQ section":**

```
┌─────────────────────────────────────────┐
│ [logo] Formulino                  [EN]  │  ← existing header, unchanged
├─────────────────────────────────────────┤
│                                         │
│        Formulino                        │  ← H1, large, --text-primary
│   Crea Google Form dalla tua            │  ← tagline, --text-secondary
│   conversazione AI                      │
│                                         │
│   Descrivi il form al tuo assistente    │  ← appDesc, NO LONGER display:none
│   AI (ChatGPT, Claude, Gemini),         │
│   incolla la risposta e il tuo Google   │
│   Form è pronto in secondi.             │
│                                         │
├─────────────────────────────────────────┤
│  ①──②──③──④──⑤   (stepper)              │
│  ┌───────────────────────────────────┐  │
│  │ STEP 1 card                       │  │
│  └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  Domande frequenti                      │  ← FAQ, BELOW the wizard
│  ▸ Cos'è Formulino?                     │     collapsible <details>
│  ▸ Formulino è gratuito?                │
│  ▸ Come funziona Formulino?             │
│  ▸ Serve un account Google?             │
│  ▸ Quali tipi di domande posso creare?  │
└─────────────────────────────────────────┘
```

Deliberate placement: the FAQ goes **below** the wizard, not above it. Putting five Q&A blocks between the hero and step 1 would push the primary CTA off the first screen on mobile. The hero alone gives the preface; the FAQ is reference material. The FAQ is rendered only on `currentStep === 'step1'` so it does not clutter the working steps.

The stepper itself needs no design change — it already has a correct design in `styles.css`; it simply is not reaching users.

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 (critical) | `frontend/src/app/app.component.ts` | 19-23, 320-341, 1035-1050, 1077-1085, 1093-1117 | Hero markup + hero CSS + wizard state fields + `ngOnInit` restore + `create()` |
| P0 (critical) | `frontend/angular.json` | 44-65 | Build `styles` entry and the `production` configuration missing `outputHashing` |
| P0 (critical) | `deploy/nginx/default.conf.template` | 22-34, 70-72 | The `immutable` asset block and the SPA fallback `location /` |
| P1 (important) | `frontend/src/styles.css` | 44-114 | The stepper CSS that is not reaching users — do NOT rewrite it, it is correct |
| P1 (important) | `frontend/src/index.html` | 132-156 | Crawler fallback: the canonical source of the FAQ copy to mirror in-app |
| P1 (important) | `frontend/src/app/services/i18n.service.ts` | 7-8, 120-121 | `appTagline` / `appDesc` keys; IT block ~1-118, EN block ~119-263 |
| P2 (context) | `frontend/src/app/callback/callback.component.ts` | 21-41 | Where `access_token` is stored before redirecting to `/` |

---

## Patterns to Mirror

### I18N_KEY_PAIRING
Every key MUST exist in both the `it` and `en` blocks of `i18n.service.ts`, at the same relative position.
```typescript
// SOURCE: frontend/src/app/services/i18n.service.ts:7-8 (it) and 120-121 (en)
appTagline: 'Crea Google Form dalla tua conversazione AI',
appDesc: 'Descrivi il form al tuo assistente AI (ChatGPT, Claude, Gemini), incolla la risposta e il tuo Google Form è pronto in secondi.',
```

### TEMPLATE_CONDITIONAL_SECTION
```typescript
// SOURCE: frontend/src/app/app.component.ts:26
<nav class="wizard-progress" aria-label="Progresso" *ngIf="currentStep !== 'done'">
```

### COMPONENT_INLINE_CSS
All component styling lives in the `styles: [...]` array of the component, using the `--bg` / `--surface` / `--border` / `--text-primary` / `--text-secondary` / `--accent` tokens.
```typescript
// SOURCE: frontend/src/app/app.component.ts:344-351
.step-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}
```

### NGINX_HEADER_REPEAT
nginx **replaces**, not appends, parent `add_header` directives inside a child `location`. Every child block that adds a header must repeat the full security header set.
```nginx
# SOURCE: deploy/nginx/default.conf.template:24-30
location ~* \.(js|css|...)$ {
  add_header X-Content-Type-Options "nosniff" always;
  ...
}
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `frontend/angular.json` | UPDATE | Add `"outputHashing": "all"` to the `production` configuration (root cause of issue 2) |
| `deploy/nginx/default.conf.template` | UPDATE | Restrict `immutable` to hashed assets; add an explicit no-cache block for `index.html` |
| `frontend/src/app/app.component.ts` | UPDATE | Real hero + FAQ section + styles; persist/restore wizard step across OAuth; clear stale token on 401 |
| `frontend/src/app/services/i18n.service.ts` | UPDATE | Add `appName` + 5 FAQ question/answer key pairs in both IT and EN |
| `frontend/src/app/app.component.spec.ts` | UPDATE | Regression tests for the OAuth step restore and the token-expiry path |

## NOT Building
- **No backend OAuth changes.** The in-memory `stateStore` (`backend/src/auth.service.ts:57`) is a real latent bug — it loses all pending states on restart and breaks above one replica — but it is not what the user is hitting and carries a much larger blast radius. Track separately.
- **No change to the `forms.body` scope or to `access_type`.** Do not add an offline/refresh-token grant; the current minimal scope is a deliberate GDPR data-minimisation decision documented at `auth.service.ts:63-66`.
- **No change to the `@Throttle` limit** on `/forms/create`.
- **No rewrite of the stepper CSS.** It is correct; it is a delivery problem.
- **No removal of the crawler fallback in `index.html`.** It still serves pre-bootstrap and no-JS visitors.
- **No routing changes.** The FAQ is a section on `/`, not a new route.

---

## Step-by-Step Tasks

### Task 1: Enable content hashing on production builds
- **ACTION**: Edit the `production` configuration in `frontend/angular.json`
- **IMPLEMENT**: Add `outputHashing` alongside the existing production options (after `"optimization": true`):
  ```json
  "production": {
    "fileReplacements": [ ... ],
    "optimization": true,
    "outputHashing": "all",
    "extractLicenses": true,
    "sourceMap": false
  }
  ```
- **MIRROR**: The existing JSON style in that block — 2-space indent, no trailing comma.
- **GOTCHA**: Do **not** add `outputHashing` to the `development` configuration; unhashed names are wanted for the dev server. Leave `defaultConfiguration: "development"` alone.
- **VALIDATE**: `cd frontend && npx ng build --configuration production` then `ls dist/frontend/browser/` — filenames must now look like `main-A1B2C3D4.js` and `styles-E5F6G7H8.css`. Before this change they are bare `main.js` / `styles.css`.

### Task 2: Fix the nginx cache rules
- **ACTION**: Edit `deploy/nginx/default.conf.template`
- **IMPLEMENT**: Two changes.

  (a) Add an explicit never-cache block for the SPA entry point, placed **before** the `location ~* \.(js|css|...)$` block:
  ```nginx
  # index.html must never be cached: it is what points at the hashed asset names.
  location = /index.html {
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src https://ko-fi.com; font-src 'self'" always;
    add_header Cache-Control "no-cache, must-revalidate" always;
    expires -1;
  }
  ```

  (b) In the existing asset block, replace `expires 1y; add_header Cache-Control "public, immutable";` with a form that only marks genuinely-hashed files immutable. Use a `map` at the top of the file (outside `server {}`) keyed on whether the filename carries a hash:
  ```nginx
  # A hashed asset name looks like main-A1B2C3D4.js — safe to cache forever.
  # Anything else must revalidate, or a stale copy is pinned for a year.
  map $uri $asset_cache_control {
    default                              "public, max-age=3600";
    "~*-[A-Za-z0-9]{8,}\.(js|css)$"      "public, max-age=31536000, immutable";
  }
  ```
  and inside the asset location block:
  ```nginx
  add_header Cache-Control $asset_cache_control always;
  ```
  removing the `expires 1y;` line (`expires` and an explicit `Cache-Control` header fight each other — `expires` wins and would re-introduce the bug).
- **MIRROR**: `NGINX_HEADER_REPEAT` — the full five-header security set is repeated in the new `location = /index.html` block, exactly as the existing asset block does.
- **GOTCHA**: The `map` directive must sit at `http` level, i.e. **outside** `server { }`. This template is included into an `http` context by `deploy/start.sh` — verify that before placing it; if the template is included *inside* `http` (it is, as a `conf.d`-style server block file), the `map` goes at the very top of the file above `server {`. If `start.sh` wraps it differently, fall back to a plain `if ($uri ~* "-[A-Za-z0-9]{8,}\.(js|css)$")` inside the location block instead.
- **GOTCHA**: `assets/*.png`, the favicon set and `site.webmanifest` are **not** hashed by Angular (they are copied verbatim by the `assets` glob in `angular.json:22-43`). Under the new map they fall to `max-age=3600`, which is correct — they must not be immutable either.
- **VALIDATE**: `docker build -t formulino-test . && docker run --rm -e PORT=8080 -e BACKEND_PORT=3000 -p 8080:8080 formulino-test`, then:
  ```bash
  curl -sI http://localhost:8080/ | grep -i cache-control          # expect no-cache
  curl -sI http://localhost:8080/main-<hash>.js | grep -i cache-control  # expect immutable
  ```
  If Docker is unavailable, at minimum run `nginx -t -c` against a rendered copy of the template to confirm it parses.

### Task 3: Add the i18n keys for the hero and FAQ
- **ACTION**: Edit `frontend/src/app/services/i18n.service.ts`
- **IMPLEMENT**: Add to the **`it`** block, near `appTagline` (line 7):
  ```typescript
  appName: 'Formulino',
  faqTitle: 'Domande frequenti',
  faqQ1: 'Cos’è Formulino?',
  faqA1: 'Formulino è un’app gratuita che permette agli insegnanti di creare Google Form in pochi secondi usando l’intelligenza artificiale.',
  faqQ2: 'Formulino è gratuito?',
  faqA2: 'Sì, è completamente gratuito. Serve solo un account Google per creare i form.',
  faqQ3: 'Come funziona Formulino?',
  faqA3: 'Descrivi il form al tuo assistente AI, copia la risposta, incollala su Formulino e clicca "Crea Form". Il Google Form viene creato automaticamente nel tuo account Google.',
  faqQ4: 'Serve un account Google?',
  faqA4: 'Sì, è necessario accedere con Google per creare i form direttamente nel tuo Google Drive.',
  faqQ5: 'Quali tipi di domande posso creare?',
  faqA5: 'Risposta multipla, risposta aperta, vero/falso e altri tipi disponibili in Google Form. Puoi creare verifiche, quiz con punteggio e sondaggi per la classe.',
  ```
  and the English equivalents at the matching position in the **`en`** block (~line 120).
- **MIRROR**: `I18N_KEY_PAIRING`.
- **GOTCHA**: The IT copy MUST be taken verbatim from `frontend/src/index.html:142-151` (the crawler fallback `<dd>` text). Divergence between the rendered FAQ and the `FAQPage` JSON-LD in `index.html:83-127` is a Google Search Console structured-data violation — the schema must describe content actually on the page.
- **GOTCHA**: `appName` is deliberately a key even though "Formulino" is not translated — it keeps the H1 out of the template as a literal, matching how every other string in this component is handled.
- **VALIDATE**: `cd frontend && npx tsc --noEmit` — the `it` and `en` objects are structurally typed against each other, so a missing key on either side is a compile error.

### Task 4: Build the real hero
- **ACTION**: Edit the `.hero` section of the template and its CSS in `frontend/src/app/app.component.ts`
- **IMPLEMENT**: Template (replacing lines 20-23):
  ```html
  <section class="hero">
    <h1 class="hero-title">{{ i18n.t('appName') }}</h1>
    <p class="hero-tagline">{{ i18n.t('appTagline') }}</p>
    <p class="hero-desc">{{ i18n.t('appDesc') }}</p>
  </section>
  ```
  CSS (replacing lines 320-341):
  ```css
  .hero {
    text-align: center;
    padding: 1.5rem 0 .25rem;
  }

  .hero-title {
    font-size: clamp(1.9rem, 6vw, 2.6rem);
    color: var(--text-primary);
    margin: 0 0 .3rem;
    font-weight: 800;
    letter-spacing: -.03em;
    line-height: 1.1;
  }

  .hero-tagline {
    font-size: clamp(1rem, 2.6vw, 1.2rem);
    color: var(--text-primary);
    margin: 0 0 .5rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .hero-desc {
    font-size: .92rem;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0 auto;
    max-width: 46ch;
  }
  ```
- **MIRROR**: `COMPONENT_INLINE_CSS` — tokens only, no hard-coded colours.
- **GOTCHA**: The old rule had `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` on `.hero h1`, which truncated the tagline. Those three properties must be **gone**, not carried over.
- **GOTCHA**: `.hero-desc { display: none }` was the reason the description never showed. Ensure no other rule (including the `@media (max-width: 480px)` block at the end of the styles array) re-hides it.
- **VALIDATE**: `npx ng serve`, open `http://localhost:4200` — "Formulino" is a large heading, the tagline is fully visible and un-truncated, and the description paragraph renders below it. Toggle EN/IT and confirm both.

### Task 5: Add the in-app FAQ section
- **ACTION**: Add an FAQ block to the template in `frontend/src/app/app.component.ts`, placed **after** the step-1 `.step-card` closing `</div>` and before the STEP 2 comment
- **IMPLEMENT**:
  ```html
  <!-- ═══════════════ FAQ (step 1 only) ═══════════════ -->
  <section class="faq" *ngIf="currentStep === 'step1'">
    <h2 class="faq-title">{{ i18n.t('faqTitle') }}</h2>
    <details class="faq-item" *ngFor="let n of faqIndexes">
      <summary>{{ i18n.t('faqQ' + n) }}</summary>
      <p>{{ i18n.t('faqA' + n) }}</p>
    </details>
  </section>
  ```
  and on the class, next to the other public fields (near line 1041):
  ```typescript
  readonly faqIndexes = [1, 2, 3, 4, 5];
  ```
  CSS, appended to the styles array before the `@media` block:
  ```css
  .faq {
    margin-top: 2rem;
  }

  .faq-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 .6rem;
  }

  .faq-item {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    padding: .6rem .85rem;
    margin-bottom: .45rem;
  }

  .faq-item summary {
    cursor: pointer;
    font-size: .87rem;
    font-weight: 600;
    color: var(--text-primary);
    list-style: none;
  }

  .faq-item summary::-webkit-details-marker { display: none; }

  .faq-item summary::before {
    content: '▸';
    color: var(--accent);
    margin-right: .5rem;
    display: inline-block;
    transition: transform 150ms;
  }

  .faq-item[open] summary::before {
    transform: rotate(90deg);
  }

  .faq-item p {
    margin: .5rem 0 .15rem;
    font-size: .85rem;
    line-height: 1.6;
    color: var(--text-secondary);
  }
  ```
- **MIRROR**: The `<details>` + `summary` pattern already used for the consent block at `app.component.ts:255` (`.consent-details`).
- **GOTCHA**: `i18n.t()` is called with a computed key (`'faqQ' + n`). Confirm `t()`'s signature accepts a plain `string` — if it is typed as a union of literal keys, either widen it or replace `faqIndexes` with an explicit array of key pairs. Check `i18n.service.ts` before writing the template.
- **GOTCHA**: The FAQ must render **only** on step 1 (`*ngIf`), otherwise it appears under the JSON textarea and the Google-consent step.
- **VALIDATE**: On step 1 the five questions render and expand/collapse; advancing to step 2 makes the section disappear.

### Task 6: Restore the wizard step after the OAuth round-trip
- **ACTION**: Edit `create()` and `ngOnInit()` in `frontend/src/app/app.component.ts`
- **IMPLEMENT**: In `create()` (lines 1096-1101), persist the step alongside the payload:
  ```typescript
  const token = sessionStorage.getItem('access_token');
  if (!token) {
    sessionStorage.setItem('pending_dsl', JSON.stringify(payload));
    sessionStorage.setItem('pending_step', this.currentStep);
    window.location.href = `${environment.apiBaseUrl}/auth/google/login`;
    return;
  }
  ```
  In `ngOnInit()` (lines 1077-1085), restore it:
  ```typescript
  const pending = sessionStorage.getItem('pending_dsl');
  if (pending) {
    const pendingStep = sessionStorage.getItem('pending_step') as WizardStep | null;
    this.dslJson = pending;
    sessionStorage.removeItem('pending_dsl');
    sessionStorage.removeItem('pending_step');
    // Restore where the user actually was. Fall back to step3 for payloads
    // stored by an older build that did not write pending_step.
    this.currentStep =
      pendingStep && STEP_ORDER.includes(pendingStep) && pendingStep !== 'done'
        ? pendingStep
        : 'step3';
    this.validate();
  }
  ```
- **MIRROR**: The existing `sessionStorage` get/remove pairing already in `ngOnInit`.
- **GOTCHA**: Per the user's explicit decision, do **NOT** auto-fire `create()` after the restore. The user returns to step 4 and presses "Genera form" themselves.
- **GOTCHA**: `validate()` is what repopulates `this.editableForm`, and it is async. Landing on `step3b` would briefly render nothing because that card is `*ngIf="currentStep === 'step3b' && editableForm"`; landing on `step4` is unaffected since it does not depend on `editableForm`. Do not "fix" this by making the restore synchronous.
- **GOTCHA**: Validate `pendingStep` against `STEP_ORDER` before assigning — it is attacker-controllable via devtools and an unrecognised value would render a blank page.
- **VALIDATE**: In devtools, `sessionStorage.removeItem('access_token')`, walk to step 4, click "Genera form", complete Google sign-in — the app must come back **on step 4** with the JSON intact.

### Task 7: Clear a stale access token on 401
- **ACTION**: Edit the `create()` error handler in `frontend/src/app/app.component.ts` (lines 1110-1113)
- **IMPLEMENT**:
  ```typescript
  error: (err) => {
    this.state = 'error';
    // A Google access token lives ~1h and is never refreshed. Once expired,
    // the stored token would be replayed forever — drop it so the next click
    // starts a fresh sign-in instead of failing identically.
    if (err?.status === 401) {
      sessionStorage.removeItem('access_token');
      this.serverError = this.i18n.t('sessionExpired');
      return;
    }
    this.serverError = err?.error?.message ?? err?.message ?? 'Form creation failed';
  },
  ```
  Add `sessionExpired` to both i18n blocks:
  - `it`: `'La sessione Google è scaduta. Clicca di nuovo "Genera form" per accedere.'`
  - `en`: `'Your Google session expired. Click "Generate form" again to sign in.'`
- **MIRROR**: `I18N_KEY_PAIRING`; the existing `serverError` display at `app.component.ts:268-270`.
- **GOTCHA**: `HttpErrorResponse` exposes the code as `err.status`, not `err.error.status`. A 403 is a *scope/consent* problem, not an expiry — do not clear the token on 403, the message would be misleading.
- **GOTCHA**: `AllExceptionsFilter` (`backend/src/common/all-exceptions.filter.ts:43-55`) maps Google API failures to **502**, not 401 — so an expired token rejected by Google surfaces as 502 with a `Google API error: …` message, while a missing/malformed header is the 401 from `forms.controller.ts:111`. Verify empirically which status an expired token actually produces and extend the condition if it is 502 with an auth-shaped message.
- **VALIDATE**: `sessionStorage.setItem('access_token', 'invalid')`, then click "Genera form" — a friendly expiry message appears and `sessionStorage.access_token` is gone; the next click starts a fresh OAuth flow.

### Task 8: Regression tests
- **ACTION**: Extend `frontend/src/app/app.component.spec.ts`
- **IMPLEMENT**: Three tests:
  1. `restores the wizard on the persisted step after OAuth` — seed `sessionStorage` with `pending_dsl` + `pending_step: 'step4'`, run `ngOnInit()`, assert `currentStep === 'step4'` and both keys are cleared.
  2. `falls back to step3 when pending_step is absent or invalid` — seed only `pending_dsl` (and separately a `pending_step` of `'bogus'`), assert `currentStep === 'step3'`.
  3. `clears the stored token on a 401 from create` — stub `FormsService.createForm` to return `throwError(() => ({ status: 401 }))`, call `create()`, assert `sessionStorage.getItem('access_token')` is `null`.
- **MIRROR**: The existing spec's setup style and the hand-written mocks under `frontend/__mocks__/@angular/`.
- **GOTCHA**: Read `frontend/src/app/app.component.spec.ts` and `frontend/jest.config.cjs` first — this project uses **manual mocks** of `@angular/core`, `@angular/forms`, `@angular/common` and `@angular/router` rather than `TestBed`. Match that; do not introduce `TestBed`.
- **GOTCHA**: `sessionStorage` must be reset in `beforeEach`, or test 2 inherits test 1's keys.
- **VALIDATE**: `cd frontend && npm test` — all green.

---

## Testing Strategy

### Unit Tests

| Test | Input | Expected Output | Edge Case? |
|---|---|---|---|
| step restored from `pending_step` | `pending_dsl` + `pending_step='step4'` | `currentStep === 'step4'`, both keys cleared | No |
| legacy payload without `pending_step` | `pending_dsl` only | `currentStep === 'step3'` | Yes |
| tampered `pending_step` | `pending_step='bogus'` | `currentStep === 'step3'` | Yes |
| `pending_step='done'` rejected | `pending_step='done'` | `currentStep === 'step3'` | Yes |
| 401 clears token | `createForm` throws `{status:401}` | `access_token` removed, expiry message shown | No |
| 403 does NOT clear token | `createForm` throws `{status:403}` | token retained, generic error shown | Yes |
| both locales resolve every key | `t('faqQ1')`…`t('faqA5')` in it + en | non-empty, never the raw key | No |

### Manual / Build Checks
- [ ] `dist/frontend/browser/` contains `main-<hash>.js` and `styles-<hash>.css`
- [ ] `curl -sI /` returns `Cache-Control: no-cache`
- [ ] `curl -sI /main-<hash>.js` returns `immutable`
- [ ] `curl -sI /assets/ginkgo.png` does NOT return `immutable`
- [ ] Stepper renders horizontally with circular numbered dots after a hard reload
- [ ] Hero shows name + tagline + description, untruncated, IT and EN
- [ ] FAQ renders on step 1 only and matches the JSON-LD copy verbatim

### Edge Cases Checklist
- [x] User arrives with a stale cached `styles.css` — Task 1+2 force a new URL, so the old file can never be served again
- [x] User mid-flow when a deploy lands — `index.html` is no-cache, so the next navigation picks up the new hashed assets
- [x] `sessionStorage` unavailable (Safari private mode) — wrap the new `pending_step` read/write the same way the existing `pending_dsl` access is; if the existing code is unguarded, leave that as-is rather than expanding scope
- [x] User cancels the Google consent screen — `pending_dsl`/`pending_step` stay in `sessionStorage`; the next load restores step 4, which is correct

---

## Validation Commands

### Type Check
```bash
cd /home/ginkgo/t/formulino/frontend && npx tsc --noEmit
```
EXPECT: Zero type errors

### Lint
```bash
cd /home/ginkgo/t/formulino && npm run lint -w frontend
```
EXPECT: Clean

### Unit Tests
```bash
cd /home/ginkgo/t/formulino && npm test -w frontend
```
EXPECT: All pass, including the new regression tests

### Production Build + Hashing Proof
```bash
cd /home/ginkgo/t/formulino/frontend && npx ng build --configuration production && ls dist/frontend/browser/
```
EXPECT: `main-<hash>.js`, `styles-<hash>.css`, `polyfills-<hash>.js` — NOT bare `main.js` / `styles.css`

### nginx Config Parse
```bash
cd /home/ginkgo/t/formulino && PORT=8080 BACKEND_PORT=3000 envsubst '${PORT} ${BACKEND_PORT}' \
  < deploy/nginx/default.conf.template > /tmp/formulino-nginx-test.conf && \
  echo 'events{} http{ include /tmp/formulino-nginx-test.conf; }' > /tmp/formulino-nginx-main.conf && \
  nginx -t -c /tmp/formulino-nginx-main.conf
```
EXPECT: `syntax is ok` / `test is successful`

---

## Acceptance Criteria
- [ ] Task 1: `outputHashing: "all"` set on the production configuration only
- [ ] Task 2: `index.html` no-cache; `immutable` applies only to hash-bearing `.js`/`.css`
- [ ] Task 3: `appName`, `faqTitle`, `faqQ1-5`, `faqA1-5`, `sessionExpired` present in both `it` and `en`
- [ ] Task 4: hero shows name, tagline and description; no `display:none`, no ellipsis truncation
- [ ] Task 5: FAQ renders on step 1 only, copy matches the JSON-LD verbatim
- [ ] Task 6: OAuth return lands on step 4 with the JSON intact; no auto-create
- [ ] Task 7: a 401 clears the stored token and shows a localised expiry message
- [ ] Task 8: regression tests added and green
- [ ] `tsc --noEmit`, lint and the full frontend suite all pass
- [ ] Production build emits hashed filenames

## Completion Checklist
- [ ] No backend file modified
- [ ] `frontend/src/styles.css` stepper rules unchanged
- [ ] Crawler fallback in `index.html` still present
- [ ] Rendered FAQ text is byte-identical to the `FAQPage` JSON-LD answers
- [ ] No new npm dependency added

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The nginx `map` regex also matches a legitimately unhashed filename containing a dash | Low | An asset cached 1y under a stable name — the original bug, narrower | Require 8+ alphanumerics after the final dash; verify against the real `ls dist/frontend/browser/` output |
| `map` placed in the wrong nginx context → container fails to boot | Medium | Deploy outage | The `nginx -t` validation command above must pass before merge; the task lists an `if`-based fallback |
| Enabling hashing breaks a hard-coded asset path somewhere | Low | 404 on an asset | Angular rewrites `index.html` automatically; `assets/*` are copied unhashed and keep their paths. Grep for `main.js`/`styles.css` string literals before merging |
| An expired token surfaces as 502 (via `AllExceptionsFilter`) rather than 401, so Task 7 never fires | Medium | Expiry loop persists | Task 7 calls for empirically confirming the real status code and extending the condition |
| FAQ copy drifts from the JSON-LD | Medium | Search Console structured-data warning | Copy verbatim from `index.html:142-151`; listed in the completion checklist |

## Notes

**Why the stepper specifically, and nothing else?** Every other style in the app is component-inline CSS compiled into `main.js`. `.wizard-progress` / `.wp-*` are the only visual rules that live in the global `styles.css`. When a browser holds a year-old `immutable` copy of `styles.css` from before commit `57bc942` (which introduced the wizard), it still gets the `:root` dark-theme custom properties — which is why the page stays dark with light text — but none of the `.wp-*` rules. The stepper `<div>`s then fall back to block layout: a bare vertical list of words with a raw `✓`. That matches the report exactly, and it explains why local dev is unaffected: `ng serve` sends no `immutable` header.

**Deploy note for the operator.** Users already holding the poisoned `styles.css` are pinned to it for up to a year *for that URL*. Task 1 sidesteps this entirely by changing the URL — `styles-<hash>.css` has never been requested before, so there is nothing cached to serve. No cache purge or user-side hard reload is needed after this ships.

**Left for a follow-up.** `backend/src/auth.service.ts:57` keeps OAuth `state` in a process-local `Map` with a 5-minute TTL. Any backend restart invalidates every in-flight login (`?error=invalid_state`, surfaced to the user as a bare "Authentication failed"), and it breaks outright if `numReplicas` in `railway.toml` ever exceeds 1. Deliberately out of scope here.
