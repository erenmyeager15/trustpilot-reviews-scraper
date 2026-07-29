import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    MAX_COMPANIES_PER_RUN,
    MAX_REVIEWS_PER_COMPANY,
    buildReviewPageUrl,
    classifyRunOutcome,
    collectCompanySlugs,
    normalizeCompanyTarget,
    normalizeMaxReviewsPerCompany,
    reviewMatchesStarFilter,
    wasRecordSaved,
} from '../dist/run-config.js';
import { parseReview } from '../dist/routes.js';

assert.equal(normalizeCompanyTarget(' WWW.NIKE.COM/ '), 'nike.com');
assert.equal(normalizeCompanyTarget('https://www.trustpilot.com/review/Nike.com?sort=recency'), 'nike.com');
assert.throws(() => normalizeCompanyTarget('https://example.com/review/nike.com'), /Only Trustpilot/);
assert.throws(() => normalizeCompanyTarget('nike.com?stars=5'), /Invalid Trustpilot/);
assert.throws(() => normalizeCompanyTarget('https://www.trustpilot.com/review/%E0%A4%A'), /Invalid encoded/);

assert.deepEqual(
    collectCompanySlugs(['nike.com', 'www.nike.com'], ['https://www.trustpilot.com/review/nike.com']),
    ['nike.com'],
);
assert.throws(
    () => collectCompanySlugs(Array.from({ length: MAX_COMPANIES_PER_RUN + 1 }, (_, i) => `company-${i}.com`), []),
    /At most 50/,
);
assert.throws(() => collectCompanySlugs('nike.com', []), /companyNames must be an array/);

assert.equal(normalizeMaxReviewsPerCompany(undefined), 1);
assert.equal(normalizeMaxReviewsPerCompany(0), 0);
assert.equal(normalizeMaxReviewsPerCompany(MAX_REVIEWS_PER_COMPANY), MAX_REVIEWS_PER_COMPANY);
assert.throws(() => normalizeMaxReviewsPerCompany(MAX_REVIEWS_PER_COMPANY + 1), /must be an integer/);

assert.equal(buildReviewPageUrl('nike.com', 'most_recent', 'all', 1), 'https://www.trustpilot.com/review/nike.com?sort=recency');
assert.equal(buildReviewPageUrl('nike.com', 'most_relevant', '5', 2), 'https://www.trustpilot.com/review/nike.com?stars=5&page=2');
assert.equal(buildReviewPageUrl('nike.com', 'lowest_rated', 'all', 1), 'https://www.trustpilot.com/review/nike.com?stars=1');
assert.match(buildReviewPageUrl('nike.com?stars=5', 'most_relevant', 'all', 1), /nike.com%3Fstars%3D5/);

assert.equal(reviewMatchesStarFilter({ starRating: 1 }, 'lowest_rated', 'all'), true);
assert.equal(reviewMatchesStarFilter({ starRating: 5 }, 'most_recent', '1'), false);
assert.equal(reviewMatchesStarFilter({ starRating: null }, 'most_recent', 'all'), true);

assert.equal(wasRecordSaved({ chargedCount: 1, eventChargeLimitReached: true }), true);
assert.equal(wasRecordSaved({ chargedCount: 0, eventChargeLimitReached: false }), true);
assert.equal(wasRecordSaved({ chargedCount: 0, eventChargeLimitReached: true }), false);

assert.equal(classifyRunOutcome({ parsedCompanyCount: 1, savedReviewCount: 1, spendingLimitReached: false }, 0), 'results');
assert.equal(classifyRunOutcome({ parsedCompanyCount: 1, savedReviewCount: 0, spendingLimitReached: false }, 0), 'empty');
assert.equal(classifyRunOutcome({ parsedCompanyCount: 1, savedReviewCount: 0, spendingLimitReached: true }, 0), 'budget-limited');
assert.throws(() => classifyRunOutcome({ parsedCompanyCount: 0, savedReviewCount: 0, spendingLimitReached: false }, 2), /Failed requests: 2/);

assert.equal(parseReview({ title: 'Missing ID' }, 'Nike', 'https://www.trustpilot.com/review/nike.com'), null);
const parsedReview = parseReview(
    { id: 'abc123', rating: 4, title: 'Good', text: 'Useful', dates: { publishedDate: '2026-07-01' } },
    'Nike',
    'https://www.trustpilot.com/review/nike.com',
);
assert.equal(parsedReview?.reviewId, 'abc123');
assert.equal(parsedReview?.reviewUrl, 'https://www.trustpilot.com/reviews/abc123');

const actor = JSON.parse(readFileSync(new URL('../.actor/actor.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../INPUT_SCHEMA.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/routes.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

assert.equal(actor.pricingInfo.pricingPerEvent.actorChargeEvents['review-scraped'].eventPriceUsd, 0.001);
assert.equal(actor.defaultRunOptions.memoryMbytes, 1024);
assert.equal(actor.defaultRunOptions.timeoutSecs, 900);
assert.equal(schema.properties.companyNames.maxItems, 50);
assert.equal(schema.properties.companyUrls.maxItems, 50);
assert.equal(schema.properties.maxReviewsPerCompany.maximum, 10000);
assert.match(source, /savedReviewIds/);
assert.match(source, /review rows without stable IDs/);
assert.doesNotMatch(source, /Math\.random/);
assert.match(main, /classifyRunOutcome/);
assert.match(main, /maxConcurrency: 2/);
assert.match(main, /resourceType === 'image'/);
assert.match(main, /resourceType === 'media'/);
assert.match(main, /resourceType === 'font'/);
assert.doesNotMatch(main, /Trustpilot crawl stopped because the charge limit was reached/);

console.log('Trustpilot audit checks passed.');
