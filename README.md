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

## Windows Desktop App

The Electron wrapper runs the same Next.js application against a local SQLite database. During development it starts Next.js on an available loopback port and opens the desktop window:

```bash
pnpm electron:dev
```

Build the unsigned Windows x64 NSIS installer with:

```bash
pnpm electron:build
```

The build copies the current Windows Node runtime into the temporary `.electron-build/` staging directory so the installed application does not require Node.js. The runtime, staging files, and installers under `release/` are generated locally and are intentionally excluded from Git.

Use `pnpm electron:preview` to open the unpacked build after a successful package. Desktop data and logs are stored under `%APPDATA%\OE Dental`; uninstalling or rebuilding the application does not remove the clinic database from that directory.

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

## Alta automática de pacientes

Antes de habilitar **Nuevo paciente**:

1. Configura en Ajustes una carpeta maestra local existente y con permiso de escritura.
2. Coloca la plantilla definitiva, libre de datos reales, en `assets/templates/payment-history.xlsx`.
3. Conecta Google. La carpeta maestra **Pacientes Chetumal** ya está definida por la clínica; usa **Verificar carpeta de Drive** para confirmar acceso.

Cada alta crea una carpeta estable `Nombre [ID-CORTO]` con `Historia clínica`, `Historial de pagos`, `Fotos`, `Radiografías`, `Recibos` y `Otros`. El TXT inicial es una fotografía de los datos del alta; editar al paciente después no lo reescribe. El XLSX se copia sin modificar y se convierte en Google Sheets. Si Drive no está disponible, el expediente local se conserva y la ficha permite reintentar sin duplicar archivos.

No renombres ni elimines automáticamente carpetas externas al editar un paciente. Las fotos, radiografías y recibos siguen entrando mediante el importador en esta versión.

## Google Calendar and Drive

Payment-history `.xlsx` files are read from the linked patient folders. If Google OAuth is configured, the import wizard can also upload those files to a shared Google Drive folder and convert them to Google Sheets.

Para `pnpm run dev`, conserva el cliente OAuth de tipo **Web** y sus valores `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`. No reemplaces esas credenciales por las de Electron.

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_TOKEN_ENCRYPTION_KEY=""
```

Create `GOOGLE_TOKEN_ENCRYPTION_KEY` with a local random 32-byte value, for example `openssl rand -base64 32`. Do not commit `.env`. El flujo de desarrollo usa el callback Web configurado para el origen local de Next.

Para Electron, copia `electron/google-oauth.example.json` como `electron/google-oauth.local.json` y completa `clientId` y `clientSecret` con el cliente OAuth de tipo **Desktop**. Este archivo local está excluido de Git y es obligatorio para empaquetar; el build falla si falta o no contiene ambos valores. El build genera `.electron-build/google-oauth.json` únicamente con esas credenciales Desktop, sin usar ni modificar las de `.env`. El flujo Desktop usa un callback loopback con puerto dinámico y abre Google en el navegador externo. Habilita Google Picker API y Drive API en el proyecto de Cloud; no se requiere un cliente OAuth Web para el instalador ni API key. Calendar conserva su autorización; Drive se autoriza por separado al elegir la carpeta fija desde Ajustes, usando acceso limitado `drive.file` en el navegador externo. La clave de cifrado de cada instalación se genera al primer arranque, se protege con `safeStorage` de Electron y nunca se registra en logs.

La aplicación usa como raíz fija la carpeta **Pacientes Chetumal** (`1klq70f1-8xqQTfANwUZExFugJNn1xt_m`), no crea enlaces públicos y deja que las carpetas hijas hereden sus permisos. Drive y Calendar guardan tokens cifrados independientes. En Ajustes, **Autorizar carpeta con Google** abre el selector de escritorio para conceder acceso puntual a esa carpeta; una cancelación u otra carpeta no guarda ni reemplaza tokens. Los reintentos identifican carpeta y hoja mediante `appProperties`, no por nombre.
