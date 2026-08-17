# OE Dental Dashboard

Local-first dashboard for a dental clinic. Patient records, clinical files, photos, receipts, treatment charges, and payments stay on the clinic computer by default.

## Quick Start

```bash
pnpm install
pnpm db:init
pnpm dev
```

Open `http://127.0.0.1:3000`, create the first local admin account, and start importing patient folders.

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
