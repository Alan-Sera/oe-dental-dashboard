# OE Dental Dashboard

Local-first dashboard for a dental clinic. Patient records, clinical files, photos, receipts, treatment charges, and payments stay on the clinic computer by default.

## Quick Start

```bash
pnpm install
pnpm db:init
pnpm dev
```

Open `http://127.0.0.1:3000`, create the first local admin account, and start importing patient folders.

After pulling schema changes into an existing local install, run `pnpm db:init` again to create any new local SQLite tables without touching imported files.

## Tech Stack

- Next.js 15.5
- React 19
- TypeScript 5
- Tailwind CSS 3.4 with tailwindcss-animate
- Prisma 6 with SQLite
- Vitest
- ESLint and Prettier
- pnpm 11

## Local Data

- SQLite database: `data/app.db`
- Managed file vault: `data/vault/`
- Backups: `data/backups/`

The import wizard copies selected files into the managed vault and leaves the original folders untouched.

## Optional Google Sheets Uploads

Payment-history `.xlsx` files are always copied to `data/vault/` first. If Google OAuth is configured, the import wizard can also upload those files to a shared Google Drive folder and convert them to Google Sheets.

Add local values to `.env.local`:

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://127.0.0.1:3000/api/google/oauth/callback"
GOOGLE_TOKEN_ENCRYPTION_KEY=""
```

Create `GOOGLE_TOKEN_ENCRYPTION_KEY` with a local random 32-byte value, for example `openssl rand -base64 32`. Do not commit `.env.local`.

In Google Cloud, configure the OAuth web client with the same redirect URI. During import, paste the shared Drive folder link or folder ID when `.xlsx` payment-history files are detected. If Google is not configured or an upload fails, the local file remains available from the patient's `Historial pagos` tab.
