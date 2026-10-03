# Inkspace

A private whiteboard workspace built with Next.js, React, and Excalidraw. It supports multiple boards, rename/delete, favorites, search, templates, autosave, dark mode, and editable/PNG/SVG exports.

The app now runs on **Vercel with Supabase Auth, Postgres, and private Storage**. Each approved user has their own boards. Authentication and cloud configuration are required; missing configuration keeps the workspace locked.

## Set up and deploy

Follow [the Vercel deployment guide](docs/VERCEL-DEPLOYMENT.md) to create the database, configure approved users and passwords, enable Turnstile, and add environment variables to Vercel. Login does not require SMTP or a custom domain. Complete these provider settings before using the deployed app.

For local development, install Node.js 22.13.0 or newer, then run:

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
```

Copy `.env.example` to `.env.local` and fill in the four variables described in the guide. Local development uses your configured Supabase project; use a separate development project to keep test drawings separate from production.

```sh
npm run dev
```

Open `http://localhost:3000`. Production checks and a local production preview are:

```sh
npm test
npm run typecheck
npm run check:config
npm run build
npm start
```

`check:config` checks environment variable formats without printing credentials. It does not verify hosted database, authentication, CAPTCHA, or Vercel settings. Tests include local database isolation checks; complete the live checks in the deployment guide with your own provider configuration.

## Data and limits

Boards are private to their signed-in owner. Drawing snapshots upload directly to the private Supabase bucket through temporary signed URLs, while Vercel handles authentication and board metadata. Sessions use HTTP-only cookies, write endpoints check request origin, and database/storage policies enforce ownership.

Limits per owner are 500 boards and 512 MiB of stored/reserved snapshots. Each drawing may contain up to 15 MB of JSON including embedded images. Old snapshots count toward storage until they are at least 135 minutes old and a later upload/delete triggers cleanup. Export a local backup if saving reports a quota or connection error.

Existing drawings in the old Cloudflare D1/R2 app or `.wrangler/state` are **not migrated automatically**. Export each board as an editable `.excalidraw` file from the old app, then import it after signing into this version. Keep your old data until you verify the imported drawings. Legacy Cloudflare configuration remains as reference and is not used by the Next.js/Vercel scripts.

## Main files

| File | Purpose |
| --- | --- |
| `components/workspace.tsx` | Navigation, autosave, rename/delete, templates and exports |
| `components/drawing-editor.tsx` | Excalidraw canvas integration |
| `components/login-form.tsx` | Email-and-password login and CAPTCHA |
| `lib/auth/` | Approved-user checks and login validation |
| `lib/board-client.ts` | Direct private snapshot uploads/downloads |
| `lib/board-store.ts` | Board validation and storage helpers |
| `app/api/boards/` | Authenticated board API |
| `proxy.ts` | Session refresh, security policy, private response caching |
| `supabase/migrations/202610030001_private_boards.sql` | Tables, ownership policies and private bucket |
| `.env.example` | Required configuration names and placeholders |
| `vercel.json` | Vercel build and function configuration |

Never commit `.env.local`, authentication cookies, or provider secrets. The application uses a Supabase publishable/legacy anon key; it does not need a secret or service-role key.

## Third-party software

Inkspace uses Excalidraw, Next.js, React, Supabase, Shadcn/Radix components, and the other dependencies listed in `package.json`. Fonts and third-party components retain their respective licenses. Existing vendored license files are included. No new blanket license is assigned to this project.
