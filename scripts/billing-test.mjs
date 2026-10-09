import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CompanyCheckBilling, COMPANY_CHECK_EVENT, REVIEW_SCRAPED_EVENT } from '../dist/billing.js';
import { classifyRunOutcome, collectCompanySlugs } from '../dist/run-config.js';

function fixture({ budget = Infinity, ppe = true, prices = { [COMPANY_CHECK_EVENT]: 0.04,
  [REVIEW_SCRAPED_EVENT]: 0.001, 'apify-actor-start': 0.00005 }, records = {}, counts = {},
  chargeFailure = false, persistFailure = 0, resultCount = 1 } = {}) {
  let calls = 0, stores = 0;
  const persisted = [];
  const state = { 'apify-actor-start': 1, ...counts };
  const remaining = () => budget - Object.entries(prices).reduce((sum, [event, price]) => sum + price * (state[event] ?? 0), 0);
  const canCharge = (event) => prices[event] > 0 ? Math.max(0, Math.floor(Number((remaining() / prices[event]).toFixed(4)))) : Infinity;
  const billing = new CompanyCheckBilling({
    runId: 'fixture-run',
    pricing: () => ({ isPayPerEvent: ppe, maxTotalChargeUsd: budget, perEventPrices: prices }),
    chargedCount: (event) => state[event] ?? 0, canCharge,
    chargeCompany: async () => {
      calls++;
      if (chargeFailure) throw new Error('Network outcome uncertain');
      if (resultCount === 1) state[COMPANY_CHECK_EVENT] = (state[COMPANY_CHECK_EVENT] ?? 0) + 1;
      return { chargedCount: resultCount, eventChargeLimitReached: canCharge(COMPANY_CHECK_EVENT) === 0 };
    },
    persist: async (value) => {
      stores++;
      if (stores === persistFailure) throw new Error('Store unavailable');
      persisted.push(structuredClone(value));
    },
  }, records);
  return { billing, state, persisted, calls: () => calls, prices,
    chargeReviews: (count) => { assert.ok(canCharge(REVIEW_SCRAPED_EVENT) >= count); state[REVIEW_SCRAPED_EVENT] = (state[REVIEW_SCRAPED_EVENT] ?? 0) + count; } };
}

