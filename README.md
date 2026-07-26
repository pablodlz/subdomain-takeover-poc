# subdomain-takeover-poc

Host-agnostic proof-of-concept page for **dangling DNS record / subdomain takeover**
findings. Claim the origin, attach the hostname, screenshot, report.

Nothing in this repo names a target and nothing in it is tied to one hosting platform. The
page reads the hostname, path, timestamp **and its own HTTP response headers** at render
time, identifies the platform it is running on by itself, and writes the report for you. The
repo is never edited per engagement and stays safe to keep public.

```
$ dig +short sub.target.com
-> record resolves to a third-party origin nobody claimed
$ claim sub.target.com
-> origin claimed. dangling record now points at me.
```

## The platform is not your choice

A takeover only works on **the platform the dangling record already points at**. A record
pointing at `*.github.io` must be claimed on GitHub Pages, one pointing at
`cname.vercel-dns.com` on Vercel, one pointing at `*.netlify.app` on Netlify, and so on.
`dig`/`CNAME` decides — not you.

So this repo is built to deploy anywhere, with the per-platform config files sitting side by
side and the page adapting at runtime.

## Deploy (any static host)

1. Point the platform at this repo. Framework preset: **Other / static**. No build command,
   output directory `.`.
2. In the platform's domain settings, add the vulnerable hostname (`sub.target.com`).
   It will ask you to create a DNS record — **you don't**. The dangling record already points
   here. If the platform accepts the domain and starts serving, that *is* the takeover.
3. Open `https://sub.target.com/` **and** a path that doesn't exist, e.g.
   `https://sub.target.com/admin/login`. Both must render the PoC.
4. Hit **copy report block** and paste it into the report.

Everything else is automatic: the page detects the platform from its own response headers,
fills in the evidence, and generates the writeup.

### Per-platform config

| platform | config it reads | catch-all | custom headers |
| --- | --- | --- | --- |
| **Vercel** | `vercel.json` | rewrite, HTTP 200 | yes |
| **Netlify** | `_redirects`, `_headers` | rewrite, HTTP 200 | yes |
| **Cloudflare Pages** | `_headers`, `404.html` | `404.html` | yes |
| **GitHub Pages** | `CNAME`, `.nojekyll`, `404.html` | `404.html` | no |
| **anything else** | `404.html`, `robots.txt`, `<meta noindex>` | `404.html` if honoured | no |

The configs coexist; each platform ignores the others' files. Where custom headers aren't
available you lose the `X-PoC-*` trail and the `no-store` guarantee, but `robots.txt` and the
`<meta name="robots" content="noindex">` tag still keep the PoC out of search results.

GitHub Pages is the one special case: `CNAME` is required, it names the target, and it is
gitignored on purpose. Copy `CNAME.example` → `CNAME`, then `git add -f CNAME`, and accept
that the hostname is permanently in this repo's public history — delete the repo after
remediation. Every other platform keeps the hostname in its dashboard, where it belongs.

### Local preview

The assets are referenced with absolute paths, so `file://` won't load them. Serve the
directory instead:

```bash
python -m http.server 8791
```

## What it gives you

| | |
| --- | --- |
| **Self-proving page** | Hostname, full URL, path, scheme, UTC timestamp rendered live from `location`. No editing, no room to accuse you of a forged screenshot. |
| **Raw response headers on the page** | One same-origin `HEAD` on itself, then it prints its own headers — including the platform fingerprint (`x-vercel-id`, `x-nf-request-id`, `x-github-request-id`, `x-render-origin-server`, `via: vegur`…). Header-level proof the response comes from a third party, straight into the report. |
| **Platform self-identification** | 18 fingerprints across Vercel, Netlify, GitHub Pages, Cloudflare, Render, Pantheon, Shopify, Heroku, Surge, Squarespace, Firebase, Fly.io, S3/CloudFront, Azure, Fastly. Unrecognised hosts are named by their own `Server` header instead of a vague label. |
| **Response headers you control** | `X-PoC-Researcher` / `X-PoC-Contact` / `X-PoC-Notice` wherever the platform allows it. A triager who runs `curl -sI` finds your signature and a contact address before opening a browser — and it demonstrates control over security headers on their hostname. |
| **Deterministic evidence ID** | `PABL-xxxx-xxxx`, derived from `hostname + date`. Reload the page and it matches the ID in the report. |
| **Catch-all namespace proof** | Every path serves the PoC — HTTP 200 where rewrites exist, `404.html` elsewhere. Proves control of the whole namespace, not just `/`. |
| **One-click report block** | Ready-to-paste Markdown: summary, repro steps, observed headers, impact, remediation — with the detected platform name filled in. |
| **Verbose recon panel** | Cookie readability, `isSecureContext`, `document.domain`, origin storage access — the concrete impact primitives, not adjectives. |
| **Explicit good-faith notice** | Anyone landing on the page (including the client's SOC at 3am) immediately sees this is authorized research, with a contact address. |
| **No data collection** | One same-origin `HEAD` to itself, and that is the entire network activity. No analytics, no beacon, no fonts, no CDN, no serverless function, no visitor logging. Auditable in one read of `assets/poc.js`. |

## Hard rules

- **Never log visitors.** Every platform puts serverless functions and analytics one click
  away. Collecting anything from real traffic on the client's hostname turns a valid finding
  into unauthorized data collection. Keep the deployment static.
- **Never send HSTS.** `Strict-Transport-Security` on a hostname you don't own gets cached by
  browsers and can break the owner's HTTP services after teardown. The configs here omit it
  deliberately, and the page raises a warning if the platform sets it anyway.
- **Never put the target in the repo name or in a committed file.** `takeover-bigbank-com` is
  public disclosure before triage and breaks most programs' policy. `.gitignore` blocks
  `CNAME`, screenshots and platform CLI state for the same reason.
- **DNS record first, teardown second.** Ask the program to delete the dangling record, *then*
  release the origin. Releasing it while the record still dangles just reopens the window for
  whoever looks next.

## Naming

Keep it neutral and reusable — no target, nothing that reads as a defacement to a SOC.
Since no file here names a target, one repo serves every finding on every platform, forever.

## Files

| path | role |
| --- | --- |
| `index.html` | the PoC page |
| `404.html` | same page for unmapped paths, for platforms without 200-rewrites. Keep in sync with `index.html`. |
| `assets/poc.js` | evidence rendering, header readback, platform detection, report block, recon panel. `CONFIG` at the top is the only thing to edit; `PLATFORMS` is where you add a host it doesn't recognise. |
| `assets/poc.css` | CRT terminal styling, print + reduced-motion friendly |
| `vercel.json` | Vercel rewrites + headers |
| `_headers` / `_redirects` | Netlify / Cloudflare Pages equivalents |
| `robots.txt` | `Disallow: /`, for platforms without header control |
| `.nojekyll` | GitHub Pages: serve files verbatim (also stops Jekyll dropping `_headers`/`_redirects`) |
| `CNAME.example` | GitHub Pages only — copy to `CNAME` per engagement |
| `.gitignore` | blocks `CNAME`, screenshots and CLI state — everything that could name a target |

## Scope

Authorized, in-scope bug bounty testing only. Claiming a dangling record on a host you have no
permission to test is unauthorized access in most jurisdictions, program or not.

---

`// pablodlz was here.`
