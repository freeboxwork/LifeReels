# Life Reels

React(TypeScript) + Supabase(Auth) sample for sign-up/login.

## 1) Install

```bash
npm install
```

If you see npm cache permission errors on Windows PowerShell, run:

```bash
npm install --cache .npm-cache
```

## 2) Supabase CLI setup

Supabase CLI flow (official): https://supabase.com/docs/reference/cli/introduction

```bash
npx supabase init
npx supabase start
```

Prerequisite for local stack:
- Docker Desktop running

The repository already includes `supabase/config.toml` initialized by CLI.

If you already have a hosted Supabase project, open project settings and copy:
- Project URL
- anon public key

## 3) Environment variables

Create `.env` from `.env.example`.

```bash
cp .env.example .env
```

Windows `cmd`:

```bat
copy .env.example .env
```

Set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_OPENAI_API_KEY=YOUR_OPENAI_API_KEY
VITE_OPENAI_MODEL=gpt-4.1-mini
```

For local Supabase started by CLI:
- `VITE_SUPABASE_URL=http://127.0.0.1:54321`
- `VITE_SUPABASE_ANON_KEY` from `npx supabase status`

## 4) Run app

```bash
npm run dev
```

## Implemented auth features

- `signUp` (email/password)
- `signInWithPassword` (email/password)
- forgot password (email reset link)
- `signInWithOAuth` (Google)
- session persistence and auth state listener
- `signOut`
- `My Page`: user info, profile update (`display_name`)
- password change (`auth.updateUser`)
- password reset email (`resetPasswordForEmail`)
- account deletion via Supabase Edge Function (`delete-user`)

## Diary Scenario Prototype (No login required)

- Enter diary text in `Diary to Scenario (Prototype)` section.
- Click `완성` to call OpenAI API and generate a `reels_script_v2` JSON.
- Generated shots are rendered in the UI immediately.
- Then click `Generate Image + Narration` to generate per-shot assets:
  - image: `gpt-image-1-mini` (portrait `1024x1536`, `quality=low`)
  - narration: `tts-1` with voice `shimmer` (MP3)

### reels_script_v1 / v2 strategy

- `reels_script_v1` type is kept for backward compatibility.
- New generation target is `reels_script_v2` only.
- If old `v1` data is loaded, app upgrades it to `v2` with default `narration_direction`.

### reels_script_v2 validation

- JSON Schema validation with `additionalProperties=false`
- Extra app-level validation: `sum(shots.duration_seconds) === 15`
- Errors returned for:
  - missing `narration_direction`
  - invalid narration label taxonomy
  - out-of-range values (e.g. `intensity`)

Note:
- This fast prototype calls OpenAI directly from frontend using `VITE_OPENAI_API_KEY`.
- Do not use this pattern for production without a secure backend proxy.
- If you see `401 invalid_api_key`, your key is wrong or malformed.
  Use a real OpenAI API key from `https://platform.openai.com/api-keys` (typically starts with `sk-`), update Cloudflare Pages variables, then redeploy.
- Test command: `npm run test`

## Google login setup

Official guide: https://supabase.com/docs/guides/auth/social-login/auth-google

1. In Google Cloud Console, create OAuth client credentials (Web application).
2. In Supabase Dashboard -> `Authentication` -> `Providers` -> `Google`, enable provider and set:
   - Google client ID
   - Google client secret
3. Add your app URL to Supabase `Authentication` -> `URL Configuration`:
   - local: `http://localhost:5173`
   - production: your Cloudflare Pages URL
4. In Google OAuth allowed redirect URIs, add Supabase callback URL:
   - `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`

## Notes

- If email confirmation is enabled in Supabase Auth, new users must confirm email before login.
- Account deletion requires deploying the included Supabase Edge Function.
- For hosted Supabase project, run:

```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY>
npx supabase functions deploy delete-user
```

- `SUPABASE_SERVICE_ROLE_KEY` is sensitive. Never expose it in frontend or commit it.
- For local Supabase, stop services with:

```bash
npx supabase stop
```
