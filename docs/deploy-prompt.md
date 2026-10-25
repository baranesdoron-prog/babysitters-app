Paste this into the AI chat in VS Code (agent mode), with the
`babysitters-app` folder open:

---

Deploy this project by following DEPLOY.md step by step. Read AGENTS.md
first for context.

Rules:
- Run the commands yourself in the terminal, one step at a time, and show me
  the result of each.
- Stop and tell me before anything that needs me: browser sign-ins
  (`supabase login`), the database password, dashboard settings in Supabase or
  Netlify, and the SQL in step 4.
- If a command fails, explain why and propose a fix. Don't skip steps, don't
  use force-push, and don't change application code or existing migrations to
  make a step pass.
- Never print or commit the contents of `.env.local` or any key.
- At the end, give me a checklist of what was done and what is still mine to do.
