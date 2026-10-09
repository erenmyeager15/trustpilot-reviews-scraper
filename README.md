# Trustpilot Reviews Scraper

Scrape public Trustpilot company reviews and rating signals without a Trustpilot login or API key. Provide company domains or Trustpilot review slugs such as `nike.com`, or full Trustpilot review URLs, and receive structured review rows for brand monitoring, competitor research, support analysis, and reporting.

Current pricing: **$1 per 1,000 successfully saved reviews + $0.00005 per Actor Start event**. The start fee is scheduled to become **$0.00030 on 24 October 2026 at 02:50 IST**; review pricing and included platform usage stay unchanged. Apify support confirmed cancellation of the former $0.04/company-check proposal, and the company-check event has been removed from the manifest. The live Apify Pricing tab remains authoritative.

The Actor uses a browser because Trustpilot can present anti-bot challenges. Direct access is the default to control cost; proxy settings remain available when a user explicitly needs them. The Actor never silently switches a run to Residential traffic. It saves reviews to the default dataset and parsed company summaries to the current run's `COMPANIES` key.

## Quick start

Run one company with one recent review:

```json
{
  "companyNames": ["nike.com"],
  "companyUrls": [],
  "maxReviewsPerCompany": 1,
  "sortBy": "most_recent",
  "filterByRating": "all",
  "verifiedOnly": false,
  "proxyConfiguration": { "useApifyProxy": false }
}
```

Export results as JSON, CSV, Excel, XML, or HTML, or consume them through the Apify API, schedules, webhooks, Make, Zapier, n8n, and other integrations.

## What it extracts

### Review rows

- Review ID and direct Trustpilot review URL
- Company name and source company page URL
- Star rating
- Review title and review body
- Date of experience and review posted date
- Verified-review flag
- Useful count when shown
- Company reply text and reply date when present
- Observed reply status, reply latency in hours and the review's update date when available
- Scraped timestamp

### Company summary rows

Company summaries are written to the current run's `COMPANIES` key after a valid company page is parsed, even when no reviews match the requested filters. They include:

- Company name, domain, Trustpilot URL, and website URL
- Overall TrustScore and star rating
- Total review count
- Rating distribution percentages
- Claimed status and category when available
- Scraped timestamp

## Output dataset

The default dataset is intentionally a clean list of reviews. The `Reviews` view includes the fields most users need for spreadsheet, BI, API, and sentiment-analysis workflows.

### Verified review sample

This shortened sample comes from a successful public Actor run:

```json
{
  "reviewId": "6a2935848b5c27d1ace126be",
  "companyName": "Netflix",
  "companyUrl": "https://www.trustpilot.com/review/netflix.com",
  "starRating": 5,
  "reviewTitle": "Legends",
  "reviewBody": "Legends - just finished the series and WOW! Great true story and amazing acting!",
  "dateOfExperience": "2026-06-10T00:00:00.000Z",
  "reviewPostedDate": "2026-06-10T11:59:32.000Z",
  "verifiedPurchase": false,
  "usefulCount": 0,
  "companyReply": null,
  "companyReplyDate": null,
  "reviewUrl": "https://www.trustpilot.com/reviews/6a2935848b5c27d1ace126be",
  "scrapedAt": "2026-06-10T17:49:53.800Z"
}
```

Review text, ratings, counts, and reply data can change when Trustpilot updates the page or the reviewer/company edits content.

## Input

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `companyNames` | array | `["nike.com"]` | Company domains or Trustpilot review slugs. The Actor builds the review URL automatically. |
| `companyUrls` | array | `[]` | Full Trustpilot company review URLs. |
| `maxReviewsPerCompany` | integer | `1` | Maximum reviews to save per company. Use `0` only when you intentionally want all available pages. |
| `sortBy` | string | `most_recent` | `most_recent`, `most_relevant`, or `lowest_rated`. |
| `filterByRating` | string | `all` | `all`, `5`, `4`, `3`, `2`, or `1`. |
| `verifiedOnly` | boolean | `false` | Save only reviews marked verified by Trustpilot. |
| `proxyConfiguration` | object | No proxy | Optional browser proxy settings. The Actor honors your selection and never silently upgrades it to Residential traffic. |

Provide at least one company domain, Trustpilot review slug, or full Trustpilot review URL. Duplicate targets are removed before scraping, and each run accepts up to 50 unique companies. Start with one company and review the live price before scaling.

## Common workflows

### Monitor recent negative feedback

Set `sortBy` to `most_recent` and `filterByRating` to `1` to collect the newest one-star reviews for a brand or competitor.

### Compare competitors

Pass several company domains and compare TrustScore, star distribution, review volume, and recent review themes.

### Feed sentiment analysis

Export review titles, bodies, ratings, dates, and company replies to a spreadsheet, database, or NLP pipeline.

### Build support reports

Use recurring runs to watch new public reviews and route the dataset to a BI dashboard or workflow tool.

