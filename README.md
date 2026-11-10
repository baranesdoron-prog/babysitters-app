# הבייביסיטריות שלנו — Babysitters app

Family app for managing our babysitters: roster, availability, shift
scheduling, what to prepare / leave for each shift, and payments.
Built on the same stack and layout as barburg.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Backend: Supabase (Postgres, Row Level Security, Supabase Auth — username + password, passkeys)
- Hosting: Netlify (frontend), Supabase (backend)

## Access model

- **Parent** — full access to everything.
- **Babysitter** — sees only her own profile, the shifts she is on or was asked
  about, and their items. The girls' details and contacts are visible to her
  only around a confirmed shift. She never sees other babysitters' rates.
  She answers a request with `respond_to_request()` and ticks items with
  `set_item_done()`; she has no direct write access to shifts.

All of this is enforced with Row Level Security in Postgres
(`supabase/migrations/`), not in the frontend.

## First-time setup

1. **Install dependencies**

   ```
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com).
   Note the project ref, database password, project URL and anon key
   (Project Settings → API).

3. **Link and push the schema**

   ```
   npm run db:link -- --project-ref <your-project-ref>
   npm run db:push
   ```

4. **Environment variables**

   ```
   cp .env.example .env.local
   ```

   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. On Netlify, set
   the same two variables under Site configuration → Environment variables.

5. **Auth redirect URLs.** In Supabase → Authentication → URL Configuration,
   set the Site URL to the Netlify address (default in `supabase/config.toml`:
   `https://babysitters-app.netlify.app`) and add `http://localhost:5173` for
   local development.

6. **Run the app**

   ```
   npm run dev
   ```

7. **Bootstrap the parents.** Give each parent a username and password with
   the SQL in [DEPLOY.md](DEPLOY.md) ("First run").

8. **Babysitters and the girls.** A parent adds her in the app, then sets her
   username and password in the "כניסה לאפליקציה" section of her profile.

## Deploying

See [DEPLOY.md](DEPLOY.md) — GitHub, Supabase (migrations, edge function, auth
URLs, storage) and Netlify, step by step. To let the VS Code AI run it, paste
[docs/deploy-prompt.md](docs/deploy-prompt.md) into the chat.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run lint` — run oxlint
- `npm run db:link` — link this repo to a Supabase project
- `npm run db:push` — push local migrations to the linked Supabase project

## Project status

All screens are built: calendar and shifts, babysitters, the girls, payments,
settings, the babysitter's shifts and availability, and the child's screen.
Sign-in is username + password with optional passkeys (fingerprint / Face ID).
