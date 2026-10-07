import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

// Execute the compiled entry point, hooks, billing and routes together. Only the
// platform/browser boundary is mocked: these tests launch no browser or paid run.
async function simulate({ budget = Infinity, companyNames = ['nike.com'], companyUrls = [],
  maxReviewsPerCompany = 1, filterByRating = 'all', verifiedOnly = false, ppe = true,
  prices = { 'company-check': 0.04, 'review-scraped': 0.001, 'apify-actor-start': 0.00005 },
  navigationFailures = [], blockedAttempts = [], empty = false, malformed = false } = {}) {
  const values = new Map();
  const rows = [];
  const trace = [];
  const counts = { 'apify-actor-start': ppe ? 1 : 0 };
  const stats = { browsers: 0, navigations: 0, checks: 0, aborts: 0, companyLimitFlags: [] };
  let runTask;
  const remaining = () => budget - Object.entries(prices).reduce((sum, [event, price]) => sum + price * (counts[event] ?? 0), 0);
  const capacity = event => !ppe || !prices[event] ? Infinity : Math.max(0, Math.floor(Number((remaining() / prices[event]).toFixed(4))));
  const log = { info() {}, warning() {}, error() {} };
  const Actor = {
    main(fn) { runTask = Promise.resolve().then(fn); return runTask; },
    getInput: async () => ({ companyNames, companyUrls, maxReviewsPerCompany, filterByRating, verifiedOnly }),
    getEnv: () => ({ actorRunId: 'runtime-fixture-run' }),
    getValue: async key => values.get(key) ?? null,
    setValue: async (key, value) => { values.set(key, structuredClone(value)); },
    createProxyConfiguration: async () => ({ mock: true }),
    getChargingManager: () => ({
      getPricingInfo: () => ({ isPayPerEvent: ppe, maxTotalChargeUsd: budget, perEventPrices: prices }),
      getChargedEventCount: event => counts[event] ?? 0,
      calculateMaxEventChargeCountWithinLimit: capacity,
    }),
    charge: async ({ eventName, count }) => {
      assert.equal(eventName, 'company-check'); assert.equal(count, 1);
      assert.ok(ppe && eventName in prices, 'never invent a charge for legacy pricing');
      assert.ok(capacity(eventName) >= 1, 'opening must be funded before charging');
      assert.ok([...Object.values(values.get('COMPANY_CHECKS') ?? {})].some(record => record.status === 'charging'),
        'the opening record must be persisted before the charge');
      counts[eventName] = (counts[eventName] ?? 0) + count;
      stats.checks++; trace.push('company-charge');
      const reached = capacity(eventName) === 0;
      stats.companyLimitFlags.push(reached);
      return { chargedCount: 1, eventChargeLimitReached: reached };
    },
    pushData: async (row, eventName) => {
      assert.equal(eventName, 'review-scraped');
      assert.ok(capacity(eventName) >= 1, 'do not save beyond the review budget');
      rows.push(structuredClone(row)); trace.push('review-save');
      if (ppe) counts[eventName] = (counts[eventName] ?? 0) + 1;
      return { chargedCount: ppe ? 1 : 0, eventChargeLimitReached: ppe && capacity(eventName) === 0 };
    },
  };
  class NonRetryableError extends Error {}
  class PlaywrightCrawler {
    constructor(options) {
      stats.browsers++;
      this.options = options;
      this.stopped = false;
      this.autoscaledPool = { abort: async () => { this.stopped = true; stats.aborts++; } };
      assert.equal(options.maxConcurrency, 1);
    }
    async run(requests) {
      for (const request of requests) {
        if (this.stopped) break;
        for (let attempt = 0; attempt <= this.options.maxRequestRetries; attempt++) {
          let pageNumber = 1;
          const data = () => ({ props: { pageProps: {
            businessUnit: { id: request.userData.slug, displayName: request.userData.slug,
              identifyingName: request.userData.slug, trustScore: 4.3, stars: 4, numberOfReviews: 50 },
            filters: { pagination: { totalPages: 2 } },
            ...(malformed ? {} : { reviews: empty ? [] : Array.from({ length: 20 }, (_, i) => ({
              id: `${request.userData.slug}-${(pageNumber - 1) * 20 + i}`, rating: 4,
              title: 'Fixture review', text: 'Public review fixture body', likes: 0,
              dates: { publishedDate: '2026-10-01T00:00:00Z', experiencedDate: '2026-09-30T00:00:00Z' },
              labels: { verification: { isVerified: true } },
              reply: { message: 'Thanks for the feedback', publishedDate: '2026-10-02T12:00:00Z' },
            })) }),
          } } });
          const page = {
            route: async () => {},
            waitForFunction: async () => {},
            evaluate: async (_fn, target) => target ? null : blockedAttempts.includes(attempt) ? null : JSON.stringify(data()),
            goto: async url => { pageNumber = Number(new URL(url).searchParams.get('page') ?? 1); stats.navigations++; trace.push('page-navigation'); },
          };
          const context = { page, request, log, session: { markBad() {} } };
          try {
            for (const hook of this.options.preNavigationHooks) await hook(context);
            // Crawlee navigates only after the pre-navigation hook succeeds.
            stats.navigations++; trace.push('page-navigation');
            if (navigationFailures.includes(attempt)) throw new Error('Navigation fixture failure');
            await this.options.requestHandler(context);
            break;
          } catch (error) {
            if (!request.noRetry && !(error instanceof NonRetryableError) && attempt < this.options.maxRequestRetries) continue;
            await this.options.failedRequestHandler({ ...context, error });
            break;
          }
        }
      }
    }
  }
  const context = createContext({ URL, URLSearchParams });
  const modules = new Map();
  for (const [name, exports] of [['apify', { Actor, log }], ['crawlee', { NonRetryableError, PlaywrightCrawler }]]) {
    modules.set(name, new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context, identifier: name }));
  }
  const getModule = url => {
    if (!modules.has(url)) modules.set(url, new SourceTextModule(readFileSync(new URL(url), 'utf8'), { context, identifier: url }));
    return modules.get(url);
  };
  const main = getModule(new URL('../dist/main.js', import.meta.url).href);
  await main.link((specifier, referring) => modules.get(specifier) ?? getModule(new URL(specifier, referring.identifier).href));
  await main.evaluate();
  let error;
  try { await runTask; } catch (caught) { error = caught; }
  return { values, rows, counts, stats, trace, error, totalUsd: budget === Infinity
    ? Object.entries(prices).reduce((sum, [event, price]) => sum + price * (counts[event] ?? 0), 0) : budget - remaining() };
}

