# AGENTS.md — Babysitters app (הבייביסיטריות שלנו)

Guidelines for anyone writing code here — people and AI assistants (Copilot,
Codex, Claude). Read this before changing anything. When this file and the code
disagree, ask; when this file and a quick guess disagree, follow this file.

- **Spec (Hebrew, source of truth for behaviour):** the "אפיון אפליקציית ניהול
  בייביסיטריות" doc — decisions table and open questions.
- **Design (source of truth for look):** the "מסכי אפליקציית הבייביסיטריות"
  canvas — 7 phone screens. Build screens to match it.

---

## 1. Stack and commands

React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (new-york), lucide-react,
React Router 7, Supabase (Postgres + RLS + Auth). Hosted on Netlify. Same layout
as the barburg project.

```
npm run dev       # local app at http://localhost:5173
npm run build     # type-check + production build — must pass before every commit
npm run lint      # oxlint — must pass
npm run db:push   # apply new migrations to the linked Supabase project
```

Env: `.env.local` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
(the publishable key). Never commit it.

## 2. Project layout

```
src/
  App.tsx              routes + role gate (parent / babysitter / pending)
  components/          app components (AppShell, ...)
  components/ui/       shadcn primitives — restyle via tokens, don't fork casually
  hooks/               data + session hooks (useAppUser, ...)
  lib/
    supabase.ts        the one Supabase client
    types.ts           row types mirroring the DB
    labels.ts          ALL Hebrew labels for enums (statuses, rate types, ...)
    utils.ts           cn(), date/time formatters (Asia/Jerusalem)
  pages/               one file per screen
supabase/migrations/   numbered SQL migrations — the schema and all permissions
```

## 3. Rules for data and security

1. **Permissions live in Postgres (RLS), never only in React.** Hiding a button is
   UX, not security. Every new table gets RLS enabled and a parent policy; add a
   babysitter policy only if she must see it.
2. **Babysitters write through functions only:** `respond_to_request()`,
   `set_item_done()`, availability rows. Parents record payments with
   `record_payment()`. Don't add direct UPDATE policies for babysitters.
3. A babysitter never sees other babysitters, their rates, or the girls' details
   outside a confirmed shift (`has_active_shift()`).
4. **Roles:** `parent` (full access), `babysitter` (her own shifts), `child` (one
   of the girls). A child has **no table access** except her own `children` row;
   her screen reads only `child_upcoming_shifts()` (confirmed shifts, next 7 days:
   who, when, phone, photo, pickup place/time). Never widen this — the
   `babysitters` and `shifts` rows hold rates and family details.
5. **Child logins** are created only by a parent through the
   `create-child-login` edge function (username + password, no email; stored as
   `<username>@kids.babysitters.invalid`). The login screen offers a "כניסת
   ילדים" mode that turns the username into that address and calls
   `signInWithPassword`.
6. **Photos** live in the private Storage bucket `photos` at
   `parents/<user id>.jpg`, `babysitters/<id>.jpg`, `children/<id>.jpg`; the row's
   `photo_path` holds that path. Show them via `createSignedUrl` (short expiry),
   never public URLs. Resize to ~512px JPEG on the phone before upload. Who may
   read/write each folder is enforced by Storage policies (migration 0003).
7. **Migrations:** never edit a migration that was already pushed. Add a new file
   `0000000000000N_short_name.sql`. Test it against a scratch database before
   pushing.
8. Query from page-level hooks/components with the shared `supabase` client.
   Always handle `error` and show a Hebrew message; never leave a blank screen.
9. Times are stored as `timestamptz`; display in `Asia/Jerusalem` with the
   formatters in `lib/utils.ts`.

## 4. Domain rules (from the spec — keep them true)

- **Day / night:** night starts at `settings.night_start` (default 20:00,
  editable). A shift crossing it is billed as a **day part + night part**, each
  at that babysitter's rate for it, unless the parent ticks **"merge into one"**.
- **Rates:** day and night each are either `hourly` or `per_shift`, set per
  babysitter. `computed_amount` = day part + night part; the parent may override
  with `actual_amount`. Homework help is never paid extra.
