# streetpass-bluesky

A Chrome and Firefox extension that collects the Bluesky accounts behind the sites you visit.
Inspired by [streetpass.social](https://streetpass.social), which does the same for Mastodon.

## How it finds people

1. **The site's domain is a handle.** On every https page, the extension asks the site for
   `/.well-known/atproto-did`. If that returns a DID whose Bluesky handle is the same domain,
   the person is added as verified. The request goes to the site you are already on.
2. **A `rel="me"` link.** Links like `<a rel="me" href="https://bsky.app/profile/alice.com">`
   or `at://` links add the profile as unverified, because any page can link to any profile.
   If the profile's handle matches the page's domain, it counts as verified.
3. **DNS, opt-in.** Most custom handles are set as a DNS TXT record (`_atproto.<domain>`), not
   in the well-known file. Turning on "Look up handles in DNS" in the popup asks Cloudflare's
   DNS-over-HTTPS resolver for that record, which sends the domain of every site you visit to
   Cloudflare.

Without the DNS option the list fills slowly: only sites that serve the well-known file or
use `rel="me"` show up. People with a `*.bsky.social` handle are found only through
`rel="me"` links.

Profiles come from the public Bluesky API (`public.api.bsky.app`). No request sends cookies.
Domains that turned out not to be handles are remembered in session storage for 24 hours,
so the extension never writes your browsing history to disk.

## Develop

Needs Node 24 or newer.

```sh
npm install
npm run build          # writes dist/chrome and dist/firefox
npm run dev            # rebuilds the Chrome version on change
npm run firefox        # builds and opens Firefox with the extension
npm run lint:firefox   # checks dist/firefox with Mozilla's linter
npm test
npm run check          # type check
```

Load it in Chrome: `chrome://extensions`, turn on developer mode, "Load unpacked", pick
`dist/chrome`. If Firefox hasn't granted access to all websites, the popup shows a button for it.

CI (`.github/workflows/build.yml`) runs the checks and tests on every push to `main` and every
pull request, and uploads both builds as artifacts.

```
src/
  background.ts   checks domains and links, keeps the list
  content.ts      reports rel="me" links on each page
  lib/            parsing, Bluesky API calls, list rules
  popup/          popup UI
scripts/          icon and avatar shape, drawn at build time
test/             node:test tests for src/lib
```

Made by [kosta.lol](https://bsky.app/profile/kosta.lol).
