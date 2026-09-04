# OE Dental Dashboard

Local-first dashboard for a dental clinic. Patient records, clinical files, photos, receipts, treatment charges, and payments stay on the clinic computer by default.

## Quick Start

```bash
pnpm install
pnpm db:init
pnpm dev
```

Open `http://127.0.0.1:3000`, create the first local admin account, and start importing patient folders.

After pulling schema changes into an existing local install, run `pnpm db:init` again. Legacy test databases that still use the old vault schema are reset so the app can use linked patient folders.

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
- Linked patient folder root: configured in Ajustes or `PATIENTS_ROOT_PATH`
- Backups: `data/backups/`

The import wizard links files from the configured patient folder root. It stores database references only and does not copy photos, radiographs, or documents into the app directory.

## Optional Google Sheets Uploads

Payment-history `.xlsx` files are read from the linked patient folders. If Google OAuth is configured, the import wizard can also upload those files to a shared Google Drive folder and convert them to Google Sheets.

Add local values to `.env.local`:

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:3000/api/google/oauth/callback"
GOOGLE_TOKEN_ENCRYPTION_KEY=""
```

Create `GOOGLE_TOKEN_ENCRYPTION_KEY` with a local random 32-byte value, for example `openssl rand -base64 32`. Do not commit `.env.local`.

In Google Cloud, configure the OAuth web client with the same redirect URI. The redirect URI host must match the address you use to open the app (use `localhost:3000` or `127.0.0.1:3000` consistently; 127.0.0.1 and localhost are different hosts for cookies). During import, paste the shared Drive folder link or folder ID when `.xlsx` payment-history files are detected. If Google is not configured or an upload fails, the local file remains available from the patient's `Historial pagos` tab.