test('a company is charged once despite repeated authorization/retry', async () => {
  const f = fixture();
  assert.equal(await f.billing.authorize('nike.com'), true);
  assert.equal(await f.billing.authorize('nike.com'), true);
  assert.equal(f.calls(), 1);
  assert.equal(f.persisted[0]['nike.com'].status, 'charging');
  assert.equal(f.persisted.at(-1)['nike.com'].status, 'authorized');
});
test('duplicate domain and full-URL inputs have one opening fee', async () => {
  const f = fixture();
  const slugs = collectCompanySlugs(['WWW.NIKE.COM/', 'nike.com'], ['https://www.trustpilot.com/review/nike.com']);
  for (const slug of slugs) await f.billing.authorize(slug);
  assert.equal(f.calls(), 1);
});
test('concurrent duplicate authorization coalesces into one charge', async () => {
  const f = fixture();
  assert.deepEqual(await Promise.all([f.billing.authorize('nike.com'), f.billing.authorize('nike.com')]), [true, true]);
  assert.equal(f.calls(), 1);
});
test('different companies each have one fee', async () => {
  const f = fixture();
  await f.billing.authorize('nike.com'); await f.billing.authorize('spotify.com');
  assert.equal(f.calls(), 2); assert.equal(f.billing.getSummary().companyChecksCharged, 2);
});
test('new runs do not share a company fee', async () => {
  for (let run = 0; run < 2; run++) { const f = fixture(); await f.billing.authorize('nike.com'); assert.equal(f.calls(), 1); }
});
test('budget below fee causes no charge and no opening authorization', async () => {
  const f = fixture({ budget: 0.02 });
  assert.equal(await f.billing.authorize('nike.com'), false);
  assert.equal(f.calls(), 0); assert.equal(f.persisted.length, 0);
  assert.equal(f.billing.getSummary().spendingLimitReached, true);
});
test('budget covering the fee but not one review causes no fee', async () => {
  const f = fixture({ budget: 0.04005 });
  assert.equal(await f.billing.authorize('nike.com'), false); assert.equal(f.calls(), 0);
});
test('a fractionally underfunded one-review job is not charged', async () => {
  const f = fixture({ budget: 0.0410499 });
  assert.equal(await f.billing.authorize('nike.com'), false); assert.equal(f.calls(), 0);
});
test('exact budget includes the automatically charged Actor start', async () => {
  const f = fixture({ budget: 0.04105 });
  assert.equal(await f.billing.authorize('nike.com'), true);
  assert.equal(f.billing.canSaveReview(), true);
  f.chargeReviews(1); assert.equal(f.billing.canSaveReview(), false);
});
test('company-event limit flag does not block affordable 25 reviews', async () => {
  const f = fixture({ budget: 0.06505 });
  assert.equal(await f.billing.authorize('nike.com'), true);
  assert.equal(f.billing.getSummary().spendingLimitReached, false);
  for (let row = 0; row < 25; row++) { assert.equal(f.billing.canSaveReview(), true); f.chargeReviews(1); }
  assert.equal(f.billing.canSaveReview(), false);
  assert.equal(await f.billing.authorize('spotify.com'), false); assert.equal(f.calls(), 1);
});
test('two-company budget supports both company fees and requested rows', async () => {
  const f = fixture({ budget: 0.08205 });
  assert.equal(await f.billing.authorize('nike.com'), true); f.chargeReviews(1);
  assert.equal(await f.billing.authorize('spotify.com'), true); f.chargeReviews(1);
  assert.equal(f.calls(), 2); assert.equal(f.billing.canSaveReview(), false);
});
test('simultaneous different-company requests cannot spend the same budget', async () => {
  const f = fixture({ budget: 0.04105 });
  assert.deepEqual(await Promise.all([f.billing.authorize('nike.com'), f.billing.authorize('spotify.com')]), [true, false]);
  assert.equal(f.calls(), 1);
});
test('uncertain charge failure never triggers a second charge', async () => {
  const f = fixture({ chargeFailure: true });
  await assert.rejects(f.billing.authorize('nike.com'), /uncertain/);
  await assert.rejects(f.billing.authorize('nike.com'), /second company charge/);
  assert.equal(f.calls(), 1); assert.equal(f.persisted.at(-1)['nike.com'].status, 'billing_uncertain');
});
test('unconfirmed zero-count company charge forbids fetching', async () => {
  const f = fixture({ resultCount: 0 });
  await assert.rejects(f.billing.authorize('nike.com'), /not confirmed/);
  await assert.rejects(f.billing.authorize('nike.com'), /second company charge/);
  assert.equal(f.calls(), 1);
});
test('storage failure before charging does not bill a company', async () => {
  const f = fixture({ persistFailure: 1 });
  await assert.rejects(f.billing.authorize('nike.com'), /Store unavailable/); assert.equal(f.calls(), 0);
});
test('storage failure after a charge does not double bill on retry', async () => {
  const f = fixture({ persistFailure: 2 });
  await assert.rejects(f.billing.authorize('nike.com'), /Store unavailable/);
  assert.equal(await f.billing.authorize('nike.com'), true); assert.equal(f.calls(), 1);
});
test('a persisted pending ledger refuses to charge again after restart', async () => {
  const f = fixture({ records: { 'nike.com': { runId: 'fixture-run', requestedAt: '2026-10-07T00:00:00Z',
    status: 'charging', companyDomain: 'nike.com', feeUsd: 0.04, charged: false } } });
  await assert.rejects(f.billing.authorize('nike.com'), /second company charge/); assert.equal(f.calls(), 0);
});
test('a persisted authorized ledger avoids duplicate billing after restart', async () => {
  const f = fixture({ counts: { [COMPANY_CHECK_EVENT]: 1 }, records: { 'nike.com': {
    runId: 'fixture-run', requestedAt: '2026-10-07T00:00:00Z', status: 'authorized', companyDomain: 'nike.com', feeUsd: 0.04, charged: true } } });
  assert.equal(await f.billing.authorize('nike.com'), true); assert.equal(f.calls(), 0);
});

test('a reused store does not let a new run inherit an old company charge', async () => {
  const f = fixture({ records: { 'nike.com': { runId: 'earlier-run', requestedAt: '2026-10-06T00:00:00Z',
    status: 'authorized', companyDomain: 'nike.com', feeUsd: 0.04, charged: true } } });
  assert.equal(await f.billing.authorize('nike.com'), true); assert.equal(f.calls(), 1);
  assert.equal(f.persisted.at(-1)['nike.com'].runId, 'fixture-run');
});

