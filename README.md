# OE Dental Dashboard

Local-first dashboard for a dental clinic. Patient records, clinical files, photos, receipts, treatment charges, and payments stay on the clinic computer by default.

## Quick Start

```bash
pnpm install
pnpm db:init
pnpm dev
```

Open `http://127.0.0.1:3000`, create the first local admin account, and start importing patient folders.

## Local Data

- SQLite database: `data/app.db`
- Managed file vault: `data/vault/`
- Backups: `data/backups/`

The import wizard copies selected files into the managed vault and leaves the original folders untouched.

## Deployment

This version is intentionally local-first. Do not deploy it directly to Vercel for real clinic use:

- SQLite lives at `data/app.db`.
- Patient files are copied into `data/vault/`.
- Vercel serverless functions do not provide persistent local disk storage for this workflow.

If the project is opened on Vercel, it shows a local-only notice instead of trying to read the local SQLite database.

To make a real cloud version later, replace SQLite and the local vault with a managed database and private object storage designed for clinical data.
