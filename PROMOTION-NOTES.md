# Promotion Notes

Use these notes for lightweight, feedback-first promotion. Keep claims tied to public Trustpilot pages and verified Actor output.

## YouTube tutorial ideas

- Trustpilot Reviews Scraper: export public reviews to CSV in one Apify run
- How to collect recent Trustpilot reviews for brand monitoring
- Scrape Trustpilot ratings and company replies without manual copy-paste

## Short tutorial script

1. Open the Actor page.
2. Enter one company domain, for example `nike.com`.
3. Keep `maxReviewsPerCompany` at `1` for a cheap sample.
4. Keep Residential proxy enabled.
5. Run the Actor and open the Reviews dataset view.
6. Export to CSV or connect the dataset to a spreadsheet or BI workflow.

## Social post draft

I polished my Trustpilot Reviews Scraper on Apify.

It collects public Trustpilot review rows from company domains or review URLs: rating, title, review text, dates, verified flag, useful count, company replies, review URL, and timestamps. It also stores company-level rating summary data when a review is collected.

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
- Mention Residential proxy when discussing reliability.
