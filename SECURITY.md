# Security

## You found this page on one of your own domains

Someone pointed you here from a page reading *"Subdomain Takeover confirmed"* served on a
hostname you own. Here is exactly what happened, in plain terms.

**A DNS record on your domain pointed at a third-party hosting service, but nobody had claimed
the corresponding resource there.** That leaves the hostname up for grabs: whoever claims the
resource first gets to serve content on your hostname, over HTTPS, with a valid certificate
issued in your name. I claimed it to prove the finding, and reported it.

### What was *not* done

- No visitor was logged. No IP addresses, no user agents, no request logs, no analytics.
- No traffic was intercepted, proxied or redirected anywhere.
- No cookie, token or credential was read, collected or stored.
- No email was sent or received on your domain.
- No `Strict-Transport-Security` header was set. That one matters: HSTS is cached by browsers,
  and setting it from an origin you don't control can break your HTTP services long after the
  page is gone. The deployment omits it deliberately.

The page is served with `Cache-Control: no-store` and `X-Robots-Tag: noindex` so it is never
indexed against your domain and leaves no cached copy behind. The entire source is in this
repository — the page makes exactly one network request, a `HEAD` to itself, to read back its
own response headers as evidence.

### How to fix it

1. **Delete the dangling DNS record**, or reclaim the resource on the third-party service so
   the hostname resolves to something you actually control.
2. **Then** ask me to release the origin. Order matters: if I release it while the record still
   dangles, the hostname is immediately claimable by the next person who looks — and they may
   not be a researcher.
3. Add dangling-record detection to your DNS lifecycle. Anything that diffs your zone against
   live resolution catches this class of bug before someone else does.

### Requesting teardown

Email **pablogalerani@gmail.com** with the hostname and, if you have it, the evidence ID shown
on the page (format `PABL-xxxx-xxxx`). I release the origin as soon as the record is gone —
no conditions, no bounty required, no disclosure timeline attached to the teardown itself.

If you would rather not email, opening an issue on this repository also reaches me. Please do
not include anything sensitive in a public issue — the hostname alone is enough.

## Reporting a vulnerability in this repository

The deliverable here is a static HTML page with no backend, no dependencies and no build step,
so the surface is small. If you find a problem in it anyway — the header readback leaking
something it shouldn't, the report generator mishandling untrusted input, a config that sets a
header it shouldn't — email **pablogalerani@gmail.com** rather than opening a public issue, and
allow a reasonable window before disclosing.

## Scope and intended use

This template exists for **authorized, in-scope bug bounty and penetration testing work**.

Claiming a dangling DNS record on a host you have no permission to test is unauthorized access
under the computer-misuse laws of most jurisdictions, whether or not the target runs a bounty
programme. A permissive licence on this code is not authorization to use it against a domain,
and it is not legal advice.

The design constraints below are not optional extras — they are what separates a valid finding
from an incident:

- **Static only.** No serverless functions, no analytics, no beacons. Collecting anything from
  real traffic on someone else's hostname turns a valid report into unauthorized data
  collection.
- **No HSTS**, for the reason given above.
- **No target in any committed file.** The hostname belongs in the hosting platform's
  dashboard, never in git history.
- **Teardown after remediation**, never before.
