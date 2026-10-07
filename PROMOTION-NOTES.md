# Promotion Notes

Use these notes for lightweight, feedback-first promotion. Keep claims tied to public Trustpilot pages and verified Actor output.

## YouTube tutorial ideas

- Trustpilot Reviews Scraper: export public reviews to CSV in one Apify run
- How to collect recent Trustpilot reviews for brand monitoring
- Scrape Trustpilot ratings and company replies without manual copy-paste

## Short tutorial script

1. Open the Actor page.
2. Enter one company domain, for example `nike.com`.
3. Start with one company and `maxReviewsPerCompany: 1`. Check the active Pricing tab: the candidate release costs $0.04105 at 1 GB for one company and one saved review, including the $0.04 company check.
4. Keep Residential proxy enabled.
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
- Mention Residential proxy when discussing reliability.
- Do not advertise the candidate pricing or 1 GB default as live until activated. Disclose the company-check fee, which applies to initiated blocked or empty checks too; a low review limit does not remove it.