test('entry point stops an underfunded run before any navigation or company charge', async () => {
  const r = await simulate({ budget: 0.02 });
  assert.equal(r.error, undefined); assert.equal(r.stats.navigations, 0); assert.equal(r.stats.checks, 0);
  assert.equal(r.stats.browsers, 0, 'an unfunded run must not even create the browser crawler');
  const out = r.values.get('OUTPUT');
  assert.equal(out.spendingLimitReached, true); assert.equal(out.failedRequestCount, 0); assert.equal(out.partial, false);
});
test('an exact one-review budget saves complete fields and a company summary', async () => {
  const r = await simulate({ budget: 0.04105 });
  assert.equal(r.error, undefined); assert.equal(r.rows.length, 1); assert.equal(r.stats.checks, 1);
  assert.equal(r.stats.navigations, 1); assert.equal(r.rows[0].replyLatencyHours, 36);
  assert.equal(r.rows[0].reviewBody, 'Public review fixture body');
  assert.equal(r.values.get('COMPANIES').length, 1);
  assert.deepEqual(r.trace, ['company-charge', 'page-navigation', 'review-save']);
  assert.ok(Math.abs(r.totalUsd - 0.04105) < 1e-10);
});
test('a company-event limit does not suppress 25 funded reviews or second-page navigation', async () => {
  const r = await simulate({ budget: 0.06505, maxReviewsPerCompany: 25 });
  assert.equal(r.error, undefined); assert.equal(r.rows.length, 25);
  assert.deepEqual(r.stats.companyLimitFlags, [true]); assert.equal(r.stats.navigations, 2);
  assert.equal(r.values.get('OUTPUT').failedRequestCount, 0); assert.equal(r.values.get('OUTPUT').partial, false);
});
test('duplicate domain and URL input is charged and opened once in the actual entry point', async () => {
  const r = await simulate({ companyNames: ['WWW.NIKE.COM/', 'nike.com'], companyUrls: ['https://www.trustpilot.com/review/nike.com'] });
  assert.equal(r.error, undefined); assert.equal(r.stats.checks, 1); assert.equal(r.stats.navigations, 1);
});
test('a second company is neither charged nor fetched when only the first is funded', async () => {
  const r = await simulate({ budget: 0.04205, companyNames: ['nike.com', 'spotify.com'] });
  assert.equal(r.error, undefined); assert.equal(r.stats.checks, 1); assert.equal(r.stats.navigations, 1);
  assert.deepEqual(r.values.get('OUTPUT').billing.companiesSkippedForBudget, ['spotify.com']);
  assert.equal(r.values.get('OUTPUT').failedRequestCount, 0);
});
test('a two-company budget produces two checks and two reviews without overcharging', async () => {
  const r = await simulate({ budget: 0.08205, companyNames: ['nike.com', 'spotify.com'] });
  assert.equal(r.error, undefined); assert.equal(r.stats.checks, 2); assert.equal(r.rows.length, 2);
  assert.ok(Math.abs(r.totalUsd - 0.08205) < 1e-10);
});
test('browser navigation retry does not repeat the company fee', async () => {
  const r = await simulate({ navigationFailures: [0] });
  assert.equal(r.error, undefined); assert.equal(r.stats.checks, 1); assert.equal(r.stats.navigations, 2);
  assert.equal(r.rows.length, 1); assert.equal(r.values.get('OUTPUT').failedRequestCount, 0);
});
test('a blocked check remains an explicit failure, with one fee despite retries', async () => {
  const r = await simulate({ blockedAttempts: [0, 1] });
  assert.match(r.error?.message ?? '', /No valid Trustpilot company/);
  assert.equal(r.stats.checks, 1); assert.equal(r.rows.length, 0); assert.equal(r.stats.navigations, 2);
  assert.equal(r.values.get('OUTPUT').failedRequestCount, 1);
});
test('valid empty and filtered checks preserve company summaries and transparent opening charges', async () => {
  for (const config of [{ empty: true }, { filterByRating: '1' }]) {
    const r = await simulate(config);
    assert.equal(r.error, undefined); assert.equal(r.rows.length, 0); assert.equal(r.stats.checks, 1);
    assert.equal(r.values.get('COMPANIES').length, 1); assert.equal(r.values.get('OUTPUT').partial, false);
    assert.ok(Math.abs(r.totalUsd - 0.04005) < 1e-10);
  }
});
test('missing review collections are not disguised as legitimate empty results', async () => {
    const r = await simulate({ malformed: true });
    assert.match(r.error?.message ?? '', /not a verified empty result/);
  assert.equal(r.stats.checks, 1); assert.equal(r.rows.length, 0);
  assert.equal(r.values.get('OUTPUT').failedRequestCount, 1); assert.equal(r.values.get('OUTPUT').partial, true);
});
test('legacy pricing and unmonetized local runs retain all original review fields', async () => {
  for (const config of [{ prices: { 'review-scraped': 0.001, 'apify-actor-start': 0.00005 }, budget: 0.00105 },
    { ppe: false, prices: {} }]) {
    const r = await simulate(config);
    assert.equal(r.error, undefined); assert.equal(r.stats.checks, 0); assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].companyReply, 'Thanks for the feedback');
    assert.equal(r.values.get('OUTPUT').billing.mode, 'legacy-pricing');
  }
});
