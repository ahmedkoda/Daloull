# Dalloul Tours — Website MVP

Arabic-first (RTL), brand-matched website for **Dalloul Tours**: service
presentation + a single document-intake form. Submitted documents are stored
server-side and are retrievable only through a password-protected admin area.

**In scope (MVP):** service pages, one default intake form (personal fields +
file uploads), admin retrieval.
**Out of scope (by decision, 2026-06-03):** online payment, live flight booking,
per-service document checklists (uses one default form for now).

## Run locally

```bash
cd website
cp .env.example .env        # then edit ADMIN_USER / ADMIN_PASS
npm install
npm start
```

- Public site: http://localhost:3000
- Admin (submissions): http://localhost:3000/admin  (HTTP Basic auth from `.env`)
- Admin (edit site text): http://localhost:3000/admin/content — edit any section's text in Arabic/English/Chinese; saved edits overlay the built-in defaults and show on the site immediately. Stored in `data/content.json` (only changed keys).

## Structure

```
website/
  server.js            Express server: static site, /apply upload, /admin
  public/              Static Arabic RTL pages + css/js/img
  uploads/             Submitted documents (git-ignored, private — admin only)
  data/submissions.json  Submission metadata (git-ignored)
```

## Notes / follow-ups (from the Sara+Ziad review)

- **Eligibility honesty:** the site never promises eligibility; copy says
  "we confirm your case before any payment." Keep this.
- **Document protection:** uploads live outside the public folder and are
  served only via the authenticated admin route. Still TODO for production:
  encryption at rest, retention/deletion policy, HTTPS, and a stronger admin
  auth than HTTP Basic.
- **Per-service checklists:** replace the single default form with per-service
  document checklists once operations supplies the real required-document lists
  (see `.ziad/references/workflows/` — to be created).
- **Brand:** logo/colors are approximated from the Facebook cover; drop in the
  real brand assets in `public/img/` and `public/css/styles.css`.
```
