# Developer Guide

## Stack

| Part | Tech |
|---|---|
| Website (`/web`) | React 18 + Vite + Tailwind, Vercel serverless functions in `web/api/` |
| Email | Nodemailer via Gmail SMTP (`zbcvitc@gmail.com`), sent **only from the server** |
| Scanner (`/scanner`) | React Native + Expo SDK 57, `expo-camera`, Supabase Auth (Google or email/password) |
| Database (`/supabase`) | Supabase Postgres, Row Level Security, Realtime |

## Security rules (please keep these)

- **Never commit secrets.** No passwords, app passwords or service-role keys in code, docs or `.env.example`.
  Real values live only in Vercel env vars and local `.env` files (gitignored).
- **Never prefix server secrets with `VITE_` or `EXPO_PUBLIC_`** — those are bundled into the public app.
- **Never "fix" a permission error by granting `anon` access or adding `using (true)` policies.**
  The public key must stay unable to read or change tables. Add the user to `public.staff` instead.
- The app UI is not the security boundary — RLS in `supabase/schema.sql` is.

## 1. Database setup

Run the whole of `supabase/schema.sql` in **Supabase Dashboard → SQL Editor**.
It is idempotent: safe on a new project and safe to re-run on the existing one.

### Set the event details (do this for every event)
**Table Editor → `event_config`** (row id 1): `event_title`, `event_date`, `venue`, `max_seats`, `registration_open`.
The website and the pass email read these automatically.

### Add volunteers / admins
Approve people **by email** in the SQL Editor (works before they ever sign in):
```sql
insert into public.staff_emails (email, role) values ('someone@gmail.com', 'volunteer');  -- or 'admin'
-- remove: delete from public.staff_emails where email = 'someone@gmail.com';
```
They can then sign in to the scanner app with **Sign in with Google** (if that Google account uses the same email),
or with email + password if you create them under **Authentication → Users → Add user** (tick *Auto Confirm User*).
Only confirmed emails count, so nobody can claim an approved address without owning it.

### Google sign-in (scanner app)
1. Google Cloud Console → APIs & Services → Credentials → your **Web application** OAuth client →
   Authorised redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Providers → **Google** → enable, paste Client ID and Client Secret.
3. Supabase → Authentication → URL Configuration → **Redirect URLs**, add:
   - `com.zbcvitc.entryscanner://**` (installed APK)
   - `exp://**` (testing in Expo Go)

### Reset after an event
```sql
truncate table public.registrations;
truncate table public.scan_logs;
```

## 2. Website (`/web`)

```bash
cd web
cp .env.example .env     # fill in real values
npm install
npm run dev              # http://localhost:3000 — /api/* routes run locally too
npm run lint
npm run build
```

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | Project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | Public anon key (safe to expose — RLS protects data) |
| `VITE_TURNSTILE_SITE_KEY` | browser | Optional Cloudflare Turnstile |
| `SUPABASE_URL` | server | Same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **Secret.** Dashboard → Settings → API |
| `GMAIL_USER` | server | `zbcvitc@gmail.com` |
| `GMAIL_APP_PASS` | server | **Secret.** Google Account → Security → App passwords |
| `TURNSTILE_SECRET_KEY` | server | Optional, pairs with the site key |
| `SMTP_HOST`, `SMTP_PORT` | server | Optional: send through another SMTP server (e.g. local Mailpit for testing) |

### Deploy to Vercel
1. Vercel → Add New → Project → import **`Zero-Bugs-Club/event-reg`**.
2. Framework: **Vite**, Root Directory: **`web`**, Build: `npm run build`, Output: `dist`.
3. Add every variable from the table above (real values).
4. Deploy. Security headers come from `web/vercel.json`.

## 3. Scanner app (`/scanner`)

```bash
cd scanner
cp .env.example .env     # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npx expo start --tunnel  # scan the QR with Expo Go (Play Store version, SDK 57)
```

The `android/` folder is **not** committed — EAS generates it from `app.json` on every build
(change permissions, icons and names in `app.json`).

### Build the APK for volunteers
```bash
npx expo login
npx eas build -p android --profile preview
```
EAS manages the signing key. Set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
as EAS environment variables (or in `scanner/.env` before building).
