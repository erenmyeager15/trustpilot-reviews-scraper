# Trustpilot Reviews Scraper - Ratings, Replies & Insights

Scrape **Trustpilot company reviews** at scale - no login, no API key, no cookies required. Extract star ratings, full review text, dates, company replies, and overall TrustScores from any company page on Trustpilot. Export results to **JSON, CSV, Excel, or HTML**, or pull them through the Apify API.

Perfect for **brand monitoring, competitor analysis, sentiment analysis, reputation monitoring, and market research**.

## Features

- ✅ **No login or API key** - works straight out of the box
- ✅ **Bypasses anti-bot protection** - handles Trustpilot's browser challenge automatically
- ✅ **Multiple companies per run** - pass a list of domains or Trustpilot URLs
- ✅ **Complete review data** - rating, title, body, dates, company reply
- ✅ **Company insights** - TrustScore, star rating, total reviews, full star distribution
- ✅ **Filter & sort** - by star rating, most recent / most relevant, verified only
- ✅ **Automatic pagination** - scrape from a handful of reviews up to thousands
- ✅ **Clean structured output** - ready for spreadsheets, BI tools, or NLP pipelines

## What it extracts

### Company record
- Company name, domain, and Trustpilot URL
- Overall TrustScore and average star rating
- Total review count
- Full rating distribution (1-5 star percentages)
- Claimed status, category, and official website

### Review record
- Star rating, title, and full review body
- Date of experience and date posted
- Verified status
- Useful/likes count
- Company reply text and reply date
- Direct review URL and unique review ID

## Input

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `companyNames` | `string[]` | Company domains/names, e.g. `"netflix.com"` | `["netflix.com"]` |
| `companyUrls` | `string[]` | Full Trustpilot URLs, e.g. `"https://www.trustpilot.com/review/netflix.com"` | `[]` |
| `maxReviewsPerCompany` | `integer` | Max reviews per company (`0` = all available) | `20` |
| `sortBy` | `string` | `most_recent`, `most_relevant`, or `lowest_rated` | `most_recent` |
| `filterByRating` | `string` | `all`, `5`, `4`, `3`, `2`, or `1` | `all` |
| `verifiedOnly` | `boolean` | Only keep verified reviews | `false` |
| `proxyConfiguration` | `object` | Proxy settings (residential recommended) | Apify Residential |

### Example input

```json
{
    "companyNames": ["netflix.com", "spotify.com"],
    "maxReviewsPerCompany": 100,
    "sortBy": "most_recent",
    "filterByRating": "all",
    "verifiedOnly": false,
    "proxyConfiguration": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"] }
}
```

## Sample output

### Company

```json
{
    "companyName": "Netflix",
    "domain": "www.netflix.com",
    "trustpilotUrl": "https://www.trustpilot.com/review/netflix.com",
    "overallTrustScore": 1.5,
    "starRating": 1.5,
    "totalReviewCount": 13922,
    "fiveStarPercent": 9,
    "fourStarPercent": 5.5,
    "threeStarPercent": 6.5,
    "twoStarPercent": 10.4,
    "oneStarPercent": 68.6,
    "claimedStatus": true,
    "category": "Hobby Store, Movie Streaming Service",
    "websiteUrl": "https://www.netflix.com",
    "scrapedAt": "2026-06-10T17:29:45.193Z",
    "type": "company"
}
```

### Review

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
    "scrapedAt": "2026-06-10T17:29:45.334Z",
    "type": "review"
}
```

The dataset includes two ready-made views in the Apify console: **Reviews** and **Companies**.

## Pricing

This Actor uses **pay-per-result** pricing:

| Event | Price |
|-------|-------|
| Per review scraped | **$0.0015** ($1.50 / 1,000 reviews) |

You are only charged for reviews actually extracted - never for blocked or empty runs. Apify platform usage and proxy traffic are billed separately by Apify.

## Use cases

- **Brand & reputation monitoring** - track what customers say about your business
- **Competitor analysis** - benchmark TrustScores and review sentiment against rivals
- **Sentiment analysis & NLP** - feed clean review text into ML pipelines
- **Market research** - surface recurring complaints and praise across an industry
- **Reputation monitoring** - track review volume and ratings by category over time

## How to Scrape Trustpilot Reviews (Step by Step)

1. Click **Try for free** / **Run**.
2. Enter one or more company domains in `companyNames` (e.g. `netflix.com`) or paste full Trustpilot URLs into `companyUrls`.
3. Set `maxReviewsPerCompany` (start small to test, or use `0` for all available reviews).
4. Optionally set `sortBy`, `filterByRating`, or `verifiedOnly` to focus the results.
5. Run the Actor, then export results as JSON, CSV, Excel, or HTML, or pull them via the Apify API.

## Tips

- Trustpilot uses anti-bot protection - keep **residential proxies** enabled for the most reliable results.
- Use `maxReviewsPerCompany: 0` to scrape every available review, or set a small number for quick samples.
- Combine `filterByRating: "1"` with `sortBy: "most_recent"` to monitor the newest negative feedback.

## Responsible Use

This Actor is intended for lawful collection of publicly available information only. Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.

## License

Apache-2.0
