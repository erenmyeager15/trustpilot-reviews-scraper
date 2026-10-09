# Promotion Notes

Use these notes for lightweight, feedback-first promotion. Keep claims tied to public Trustpilot pages and verified Actor output.

## Pricing and release checkpoint — 10 October 2026

Actor Start is currently $0.00005 and its approved increase to $0.00030 is
scheduled for October 24, 2026 at 02:50 IST. Reviews remain $1/1,000 and there
is no company-check fee. Always direct users to the live Pricing tab.
The optimized no-proxy release has passed local checks and a one-review cloud
verification. Check the live build before advertising no-proxy as the public
default. Do not claim the projected 28.38% one-review future-price margin as
verified customer profitability; it is an estimate from one owner test.

## YouTube tutorial ideas

- Trustpilot Reviews Scraper: export public reviews to CSV in one Apify run
- How to collect recent Trustpilot reviews for brand monitoring
- Scrape Trustpilot ratings and company replies without manual copy-paste

## Short tutorial script

1. Open the Actor page.
2. Enter one company domain, for example `nike.com`.
3. Start with one company and `maxReviewsPerCompany: 1`. Check the active Pricing tab: current review-only pricing costs $0.00105 at 1 GB for one saved review. Apify support confirmed cancellation of the scheduled company-check fee; the 9 October live check shows no upcoming company-check charge.
4. Review the proxy configuration shown by the selected public build. The optimized release uses direct access by default and never silently switches to Residential traffic.
5. Run the Actor and open the Reviews dataset view.
6. Export to CSV or connect the dataset to a spreadsheet or BI workflow.

## Social post draft

I polished my Trustpilot Reviews Scraper on Apify.

It collects public Trustpilot review rows from company domains or review URLs: rating, title, review text, dates, verified flag, useful count, company replies, review URL, and timestamps. The candidate release also stores company-level rating summaries when a valid company page is parsed, even if no reviews match the filters.

Useful for brand monitoring, competitor research, support reporting, and sentiment-analysis workflows.

Feedback welcome on the README, sample input, and output fields.

## SEO keywords

- Trustpilot scraper
- Trustpilot reviews scraper
- customer review scraper
- review monitoring
- brand reputation monitoring
- competitor review analysis
- sentiment analysis dataset

## Guardrails

- Do not claim official Trustpilot API access.
- Do not claim private, account-only, or reviewer profile data.
- Do not promise sentiment scoring; this Actor provides structured public review data for downstream analysis.
- Do not promote it as a spam, lead-generation, harassment, or profiling tool.
- Describe the selected public build's actual proxy default. Direct browser access was tested in the held candidate; do not promise it works from every network.
- Do not promote the withdrawn company-check pricing. Apify support confirmed cancellation, and the 9 October live check shows no upcoming company-check fee. Always direct users to the live Pricing tab. Do not claim profitability at the retained review-only price based on tests of the withdrawn fee.