- **Pickup:** set per shift (`parent` / `babysitter`). If the babysitter picks up
  the youngest and `has_child_seat` is false → show the warning and auto-add the
  item "להשאיר כיסא לאוטו". Babysitters never drive to activities.
- **Overnight shift:** auto-add morning tasks (lunchbox, take to kindergarten)
  from `item_templates` where `auto_on = 'night'`, with the kindergarten hours.
- **Requests:** one babysitter at a time, in the order the parent picks. Each
  shift has a wait time (default 120 min) and a reminder before it ends (default
  15 min). At the reminder the parent chooses: ping again or move to the next.
- **Candidate list:** only babysitters available in those hours, and only those
  with `night_ok` when the shift has a night part.
- **Payments:** one payment may cover several unpaid shifts of the same
  babysitter. When paying, always look up her other unpaid shifts and offer to
  combine them (all ticked by default).
- **Bit / PayBox:** there is no API or redirect back for personal payments. The
  button copies the babysitter's phone and the amount to the clipboard, then
  opens the app. When the user returns (`visibilitychange` → visible, only if
  they left from this payment flow) show the confirm sheet: "כן, לסמן ששולם" /
  "עוד לא" / "שילמתי סכום אחר". Cash = mark as paid directly. Marking paid is
  always manual. Verify the app-opening links on a real phone before shipping.

## 5. Design system

The tokens live in `src/index.css` and become Tailwind classes. **Use the
classes, never raw hex values** in components.

### Colors