test('malformed and unconfirmed restored billing records fail closed', () => {
  for (const records of [[], 1, { 'nike.com': null }, { 'nike.com': {} }, { 'nike.com': {
    runId: 'fixture-run', requestedAt: '2026-10-07T00:00:00Z', companyDomain: 'nike.com',
    status: 'authorized', feeUsd: 0.04, charged: false } }]) {
    assert.throws(() => fixture({ records }), /Invalid|identity|confirmed/);
  }
  assert.throws(() => fixture({ records: { 'nike.com': { runId: 'fixture-run', requestedAt: '2026-10-07T00:00:00Z',
    companyDomain: 'nike.com', status: 'authorized', feeUsd: 0.04, charged: true } } }), /disagrees/);
});

test('invalid spending limits never permit a company opening', async () => {
  for (const budget of [NaN, -1, -Infinity]) {
    const f = fixture({ budget });
    await assert.rejects(f.billing.authorize('nike.com'), /Invalid billing budget/); assert.equal(f.calls(), 0);
  }
});
test('legacy pricing does not invent an unregistered company charge', async () => {
  const f = fixture({ prices: { [REVIEW_SCRAPED_EVENT]: 0.001, 'apify-actor-start': 0.00005 }, budget: 0.00105 });
  assert.equal(await f.billing.authorize('nike.com'), true); assert.equal(f.calls(), 0);
  assert.equal(f.persisted.length, 0);
  assert.equal(f.billing.getSummary().mode, 'legacy-pricing'); f.chargeReviews(1);
  assert.equal(f.billing.canSaveReview(), false);
});

test('review-only authorization does not touch a fee ledger or company charge', async () => {
  const f = fixture({ prices: { [REVIEW_SCRAPED_EVENT]: 0.001 }, persistFailure: 1 });
  assert.equal(await f.billing.authorize('nike.com'), true);
  assert.equal(f.billing.getSummary().companyChecksAuthorized, 1);
  assert.equal(f.calls(), 0);
  assert.equal(await f.billing.authorize('nike.com'), true);
  assert.equal(f.persisted.length, 0); assert.equal(f.calls(), 0);
});
test('local unmonetized work and free-plan users are not feature-gated', async () => {
  const f = fixture({ ppe: false, prices: {} });
  assert.equal(await f.billing.authorize('nike.com'), true); assert.equal(f.calls(), 0);
  assert.equal(f.billing.canSaveReview(), true);
  assert.ok(!readFileSync(new URL('../src/billing.ts', import.meta.url), 'utf8').includes('isPaying'));
});
test('negative or invalid active fee is rejected before charging', async () => {
  for (const price of [-1, NaN, Infinity]) {
    const f = fixture({ prices: { [COMPANY_CHECK_EVENT]: price, [REVIEW_SCRAPED_EVENT]: 0.001 } });
    await assert.rejects(f.billing.authorize('nike.com'), /Invalid active billing prices/); assert.equal(f.calls(), 0);
  }
});
test('pre-navigation budget stop is a clean outcome without parsed companies', () => {
  assert.equal(classifyRunOutcome({ parsedCompanyCount: 0, savedReviewCount: 0, spendingLimitReached: true }, 0), 'budget-limited');
  assert.throws(() => classifyRunOutcome({ parsedCompanyCount: 0, savedReviewCount: 0, spendingLimitReached: false }, 1), /No valid/);
  assert.throws(() => classifyRunOutcome({ parsedCompanyCount: 0, savedReviewCount: 0, spendingLimitReached: true }, 1), /No valid/);
  assert.throws(() => classifyRunOutcome({ parsedCompanyCount: 1, savedReviewCount: 0, spendingLimitReached: true }, 1), /not a verified empty/);
});
test('retained pricing cannot reintroduce the canceled company-check fee', () => {
  const manifest = JSON.parse(readFileSync(new URL('../.actor/actor.json', import.meta.url), 'utf8'));
  const events = manifest.pricingInfo.pricingPerEvent.actorChargeEvents;
  assert.equal(events[COMPANY_CHECK_EVENT], undefined);
  assert.deepEqual(Object.keys(events).sort(), ['apify-actor-start', REVIEW_SCRAPED_EVENT].sort());
  assert.equal(events[REVIEW_SCRAPED_EVENT].eventPriceUsd, 0.001);
  assert.equal(events['apify-actor-start'].eventPriceUsd, 0.00005);
  assert.equal(manifest.minMemoryMbytes, 1024);
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const value of ['$1 per 1,000', 'confirmed cancellation', 'COMPANY_CHECKS']) assert.ok(readme.includes(value));
  assert.ok(!/\$0\.04105|\$0\.06505|\$0\.04005/.test(readme));
});
