# Deploying the babysitters app

Three places: **GitHub** (code) → **Supabase** (database, logins, photos,
functions) → **Netlify** (the website, rebuilt on every push to `main`).
Commands are for the VS Code terminal on Windows (PowerShell), run from the
project folder `C:\Users\baran\projects\babysitters-app`.

Current Supabase project ref: `rpildkvkpdvbcisgxcpd` (Seoul). If you create a
new project (e.g. Frankfurt), replace the ref everywhere below and in
`.env.local`.

---

## 0. Check before you start

```powershell
node --version          # must be 20.19+ or 22+ (Vite 8)
npm install
npm run build           # must finish without errors
npm run lint
```

Stop and fix anything that fails before deploying.

## 1. GitHub

The repo `baranesdoron-prog/babysitters-app` already exists.

```powershell
git status                       # "not a git repository"? then:
git init
git branch -M main
git remote add origin https://github.com/baranesdoron-prog/babysitters-app.git
git add .
git commit -m "Babysitters app: foundation, payments, photos, child accounts"
git push -u origin main
```

If the push is rejected because the repo already has a commit (e.g. a README):

```powershell
git pull origin main --allow-unrelated-histories --no-edit
git push -u origin main
```

Check `.env.local` was **not** pushed (it's in `.gitignore`).

## 2. Supabase

### 2a. Sign in to the CLI (once per computer)

```powershell
npx supabase login               # opens the browser; approve
npx supabase link --project-ref rpildkvkpdvbcisgxcpd
```

`link` asks for the database password chosen when the project was created.

### 2b. Database migrations

```powershell
npx supabase migration list      # what's applied vs. local
npx supabase db push             # applies 0002 and 0003 (0001 is already in)
```

> If the Supabase ↔ GitHub integration is set to deploy migrations on push to
> `main`, step 1 may have applied them already — `migration list` will show it.
> Don't push twice; `db push` only applies what's missing.

### 2c. Edge function (child logins)

```powershell
npx supabase functions deploy create-child-login --project-ref rpildkvkpdvbcisgxcpd
```

### 2d. Auth settings (Dashboard → Authentication → URL Configuration)

- **Site URL:** your Netlify address (from step 3), e.g. `https://babysitters-app.netlify.app`
- **Redirect URLs:** add both
  - `https://babysitters-app.netlify.app/**`
  - `http://localhost:5173/**`

Also in Authentication → Providers → Email: keep **Email** enabled (magic link
for parents and babysitters, password for the girls' logins).

> The built-in email sender is limited to a few emails per hour. Fine for the
> family; if sign-in links stop arriving, set up custom SMTP
> (Authentication → Emails → SMTP Settings).

### 2e. Storage

Migration 0003 creates the private `photos` bucket. Confirm it in
Dashboard → Storage: bucket `photos`, **Public: off**.

## 3. Netlify

1. app.netlify.com → **Add new site → Import an existing project → GitHub** →
   pick `baranesdoron-prog/babysitters-app`.
2. Build settings come from `netlify.toml` (build `npm run build`, publish
   `dist`) — leave them.
3. **Site configuration → Environment variables** — add:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://rpildkvkpdvbcisgxcpd.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the **publishable** key (Supabase → Connect → React → Vite) |
   | `NODE_VERSION` | `22` |

4. **Site configuration → Site details → Change site name** →
   `babysitters-app` (or whatever is free). If it differs, update the Site URL
   and Redirect URLs in step 2d **and** `site_url` in `supabase/config.toml`.
5. **Deploys → Trigger deploy → Deploy site.** Every later push to `main`
   deploys automatically.

## 4. First run (one time)

1. Open the Netlify address on your phone, enter your email, open the link.
   You'll land on the "waiting" screen.
2. Supabase → **SQL Editor**:

   ```sql
   update app_users set role = 'parent' where email = 'YOUR@EMAIL';
   ```

   Repeat for the second parent. Refresh the app — you're in.
3. On the phone: Share → **Add to Home Screen**, so it opens like an app.

## 5. After every change

```powershell
npm run build
git add .
git commit -m "what changed"
git push                          # Netlify redeploys by itself
npx supabase db push              # only if you added a migration
npx supabase functions deploy <name>   # only if you changed a function
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| White page, console says "Missing VITE_SUPABASE_URL" | Env vars missing on Netlify → add them, redeploy |
| Sign-in link opens localhost / wrong site | Site URL / Redirect URLs in step 2d |
| Sign-in email never arrives | Email rate limit → wait an hour or set up SMTP |
| Signed in but stuck on "waiting" | Step 4.2 (set your role) |
| Netlify build fails on Node | `NODE_VERSION = 22` env var |
| Page refresh gives 404 | `netlify.toml` redirect missing — it's in the repo, check it was pushed |
