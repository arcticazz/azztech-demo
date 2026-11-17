# AZZTECH engineer workflow demo

Standalone, phone-first clickable prototype of the proposed AZZTECH engineer job flow.

**Live:** https://arcticazz.github.io/azztech-demo/

- Fictional data only (Demo Foods Ltd, Unit 4 Cold Store; invented engineer, assets and serials).
- No backend. No connection to Supabase or the live AZZTECH app. Nothing is saved or sent; state lives in memory and resets on reload.
- `noindex` meta tags and `robots.txt` disallow all.

## Scenarios

| | Job | What it shows |
|---|---|---|
| A | JOB-1042 · R32 condensing unit PPM | Auto-filled job/site/engineer/asset, A2L risk assessment, readings with ranges, camera photo, failed check → follow-up JOB-1043, reuse RA signature, customer not present, report |
| B | JOB-2117 · R290 freezer cabinet reactive repair | Claim + flammable competence warning, A3/ATEX hazards, hot-works tag adds hydrocarbon brazing controls, refrigerant recovery log, mock AI voice note, failed check → follow-up JOB-2118, customer and engineer finger signatures, report |

Flow: Job → Safety → Work → Results → Close → service report (print / save as PDF).

## Run locally

```bash
npm install
npm run dev          # http://127.0.0.1:5173/azztech-demo/
npm run build        # dist/ (also writes 404.html)
npm run preview      # http://127.0.0.1:4173/azztech-demo/
node scripts/verify.mjs   # headless end-to-end test at iPhone size, writes shots/
```

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/pages.yml`.
