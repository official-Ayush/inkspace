# Deploy Inkspace to Vercel

This version uses Vercel for Next.js and Supabase for authentication, board metadata, and private drawing files. Complete the configuration below before using it. Local tests and a successful build cannot verify hosted email delivery, storage policies, CAPTCHA credentials, or deployment settings.

## 1. Create a dedicated Supabase project

Use a new project dedicated to Inkspace so unrelated authentication providers, users, or existing storage policies cannot widen access.

In its SQL editor, run the complete contents of `supabase/migrations/202610030001_private_boards.sql` once against the fresh project. It creates the board tables, ownership policies, upload reservation functions, and private `inkspace-scenes` bucket. Do not run the old `drizzle/` migrations for this deployment. Resolve any migration error before continuing; do not disable row-level security to make a request work.

Confirm that `inkspace-scenes` is private and row-level security is enabled on `public.boards` and `public.board_uploads`. The application never requires a Supabase secret or service-role key.

## 2. Configure approved users and email codes

In Supabase Authentication:

1. Enable the email provider and disable new user signups. Leave anonymous sign-ins and unused providers disabled.
2. Create each approved user manually in the Users dashboard with their real email address, and ensure their email is confirmed. If creation requires a password, use a generated password; this app signs users in with email codes.
3. Set the Site URL to your production HTTPS address when known.
4. Edit the **Magic Link** email template to send a numeric code. A minimal body is:

```html
<h2>Your Inkspace sign-in code</h2>
<p>Enter this code in Inkspace:</p>
<p><strong>{{ .Token }}</strong></p>
<p>If you did not request this code, ignore this email.</p>
```

The form expects a code entered in the same browser. A template containing only a sign-in link will not match this flow. See [Supabase passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless).

Configure a production SMTP provider and verified sender in Supabase, then test delivery to approved addresses. Keep Supabase's authentication rate limits enabled. List the same approved emails in `INKSPACE_ALLOWED_EMAILS`, separated by commas. The app requests codes with account creation disabled and checks the verified user's email again before granting access.

To revoke access, remove the email from the app allowlist and redeploy, then revoke the user's sessions or disable the account in Supabase.

## 3. Enable Turnstile

Create a Cloudflare Turnstile widget and add the exact hostnames where people will sign in, including the production Vercel/custom domain. Add `localhost` if using this widget for development. Use separate widgets/projects for development or previews where practical.

Enable CAPTCHA protection in Supabase Authentication, choose Cloudflare Turnstile, and enter the widget's **secret key in Supabase only**. Set the matching public site key as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the app. See [Supabase CAPTCHA configuration](https://supabase.com/docs/guides/auth/auth-captcha).

Production requires a real site key. Public test keys are not a production configuration. The site key is intentionally visible in browser code; never put its secret in a `NEXT_PUBLIC_` variable or commit it to Git.

## 4. Set environment variables

Copy `.env.example` to `.env.local` for local work. In PowerShell:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env.local
```

Fill in these values, then add the same variable names to the appropriate environment in Vercel's project settings:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your project origin, such as `https://PROJECT.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | The project's `sb_publishable_...` key, or legacy `anon` key; never a secret/service-role key |
| `INKSPACE_ALLOWED_EMAILS` | Real approved email addresses separated by commas |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | The public key for your configured Turnstile widget |

Supabase's Connect/API settings provide the project URL and publishable key. Do not copy the database password, JWT secret, SMTP password, or Turnstile secret into this app. `.env.local` is ignored by Git; `.env.example` contains placeholders only.

Use a separate Supabase project for Vercel Preview deployments if previews should have test data. Apply the migration and auth configuration there too, then set Preview-specific variables. Alternatively, leave preview app configuration unset so the workspace stays locked. Enable Vercel's preview access protection when available. New preview hostnames also need Turnstile coverage; prefer a stable preview domain over allowing arbitrary domains.

## 5. Check locally and deploy

