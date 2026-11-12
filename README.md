# joshthecoder.com
My blog at joshthecoder.com

## Publishing

The site is hosted on Cloudflare (Workers static assets). To publish, run this from WSL:

    ./deploy.sh

- **Token:** it asks for your Cloudflare API token, and the typing is hidden. The token isn't saved anywhere.
- **Check first:** it asks you to confirm if you're not on `master` or have uncommitted changes, because the
  live site will match the files in this folder.
- **What it runs:** `npx wrangler deploy`. That runs `build-prod.sh` (the production Jekyll build) and uploads
  `_site/`, replacing the live site with exactly what's in it. Anything the build doesn't produce goes away.
  Settings are in `wrangler.jsonc`.

- `_headers` and `_redirects` are Cloudflare's response-header and redirect rules. Jekyll copies them into `_site/`.
- To undo a bad deploy: `npx wrangler rollback`.