## Pricing

This Actor uses Pay Per Event pricing.

| Event | Price |
| --- | ---: |
| Actor start | $0.00005 currently; $0.00030 from 24 October 2026 at 02:50 IST. One event through 1 GB, then one per additional GB. |
| Each successfully saved `review-scraped` item | $0.001 |

At the 1 GB default, event charges are:

| One company, one run | Current total | From 24 October 2026 |
| --- | ---: | ---: |
| 1 saved review | $0.00105 | $0.00130 |
| 25 saved reviews | $0.02505 | $0.02530 |
| 100 saved reviews | $0.10005 | $0.10030 |
| No matching reviews | $0.00005 | $0.00030 |

Apify support confirmed cancellation of the company-check addition previously scheduled for 21 October 2026. It will not take effect. At retained review-only pricing, blocked or empty attempts incur no review or company-check event charge; the small Actor-start charge still applies. No `COMPANY_CHECKS` ledger is created for the nonexistent fee; backward-compatible billing code uses it only if an active pricing configuration actually registers that event. Standard PPE runs include platform usage; any separate account subscription remains outside these event examples.

Reviews are charged only when they are successfully saved to the dataset. Blocked or empty runs do not charge `review-scraped` events; the Actor-start charge still applies. The Actor checks its effective event prices and remaining budget before opening another company. All advertised features remain available to free-plan users within their balance and selected spending limit; there is no paid-plan feature gate.

During a platform pricing transition, the code follows each run's active event prices. It does not invent or manually charge an unregistered event. `OUTPUT.billing.mode` distinguishes the previous review-only pricing from the company-check pricing.

## Limits and reliability

- Trustpilot can change page structure or anti-bot behavior.
- Direct browser access is the cost-controlled default. Source blocking can vary by network; select a proxy explicitly only when needed.
- Image, media, and font downloads are blocked and concurrency is bounded. The live cloud default verified on 9 October 2026 is 1 GB; a smaller browser allocation has not been validated.
- Very large runs can take longer because the Actor paginates public review pages.
- Each run accepts at most 50 unique companies and 10,000 reviews per company. Use smaller batches for more predictable completion times.
- Company replies, useful counts, and verification labels are returned only when Trustpilot exposes them on the page.
- `lowest_rated` uses the one-star filter when no explicit `filterByRating` is provided.
- A valid company page with no reviews matching the selected filters finishes successfully with an empty default dataset; blocked or unparseable pages still fail visibly.
- Company summaries are stored in the current run's `COMPANIES` key, while the default dataset stays review-only.

## API example

```bash
curl -X POST "https://api.apify.com/v2/acts/fascinating_lentil~trustpilot-reviews-scraper/runs?token=YOUR_APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyNames": ["nike.com"],
    "companyUrls": [],
    "maxReviewsPerCompany": 1,
    "sortBy": "most_recent",
    "filterByRating": "all",
    "verifiedOnly": false,
    "proxyConfiguration": { "useApifyProxy": false }
  }'
```

## Responsible use

### Reply timing and coverage

The live default verified on 9 October 2026 is 1024 MB with one browser page processed at a time. A browser is still required; 256/512 MB is not a validated configuration. Local tests and pricing projections do not establish future customer-run profitability.

The collector skips images, fonts, stylesheets, known analytics hosts and Trustpilot's Next.js UI scripts, while keeping document requests and challenge traffic. It reads the embedded review JSON rather than relying on the interactive page UI. This traffic reduction requires cloud validation; it is not a guarantee of lower cost or successful access on every run.

For additional pages, the candidate implementation derives a JSON pagination URL from the first page's build metadata and retains the requested filters. It uses the existing browser session, validates company identity and review IDs, and falls back to normal navigation after one unsuccessful JSON attempt per company. `OUTPUT.jsonPageAttempts` and `OUTPUT.jsonPagesAccepted` expose whether this path worked. Live availability and savings remain unverified; the initial browser page is still required, so this does not solve one-review run costs.

Rows include `replyStatus`, `replyLatencyHours`, and `reviewUpdatedDate`. Reply latency compares the source's review publication and reply publication timestamps; missing or reversed timestamps produce `null`. It is not a measurement of the company's first response if the source has replaced or edited a reply.

Company summaries are stored in the current run's `COMPANIES` key, not a shared named dataset. The `OUTPUT` key reports failed requests and coverage warnings. Pagination stops at repeated pages, 100 pages per company, or a per-company processing safety limit; a partial result is not an exhaustive export.

Use this Actor only for lawful collection of publicly available information. You are responsible for complying with Trustpilot's terms, privacy laws, consumer-review rules, and regulations that apply to your use case.

Do not use the output for spam, harassment, profiling, or unlawful collection of personal data. This Actor is an independent tool and is not affiliated with, endorsed by, or sponsored by Trustpilot.

## License

Apache-2.0.
