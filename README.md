# Trustpilot Reviews Scraper

Scrape public Trustpilot company reviews and rating signals without a Trustpilot login or API key. Provide company domains such as `nike.com` or full Trustpilot review URLs and receive structured review rows for brand monitoring, competitor research, support analysis, and reporting.

The Actor uses a browser with proxy support because Trustpilot can present anti-bot challenges. It saves review records to the default dataset and saves company-level summary data to a separate `companies` dataset when a review is successfully collected.

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
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
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
- Scraped timestamp

### Company summary rows

Company summaries are written to the named `companies` dataset after the first review is saved for that company. They include:

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
  "reviewId": "6a37bb580ae7470586456bb9",
  "companyName": "Nike",
  "companyUrl": "https://www.trustpilot.com/review/nike.com?sort=recency",
  "starRating": 1,
  "reviewTitle": "I am extremely disappointed with my...",
  "reviewBody": "I am extremely disappointed with my experience with Nike...",
  "dateOfExperience": "2026-06-21T00:00:00.000Z",
  "reviewPostedDate": "2026-06-21T12:22:16.000Z",
  "verifiedPurchase": false,
  "usefulCount": 0,
  "companyReply": null,
  "companyReplyDate": null,
  "reviewUrl": "https://www.trustpilot.com/reviews/6a37bb580ae7470586456bb9",
  "scrapedAt": "2026-06-21T18:25:13.289Z"
}
```

Review text, ratings, counts, and reply data can change when Trustpilot updates the page or the reviewer/company edits content.

## Input

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `companyNames` | array | `["nike.com"]` | Company domains or names. The Actor builds the Trustpilot review URL automatically. |
| `companyUrls` | array | `[]` | Full Trustpilot company review URLs. |
| `maxReviewsPerCompany` | integer | `1` | Maximum reviews to save per company. Use `0` only when you intentionally want all available pages. |
| `sortBy` | string | `most_recent` | `most_recent`, `most_relevant`, or `lowest_rated`. |
| `filterByRating` | string | `all` | `all`, `5`, `4`, `3`, `2`, or `1`. |
| `verifiedOnly` | boolean | `false` | Save only reviews marked verified by Trustpilot. |
| `proxyConfiguration` | object | Residential Apify Proxy | Proxy settings for browser requests. Residential proxies are recommended. |

Provide at least one company domain/name or one full Trustpilot review URL. Start with `maxReviewsPerCompany: 1` to confirm output and cost before scaling.

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
| Actor start | $0.00005 per GB of memory |
| Each successfully saved `review-scraped` item | $0.0015 |

The Actor default is 2 GB of memory, so the startup charge is approximately $0.00010 per run. A one-review sample run is therefore approximately $0.00160 before any applicable platform usage, proxy traffic, or account-level charges.

Reviews are charged only when they are successfully saved to the dataset. Blocked or empty runs do not charge `review-scraped` events, and the Actor stops accepting more review work when the user's maximum-cost limit is reached.

## Limits and reliability

- Trustpilot can change page structure or anti-bot behavior.
- Residential proxies are recommended for reliable browser access.
- Very large runs can take longer because the Actor paginates public review pages.
- Company replies, useful counts, and verification labels are returned only when Trustpilot exposes them on the page.
- `lowest_rated` uses the one-star filter when no explicit `filterByRating` is provided.
- Company summaries are stored in a named dataset, while the default dataset stays review-only.

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
    "proxyConfiguration": {
      "useApifyProxy": true,
      "apifyProxyGroups": ["RESIDENTIAL"]
    }
  }'
```

## Responsible use

Use this Actor only for lawful collection of publicly available information. You are responsible for complying with Trustpilot's terms, privacy laws, consumer-review rules, and regulations that apply to your use case.

Do not use the output for spam, harassment, profiling, or unlawful collection of personal data. This Actor is an independent tool and is not affiliated with, endorsed by, or sponsored by Trustpilot.

## License

Apache-2.0.
