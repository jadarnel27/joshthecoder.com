# joshthecoder.com
My blog at joshthecoder.com

## Publishing

The site is hosted on Cloudflare (Workers static assets).

**Pushing to `master` publishes automatically.** GitHub Actions (`.github/workflows/deploy.yml`) runs the
production build and deploys it, about 2 minutes after the push. Watch it under the repo's **Actions** tab.
Pull requests are only built, not deployed, to show whether merging would break the site. The workflow needs
the repository secret `CLOUDFLARE_API_TOKEN`.

To publish by hand instead (e.g. without pushing), run this from WSL:

    ./deploy.sh

- **Token:** it asks for your Cloudflare API token, and the typing is hidden. The token isn't saved anywhere.
- **Check first:** it asks you to confirm if you're not on `master` or have uncommitted changes, because the
  live site will match the files in this folder.
- **What it runs:** `npx wrangler deploy`. That runs `build-prod.sh` (the production Jekyll build) and uploads
  `_site/`, replacing the live site with exactly what's in it. Anything the build doesn't produce goes away.
  Settings are in `wrangler.jsonc`.

- `_headers` and `_redirects` are Cloudflare's response-header and redirect rules. Jekyll copies them into `_site/`.
- To undo a bad deploy: `npx wrangler rollback`.