| Token (class) | Use |
|---|---|
| `bg-background` | app ground (#F5F6F8) |
| `bg-card` | every section / card (white) |
| `text-foreground` / `text-muted-foreground` | body text / secondary text |
| `text-subtle-foreground` | tertiary text, 15px+ only |
| `border-border`, `border-input` | dividers / input borders |
| `bg-primary` + `text-primary-foreground` | main action button, FAB, active step |
| `text-primary` | links, active nav item, text buttons ("+ פריט") |
| `bg-primary-soft` + `text-primary-strong` | icon tiles, call buttons, positive tags |
| `bg-day-soft` + `text-day-foreground`, `bg-day` | anything **day**: rate blocks, day part of a shift |
| `bg-night-soft` + `text-night-foreground`, `bg-night`, `bg-night-deep` | anything **night** |
| `bg-pending-soft` + `text-pending-foreground` | "ממתינה לתשובה", "לתשלום" |
| `bg-success-soft` + `text-success-foreground` | "מאושרת", "שולם" |
| `bg-warning-soft` + `text-warning-foreground` | heads-ups (car seat) |

**Day is always amber, night is always indigo** — rate blocks, the split bar in
the calendar, the hours split on the shift form, section top-borders
(`border-t-4 border-day` / `border-night`). Don't use these two hues for anything
else. Never use color alone to carry meaning: pair it with a word or icon.

### Typography

- Font: **Assistant** for everything; **Rubik** (`font-display`) only for page
  titles and big numbers (dates in the calendar, step numbers).
- Page title `font-display text-[26px] font-semibold` (sub-pages 22px).
  Section title `text-[17px] font-bold`. Body `text-[15px]`–`text-base`.
  Secondary `text-sm text-muted-foreground`. Tags/pills `text-xs`/`text-[13px]`.
- Minimum 12px anywhere; keep body at 15px+ (this is used on a phone, in a hurry).

### Shape and spacing

- Cards/sections: `rounded-xl` (16px), `bg-card`, `p-4`, no shadow, no border
  unless it carries state (pending = dashed amber, confirmed = teal tint).
- Inputs, buttons, segmented controls: `rounded-lg` (12px). Bottom sheet: top
  corners `rounded-t-2xl`. Pills: `rounded-full`.
- Page padding `px-4`; gap between sections `gap-3.5`; inside a card `gap-3`.
- Spacing on a 4px grid. No gradients, no drop shadows except the FAB and the
  bottom sheet.

### Components (reuse — don't reinvent)

- **AppShell:** header + content + fixed bottom nav. Parent tabs: יומן,
  בייביסיטריות, הבנות, תשלומים. Babysitter tabs: המשמרות שלי, הזמינות שלי.
  Active tab = `text-primary font-semibold`. The child has one screen ("מי איתי
  היום") and no bottom nav.
- **Avatar:** round photo; fallback = first letter on a tinted circle (teal for
  babysitters, indigo-soft for a second one, amber-soft for the girls). Sizes 40
  (lists), 48 (cards), 80 (forms, with a camera button to add/replace), 112 (the
  child's "who's coming" card).
- **Primary button:** full width, `h-[52px]–h-14`, `bg-primary`, 17px semibold,
  optional leading icon. One per screen.
- **Secondary button:** `border border-input bg-card`, same height family.
- **Text button:** `text-primary font-semibold`, no background ("+ הוספה").
- **Segmented control:** `bg-muted p-1 rounded-lg`, selected segment `bg-card`
  with a hairline shadow. Used for שבוע/חודש, לשעה/למשמרת, הורה/בייביסיטר.
- **Status pill:** `rounded-full px-2.5 py-0.5 text-xs font-semibold` with the
  status pair from the table above. Labels come from `lib/labels.ts`.
- **Tag:** like a pill, `text-[13px]`, `✓` prefix for a capability; warning
  colors for a missing one ("אין כיסא בטיחות").
- **Warning box:** `bg-warning-soft text-warning-foreground rounded-lg p-3` +
  triangle icon; one sentence saying what happened and what we did about it.
- **Bottom sheet:** for confirmations (payment confirm). Dimmed backdrop,
  drag handle, title as a question, primary action first.
- **List row:** min height 48px, divider `border-b border-muted` between rows.
- **Call button:** 44×44 `rounded-lg bg-primary-soft`, phone icon, `aria-label`
  "להתקשר ל…", `href="tel:…"`.

### Icons

lucide-react, `size-5` (20px) in content, `size-[22px]` in the nav, stroke 2.
Icon-only buttons always get `aria-label`. No emoji in the UI.

### RTL and Hebrew

- `<html lang="he" dir="rtl">`. Use **logical** utilities: `ms-/me-`, `ps-/pe-`,
  `start-/end-`, `text-start`. Never `ml-/mr-/pl-/pr-/left-/right-` for layout.
- "Back" chevron points **right** (`ChevronRight`); "forward/next" points left.
- Phone numbers and emails: wrap in `dir="ltr"`.
- Money: `₪435` (symbol first, no space), thousands with a comma. Time: 24h
  `15:30`. Dates: `27/10`, or `יום ג׳, 27 באוקטובר` in headers. Weekdays as
  `א׳ ב׳ ג׳ ד׳ ה׳ ו׳ ש׳`.
- Copy: short, warm, plain. Babysitters are addressed in feminine singular
  ("המשמרת שלך", "אני יכולה"); parents in plural/neutral ("שילמתם", "הוספנו").
  The child's screen speaks to her directly and simply ("נועה אוספת אותך"), big
  type, no money, no admin words.
  Kids are referred to as "הגדולה" / "הקטנה" or by name.
- All user-facing strings in Hebrew; enum labels only via `lib/labels.ts`.

### Mobile first

Design for 390px wide first; it must also work at 360px. Touch targets ≥ 44px.
Content never hides behind the bottom nav (`pb-24` on scrolling pages). No hover-
only interactions.

### Accessibility

Real `<button>`, `<a>`, `<label>`+`<input>` — never click handlers on divs.
Text contrast ≥ 4.5:1 (the tokens above pass on white). Dialogs/sheets get
`role="dialog"` and a labelled title.

## 6. Definition of done

- [ ] Matches the design canvas (layout, tokens, copy tone)
- [ ] Works at 360px and 390px, RTL correct
- [ ] Loading, empty and error states in Hebrew
- [ ] Permissions enforced by RLS / DB functions, tested as parent and babysitter
- [ ] `npm run build` and `npm run lint` pass
- [ ] New schema → new migration file, not an edit
