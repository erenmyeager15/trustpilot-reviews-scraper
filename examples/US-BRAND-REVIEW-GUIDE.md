# Brand review comparison checklist for US CX teams

Use existing public Trustpilot outputs for a transparent, limited-sample brand
research report. This is an external/manual reporting guide, not a new sentiment
model, an automatic alerting feature, or a measured customer-satisfaction score.

[Open the brand research starter](https://apify.com/fascinating_lentil/trustpilot-reviews-scraper/examples/us-brand-review-research)
or use [the saved input](us-brand-review-research.json). Nike and Adidas are
illustrative global brand pages, not endorsements or evidence of US reviewers.
The starter is not newly live tested as part of this documentation package.

## Before collection

- Choose the correct company domain/Trustpilot review slug. US-first describes
  the buyer, not the geographic population of reviews. No reviewer-country
  filter or independently verified customer identity is available.
- Begin with a small sample. The starter requests up to ten most-recent reviews
  for each of two brands, all star ratings, verified-only off, proxy off, 1024 MB.
  Output counts are limits, not guarantees. Keep the same settings when comparing
  brands; a lowest-rated or one-star-only sample is deliberately biased.
- Twenty saved reviews incur $0.02005 in current listed events; $0.02030 after
  the existing Actor-start change on 23 October 2026 at 21:20 UTC (24 October at
  02:50 IST). Review pricing remains $1/1,000. There is no company-check fee.
  These are listed fees, not measured operating costs or profitability.

## Keep the source evidence

Save the input, run ID, collection date, full review CSV/JSON and the separate
`OUTPUT` and `COMPANIES` key-value-store records. The default dataset is reviews
only. Company summaries can be saved for parsed pages even when no reviews match
the filters; absence of review rows alone does not prove no company reviews.

Read `OUTPUT.partial`, `failedRequestCount`, `coverageWarnings`, saved counts and
`spendingLimitReached`. Blocked/partial/capped samples cannot support exhaustive
counts or an assertion that a company had no negative feedback. A successful
run can be empty or partial; retain its diagnostics.

The old output-schema link for `COMPANY_CHECKS` can legitimately be absent:
the canceled company-check event is not active, so its legacy ledger is not
created. Do not treat that missing record as a fee or run failure. Use `OUTPUT`
for active pricing/coverage and `COMPANIES` for company summaries.

## Prepare your comparison table

1. Use the full review export or explicitly select fields. The existing Reviews
   view omits `companyUrl`, `replyStatus`, `replyLatencyHours` and
   `reviewUpdatedDate`; it does not contain the separate company summaries.
2. Retain `companyUrl`, `reviewId`, `reviewUrl` and `scrapedAt`. Normalize the
   company page to its `/review/<domain-or-slug>` path, removing query parameters,
   when joining to `COMPANIES.trustpilotUrl`. Do not join on display name/title.
3. For each brand, record collection time, filters, requested cap, saved sample
   size, coverage warnings and source URLs. Calculate sample star statistics
   only from known valid ratings and disclose how many were usable.
4. Keep `COMPANIES.overallTrustScore`, `totalReviewCount` and rating distribution
   separate from sample statistics. A ten-review average is not the overall
   TrustScore or representative satisfaction estimate. Do not rank brands from
   small unequal samples or describe public reviews as verified US customers.
5. Manually review themes using the source evidence, or choose a separate lawful
   analysis tool. The Actor does not generate sentiment labels, topic clusters,
   customer-contact lists, scored rankings or rendered reports.

## Observed replies, not first-response SLAs

`replyStatus = replied` means reply text was exposed. `no_reply_observed` means
no reply text was exposed in the saved row, not that support ignored the person.
Retain `companyReply`, `companyReplyDate` and `reviewPostedDate` together.

`replyLatencyHours` compares exposed review/reply publication timestamps. It is
null when timestamps are missing, invalid or reversed. A known zero is different
from null. Edited/replaced replies can make this unsuitable as first-response
evidence; do not use it as a verified staff-performance metric or SLA.

Distinguish `dateOfExperience`, `reviewPostedDate`, `reviewUpdatedDate` and
`scrapedAt`. A verified flag is an observed source label, not independent purchase
verification; false can mean the source exposed no verified label. Keep missing
ratings, dates and counts unknown rather than filling them with zero.

## Optional repeat comparison

No persistent watchlist, automatic diff or schedule is created by the starter.
If you separately choose another run, retain the previous export externally.
Deduplicate and match by company identity and `reviewId` before comparing known
rating/text/reply fields. Preserve update and collection times in the report.

The same review may be saved and charged again on a later run; external
deduplication is not a billing refund. Absence from a new capped sample does not
prove deletion. Never infer reputation improvement solely because fewer negative
reviews appeared after changing filters, sample size or source availability.

## Share responsibly

Share aggregate observations with coverage, sample size and source URLs, not
unsupported claims about all customers or US audiences. Public review text can
contain personal information: minimize retention, restrict access and review
what you share. Respect source terms, privacy and content rights. No customer
messages, automated replies, schedule or private support-system access is
created by this package. Explicit proxy settings remain supported, but paid
fallback is never silently enabled to fill a missing field.
