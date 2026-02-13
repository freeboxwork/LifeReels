# LifeReels

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
- session persistence and auth state listener
- `signOut`

## Notes

- If email confirmation is enabled in Supabase Auth, new users must confirm email before login.
- For local Supabase, stop services with:

```bash
npx supabase stop
```