Install Node.js 22.13.0 or newer. From the project directory:

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm test
npm run typecheck
npm run check:config
npm run build
```

`check:config` validates variable formats without displaying values. Passing it does not confirm remote provider settings. It intentionally fails when placeholders or required settings are missing.

Push the source and lockfile to GitHub, then import that repository into Vercel. Select this directory as the root, use the **Next.js** preset, and select a supported Node.js version satisfying the package's `>=22.13.0` requirement. The included `vercel.json` supplies install/build commands; use the framework's default output directory.

Add environment variables before deploying. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is included at build time, so changing it requires a new deployment. Add the final hostname to Turnstile and the production URL to Supabase's Site URL settings.

Old Cloudflare D1/R2 bindings, Wrangler commands, and Sites configuration are not used for this Vercel deployment. Do not configure Vercel as a static export: this app needs its Next.js server routes.

## 6. Verify the configured deployment

Use non-sensitive sample drawings:

1. An unsigned-in browser should reach login and be unable to list or download boards.
2. Sign in with an approved, pre-created email and its delivered code after completing CAPTCHA. An unapproved address should not gain access.
3. Create, draw, reload, rename, favorite, export, import, and delete a sample board. Confirm saving succeeds and the drawing survives a fresh sign-in.
4. Use a second approved account in another browser profile. It should see its own workspace and should be unable to open the first user's board URL/API record.
5. Test a drawing larger than 4.5 MB but below 15 MB to confirm direct Storage transfers work with your provider setup.
6. Sign out and confirm board endpoints reject access. Verify the bucket remains private in Supabase.

Tests in `tests/` exercise validation, authentication logic, private uploads, and database ownership locally. They do not provision or authenticate against your hosted project. Only live checks confirm the complete provider integration for your deployment.

## Storage limits, cleanup and backups

The migration enforces these per-owner limits:

- 500 boards.
- 15,000,000 bytes per JSON drawing, including embedded images.
- 512 MiB across current snapshots, retained old snapshots, and pending reservations.
- 2,000 stored/pending objects and 100 pending uploads.
- 120 upload reservations per minute and 10,000 per day.

Every save creates an immutable snapshot. Its upload reservation must be committed within 10 minutes. Signed download URLs expire after 60 seconds; treat signed URLs as temporary private credentials and avoid sharing them.

The browser transfers drawing JSON directly to private Supabase Storage because [Vercel Functions limit request and response bodies to 4.5 MB](https://vercel.com/docs/functions/limitations). Metadata requests remain small. Supabase [signed upload URLs are valid for two hours](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl), which is why cleanup waits longer than the application's commit window.

Old snapshots, including snapshots from a deleted board, are retained for at least **135 minutes** to outlast signed upload tokens. Deleting a board immediately removes it from the workspace but does not immediately free those bytes. Cleanup runs during later upload/delete requests, in batches of up to 100 eligible objects; it is not scheduled in the background. An idle account can retain old private objects until its next activity. Frequent saves of large boards can therefore reach the limit sooner than visible board sizes suggest.

If saving reports a limit or network error, export an editable local backup before closing the page. Reduce image sizes, delete unused boards, and allow old snapshots to become eligible for cleanup before trying again. These limits reduce abuse; they do not replace provider billing controls or monitoring. Configure your provider's usage alerts.

Keep regular editable exports of important boards and use a suitable Supabase backup plan. Database backups alone do not necessarily include Storage file contents; confirm coverage for both before relying on a recovery plan.

## Bring drawings from the previous app

The previous app used Cloudflare D1/R2, and local data may still be in `.wrangler/state`. This migration creates new Supabase tables and does not import that data.

Open the previous app and use **Export → Editable** for each drawing. Sign into this version and use **Import a drawing** for each `.excalidraw` file. Confirm the content saves and reloads before removing the old installation or storage. Favorites and other workspace metadata may need to be recreated.

## Common setup failures

| Symptom | Check |
| --- | --- |
| Workspace locked or service unavailable | All variables exist in the deployment's environment; redeploy after changes. |
| No email code | User exists and is confirmed, address is allowlisted, SMTP works, and Magic Link template contains `{{ .Token }}`. |
| CAPTCHA fails | Hostname is permitted and Supabase's secret matches the app's site key. |
| Board save fails immediately | Migration completed in the same project as the configured URL/key; bucket is private and named `inkspace-scenes`. |
| Storage limit after deletion | Deleted/old snapshots count during the 135-minute retention window; later activity triggers cleanup. |
| Preview changes production drawings | Preview points at production Supabase; configure a separate Preview project and variables. |

Keep dependencies patched and re-run checks when making changes. These protections reduce the original deployment risks; they cannot guarantee absolute security or replace correct provider configuration.
