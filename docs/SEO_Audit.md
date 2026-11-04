# Cross-brand technical SEO audit (Task 1)

> **Status: TEMPLATE. Evidence still to be collected by the candidate.**
> The brief forbids probing, scanning or automating requests to the five live sites. Nothing below has been fetched or verified by a tool.
> Every `[VERIFY]` field must be filled from **your own manual checks**: browser view-source, DevTools (Elements, Network, Lighthouse), PageSpeed Insights, Google's Rich Results Test, and `robots.txt` / `sitemap.xml` opened in a browser.
> Do not keep any finding you could not observe. Mark items that need Search Console, GA4 or backend access as **"Needs access to confirm"**. Keep the final document to at most 4 pages.

**Method and tools:** Chrome DevTools, Lighthouse (mobile, throttled), PageSpeed Insights (field CrUX data where available), Rich Results Test, manual navigation on a mobile viewport. Date of checks: `[VERIFY: date]`.

## 1. One issue or opportunity per site

| Site | Exact URL | Observable evidence | User / business impact | Realistic fix | Confidence |
|---|---|---|---|---|---|
| IP Studios | `[VERIFY]` | `[VERIFY: screenshot / snippet]` | | | Observed / Needs access |
| DrVet | `[VERIFY]` | | | | |
| Space42 Arena | `[VERIFY]` | | | | |
| Jazzbar | `[VERIFY]` | | | | |
| MENA Lead | `[VERIFY]` | | | | |

**Checklist of what to look at (pick the strongest *observed* issue per site):**
- `<title>` and meta description present, unique, and the right length
- exactly one meaningful `<h1>`
- canonical present and self-referencing
- `robots` meta / `X-Robots-Tag` not blocking
- the `robots.txt` and `sitemap.xml` exist and agree
- images have `alt`, explicit `width`/`height`, and modern formats
- LCP element and its size, render-blocking CSS/JS, CLS sources
- tap-target size and viewport on mobile
- the enquiry/contact path is ≤ 2 taps from the home page, and the form has labels and error messages
- `hreflang` if Arabic/English versions exist
- structured data present and valid in the Rich Results Test

## 2. Deep-dive: Space42 Arena and DrVet

For each site, fill in what you **observed** and state what needs access.

| Area | Space42 Arena | DrVet |
|---|---|---|
| Title / H1 structure (home + 1 key page) | `[VERIFY]` | `[VERIFY]` |
| Indexing: canonical, robots meta, robots.txt, sitemap | `[VERIFY]` | `[VERIFY]` |
| Structured data present / opportunity | Opportunity to verify: `Event` (+ `Place`/`Offer`) on event pages | Opportunity to verify: `VeterinaryCare` (LocalBusiness) + `Service` per service page |
| Mobile presentation (viewport, tap targets, overflow) | `[VERIFY]` | `[VERIFY]` |
| Page speed / CWV: PSI lab (LCP, CLS, TBT), CrUX field data if shown | `[VERIFY: paste exact figures from PSI]` | `[VERIFY]` |
| User journey: home → enquiry (taps, friction) | `[VERIFY]` | `[VERIFY]` |
| **Needs access to confirm** | Index coverage, crawl errors and query data (Search Console); conversion rate of the enquiry form (GA4); server TTFB under load (hosting/APM) | Same, plus which service pages get impressions but low CTR (Search Console Performance report) |

## 3. Prioritised top-five fix list (across all companies)

Fill in from the findings above, ordered by value against effort. Severity is High, Medium or Low.

| # | Site | Fix | Severity | Effort | Expected business value | Validation method |
|---|---|---|---|---|---|---|
| 1 | | | | e.g. 2 h | e.g. eligible for event rich results → more qualified clicks | Rich Results Test passes; Search Console "Events" report after recrawl |
| 2 | | | | | | Lighthouse/PSI before vs after; CrUX trend over 28 days |
| 3 | | | | | | View-source shows a single H1/canonical; URL Inspection in Search Console |
| 4 | | | | | | |
| 5 | | | | | | |

## 4. Before / after code examples

*These are illustrative implementations to adapt once the matching issue has been observed. They are not claims about the current state of either site.*

### Example A: Event structured data (Space42 Arena event page)
**Before:** event details exist only as visual text; no machine-readable event data.
```html
<h2>Rooftop Acoustic Night</h2>
<p>Sun 14 March, doors 7pm · Space42 Arena</p>
```
**After:** the same visible content, plus JSON-LD that matches it exactly. Never mark up details that are not on the page.
```html
<h1>Rooftop Acoustic Night</h1>
<p>Sun 14 March, doors 7pm · Space42 Arena</p>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Rooftop Acoustic Night",
  "startDate": "2027-03-14T19:00:00+04:00",
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": { "@type": "Place", "name": "Space42 Arena",
                "address": { "@type": "PostalAddress", "addressLocality": "[VERIFY from site]", "addressCountry": "AE" } },
  "organizer": { "@type": "Organization", "name": "Space42 Arena", "url": "https://space42arena.com/" }
}
</script>
```
**In WordPress:** output it from the event template via `wp_head`, with values from post meta escaped by `wp_json_encode()`, or configure it in the SEO plugin's schema settings.

### Example B: Service page title, H1 and canonical (DrVet service page)
**Before:** a generic or duplicated title, several H1s, and no canonical.
```html
<title>Services - DrVet</title>
<h1>DrVet</h1>
<h1>Pet Dental Care</h1>
```
**After:** a unique, descriptive title of about 60 characters or less, a clear meta description, a single H1, and a self-referencing canonical.
```html
<title>Pet Dental Care for Cats &amp; Dogs | DrVet Animal Hospital</title>
<meta name="description" content="Routine dental check-ups, scaling and polishing for cats and dogs. Ask our team about at-home dental care and book through our enquiry form.">
<link rel="canonical" href="https://drvet.ae/[service-path]/">
<h1>Pet Dental Care</h1>
```
**In WordPress:** set the title and description per page in the SEO plugin. Make the theme print the post title as the only `<h1>` and demote the logo to a non-heading element.

## 5. What I did **not** do
- No automated crawling, scanning or load testing of the live sites.
- No audit scores, rankings or traffic figures were invented. Every number in this document must come from a tool run you can screenshot.
