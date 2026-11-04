# Incident and deployment judgment (Task 4)

*Hypothetical scenarios. No statement here is about the current state of any live website.*

## Scenario A: "Space42 Arena was hacked overnight, after your design updates"

**Principle:** treat the design change as one hypothesis among several, not the cause. Preserve evidence before anything else changes.

### First 30 minutes
1. **Acknowledge and coordinate.** Reply calmly with no blame, and ask what was seen, when, and what was already changed or "fixed". Open an incident channel and log every action with a timestamp.
2. **Preserve evidence before more cleanup:**
   - Snapshot the server or VM and the database.
   - Copy the web root (with file timestamps), access and error logs, WAF/CDN logs, the hosting control-panel audit log, and the WordPress user and plugin lists.
   - Record hashes of the copies.
   - Ask colleagues *not* to restore over it yet.
3. **Contain without destroying evidence:**
   - Put up a maintenance page or WAF block if the site is serving malicious content.
   - Rotate credentials: WordPress admins, hosting/SFTP/SSH, DB, API keys and salts.
   - Revoke unknown admin users and sessions, and disable file editing (`DISALLOW_FILE_EDIT`).
4. **Scope:** is customer data involved (form entries, accounts)? That decides privacy and legal notification duties, so flag it to management early.

### First 24 hours
- **Separate correlation from cause.** Build a timeline: design deploy time against the first malicious request, file change and new admin user. Then test each hypothesis:
  - Diff the deployed design commit against the files actually on the server.
  - Check whether the change could create the entry point (new upload handler, unescaped output, new plugin).
  - Find the first malicious request in the logs.
  - If the compromise starts *before* the deploy, or comes through an unrelated path, the deploy is ruled out.
- **Access and plugin review:**
  - Review all admin and hosting accounts, recent logins, 2FA status, and who had deploy access.
  - List plugins and themes with versions against known vulnerabilities, and look for abandoned or nulled ones.
  - Look for unexpected mu-plugins, cron jobs, `.htaccess` rules and PHP files in `uploads/`.
- **Log analysis:**
  - POSTs to `xmlrpc.php`, `wp-login.php`, `admin-ajax.php` or unusual REST routes.
  - Requests to newly created PHP files, spikes from single IPs or ASNs.
  - Match web-log entries to file modification times.
- **Clean recovery:** rebuild from a known-good source, not by "cleaning in place". That means WordPress core, plugins and theme from trusted sources and Git, the DB restored from a **verified** pre-compromise backup (or cleaned and diffed), and uploads scanned.
- **Verify backups:** restore the chosen backup to an isolated staging environment first, confirm it is clean and complete, and record its timestamp against the timeline.
- **Communication:** short factual updates at fixed intervals (what we know, what we don't, next update time). Speculation stays out of them, including about the design change. Prepare customer or regulator notices if personal data was exposed.
- **Safe release and rollback plan:**
  - Deploy the clean build to staging, run a security scan and smoke tests, then release in a low-traffic window with monitoring.
  - Keep the snapshot and the last good artifact ready for immediate rollback.
  - Follow up with a blameless post-incident review: root cause, the fix, and controls added (2FA, least privilege, WAF, file-integrity monitoring, update policy).

## Scenario B: merchandise checkout with failed payments and duplicate orders

1. **Reproduce in staging** using the gateway's sandbox and the same WooCommerce, plugin and PHP versions. Never test on production cards or data.
2. **Webhooks and callbacks:**
   - Check the gateway dashboard's webhook delivery log (status codes, retries, latency).
   - Confirm the endpoint URL and signature secret are correct for that environment, and that signatures are **verified**.
   - Make sure the handler returns 2xx quickly and does slow work asynchronously. Slow or 5xx responses cause gateway retries, and retries create duplicates.
   - Make sure caching, CDN or WAF rules don't block or cache the webhook URL.
3. **Idempotency:**
   - Key processing on the gateway's event ID or payment intent ID, and store processed IDs with a unique constraint.
   - Treat a repeated event as a no-op that still returns 2xx.
   - Create the order once at checkout, and let callbacks only *transition* its state (pending → paid).
   - Send an idempotency key on outgoing payment requests, and disable the submit button / dedupe double clicks.
4. **Server logs:**
   - Correlate order IDs, payment intent IDs and webhook event IDs across WooCommerce logs, PHP error logs, web access logs and the gateway log.
   - Look for timeouts, fatal errors after payment, and race conditions where the redirect return and the webhook arrive together.
5. **Staging tests:** replay duplicate and out-of-order webhooks, simulate timeouts and declines, and run concurrent checkouts. Add automated tests for each.
6. **Secure order data:**
   - Use hosted fields or redirect so card data never touches our server (keeps PCI scope minimal).
   - Store only the token and last 4 digits. Restrict order access to shop-manager capability, keep PII out of logs, serve everything over HTTPS, and apply a retention policy.
7. **Customer impact:** reconcile gateway transactions against orders, refund confirmed duplicates, and tell affected customers clearly.
