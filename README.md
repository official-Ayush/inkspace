# Inkspace

The complete source for your private Excalidraw-powered whiteboard website.

## What is included

- Infinite canvas with shapes, arrows, freehand drawing, text, images, and sticky notes.
- Multiple named boards, favorites, search, automatic saving, and save-conflict recovery.
- Six starter templates: blank canvas, mind map, flowchart, architecture, project board, and weekly planner.
- Dark mode, presentation mode, and PNG / SVG / editable `.excalidraw` exports.
- React and TypeScript frontend, API routes, database schema and migrations, font assets, and the dependency lockfile.

This is a source project, so it runs through Node.js; it is not a single HTML file you can double-click.

## Run on your computer

These steps work from a terminal opened inside this `inkspace` folder. On Windows you can use the VS Code terminal or PowerShell.

### 1. Install Node.js

The project requires Node.js 22.13.0 or newer, with npm / npx available. Check your installation:

```sh
node --version
npm --version
```

### 2. Install dependencies

```sh
npx pnpm@11.25.0 install --frozen-lockfile
```

If npx asks whether to install pnpm, accept. The package manager version is pinned to match the included lockfile. Internet access is needed for the initial dependency download.

### 3. Build once

```sh
npx pnpm@11.25.0 run build
```

This generates `dist/server/wrangler.json`, which is used to initialize the local database in the next step.

### 4. Initialize the local database — first run only

Run this as one line:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_overconfident_may_parker.sql
```

This creates the board table in the local development database. It does not connect to or change the live website's database. Do this only once for a fresh local database; a `table boards already exists` message means initialization was already completed.

### 5. Start the development server

```sh
npx pnpm@11.25.0 run dev
```

Open the address shown in the terminal (normally `http://localhost:5173`). Keep the terminal open while using the app. Press Ctrl+C to stop it.

For later sessions, you only need step 5. If you edit dependency versions, run the install step again as appropriate.

## How local saving works

Cloudflare's local emulator supplies a D1 database and R2 object storage; no Cloudflare account or API key is needed for local use. Local boards are kept under `.wrangler/state/` and survive restarts. Keep that folder if you want to keep your local drawings.

The source ZIP starts with a fresh workspace and includes the sample/template definitions. Boards you have created on the live website are stored separately and are not part of this source archive. To move an existing drawing, use **Export → Editable** on the live site, then **Import a drawing** on your local copy.

## Where to edit

| File or folder | Purpose |
| --- | --- |
| `components/workspace.tsx` | Workspace, board navigation, templates dialog, autosave, export controls |
| `components/drawing-editor.tsx` | Excalidraw integration, drawing tools, sticky notes, exports |
| `lib/templates.ts` | Editable diagram and planning templates |
| `app/globals.css` | Colors, typography, layout, and responsive styling |
| `app/page.tsx` | Main page |
| `app/layout.tsx` | Page title, description, and global layout |
| `app/api/boards/route.ts` | List and create boards |
| `app/api/boards/[id]/route.ts` | Read, save, rename, star, and delete a board |
| `lib/board-store.ts` | Storage access and request validation |
| `db/schema.ts` | Database schema |
| `drizzle/` | Database migrations |
| `public/` | Favicon and locally hosted fonts |
| `vite.config.ts` | Vinext/Vite and local Cloudflare bindings |
| `.openai/hosting.json` | Existing Sites identity and storage binding declarations |

The UI components used by the app are included under `components/ui/`.

## Check and build changes

Type check:

```sh
npx pnpm@11.25.0 exec tsc --noEmit
```

Production build:

```sh
npx pnpm@11.25.0 run build
```

Preview the built Worker locally:

```sh
npx pnpm@11.25.0 start
```

Use the URL printed by that command. This also uses your local `.wrangler/state/` data.

## Hosting

The existing live app is hosted privately through ChatGPT Sites. Editing this downloaded copy does not change the live site. Its site identity is preserved in `.openai/hosting.json` so the source can be associated with the original project.

The backend targets Cloudflare Workers and uses `DB` (D1) and `BUCKET` (R2). Hosting it elsewhere requires equivalent runtime bindings and applying the included migrations. A static-only host cannot run the board-saving API as-is.

The live site's access restriction is provided by the Sites platform. This app does not implement a separate public account system; configure access protection if you deploy it independently. It is a single-workspace app, without live multiplayer editing.

## Source snapshot

This export corresponds to published version 1, commit:

`af9ae5f05c39502b8922c6696dca77460cf831d6`

The application code matches that source. This export adds this guide, preserves the original starter README in `docs/STARTER-REFERENCE.md`, and excludes the generated TypeScript cache. Dependencies, build output, Git history, credentials, and runtime databases are intentionally omitted; the source and lockfile recreate the application.

The original app was type-checked, built, and checked in a browser for drawing, undo, sticky notes, templates, board saving/reloading, and export generation. The source archive was verified against the published commit; the local setup steps have not been executed on your own computer.

## Third-party software

Inkspace uses the open-source Excalidraw drawing engine, React, Vinext, Shadcn/Radix components, and other dependencies listed in `package.json`. Fonts and third-party components retain their respective licenses. Existing vendored license files are included. No new blanket license is assigned to your project by this export.
