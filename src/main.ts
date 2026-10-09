import { Actor, log } from 'apify';
import { NonRetryableError, PlaywrightCrawler, RequestList } from 'crawlee';
import { installTrafficPolicy } from './traffic-policy.js';
import { ActorInput } from './types.js';
import { buildCompanyHandler, getScrapeState, markSpendingLimitReached } from './routes.js';
import { buildReviewPageUrl, classifyRunOutcome, collectCompanySlugs, normalizeInput } from './run-config.js';
import { CompanyCheckBilling, COMPANY_CHECK_EVENT, CompanyCheckRecord } from './billing.js';

Actor.main(async () => {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);

    const normalizedInput = normalizeInput(input);
    const companySlugs = collectCompanySlugs(input.companyNames, input.companyUrls);
    const sort = normalizedInput.sortBy!;
    const filter = normalizedInput.filterByRating!;

    log.info(`Starting Trustpilot scrape for ${companySlugs.length} unique company(ies) | sort=${sort} | filter=${filter}`);

    const manager = Actor.getChargingManager();
    const initialPricing = manager.getPricingInfo();
    const companyFeeEnabled = initialPricing.isPayPerEvent
        && COMPANY_CHECK_EVENT in initialPricing.perEventPrices;
    // The retained review-only price has no uncertain company charge to recover.
    // Avoid a storage read and ledger writes that cannot protect any charge.
    const previousCompanyChecks = companyFeeEnabled
        ? ((await Actor.getValue<Record<string, CompanyCheckRecord>>('COMPANY_CHECKS')) ?? {})
        : {};
    const billing = new CompanyCheckBilling({
        runId: Actor.getEnv().actorRunId ?? `local-${Date.now()}`,
        pricing: () => manager.getPricingInfo(),
        chargedCount: (event) => manager.getChargedEventCount(event),
        canCharge: (event) => manager.calculateMaxEventChargeCountWithinLimit(event),
        chargeCompany: () => Actor.charge({ eventName: COMPANY_CHECK_EVENT, count: 1 }),
        persist: (records) => Actor.setValue('COMPANY_CHECKS', records),
    }, previousCompanyChecks);
    log.info('Active run pricing', billing.getSummary());

    const finishRun = async (failedRequestCount: number) => {
        const scrapeState = getScrapeState();
        await Actor.setValue('OUTPUT', { ...scrapeState, failedRequestCount,
            billing: billing.getSummary(),
            partial: failedRequestCount > 0 || scrapeState.coverageWarnings.length > 0,
            companySummariesKey: 'COMPANIES',
        });
        const outcome = classifyRunOutcome(scrapeState, failedRequestCount);
        if (outcome === 'budget-limited') {
            log.warning(`Run stopped cleanly at the user's charge limit after saving ${scrapeState.savedReviewCount} review(s).`);
        } else if (outcome === 'empty') {
            log.warning('Valid Trustpilot company pages were parsed, but no reviews matched the selected filters. The empty result is legitimate.');
        }
        log.info(`Crawler finished. Reviews saved: ${scrapeState.savedReviewCount}. Companies parsed: ${scrapeState.parsedCompanyCount}. Company summaries saved: ${scrapeState.savedCompanyCount}. Failed requests: ${failedRequestCount}.`);
    };

    // Avoid browser startup cost as well as proxy traffic for an unfunded run.
    if (!billing.canStartCompany(companySlugs[0])) {
        markSpendingLimitReached();
        await finishRun(0);
        return;
    }

    // Direct browser access is the cost candidate. Honor explicit proxy settings and
    // never silently upgrade a user's connection to Residential traffic.
    const proxyConfig = await Actor.createProxyConfiguration(
        normalizedInput.proxyConfiguration ?? { useApifyProxy: false },
    );

    const startRequests = companySlugs.map((slug) => ({
        url: buildReviewPageUrl(slug, sort, filter, 1),
        userData: {
            slug,
            companyName: slug,
            sort,
            filter,
            label: 'company',
        },
    }));
    // This is a bounded, fully known input list. Keeping it in memory avoids a
    // platform request queue without weakening the per-run company cap.
    const requestList = await RequestList.open(null, startRequests);

    const handler = buildCompanyHandler(normalizedInput, billing);
    let failedRequestCount = 0;
    const usesProxy = normalizedInput.proxyConfiguration?.useApifyProxy === true;

    const crawler = new PlaywrightCrawler({
        requestList,
        proxyConfiguration: proxyConfig,
        maxConcurrency: 1,
        minConcurrency: 1,
        requestHandlerTimeoutSecs: 180,
        navigationTimeoutSecs: 30,
        maxRequestRetries: 1,
        maxSessionRotations: usesProxy ? 1 : 0,
        useSessionPool: usesProxy,
        sessionPoolOptions: usesProxy ? {
            maxPoolSize: 50,
            // Trustpilot serves the AWS WAF challenge as a 403 interstitial that the browser
            // solves in-page. Do not retire sessions on 403/429; let readNextData() wait it out.
            blockedStatusCodes: [],
            sessionOptions: {
                maxAgeSecs: 1800,
                maxUsageCount: 20,
            },
        } : undefined,
        // Per-run diagnostics are written to OUTPUT. The crawler-statistics KVS
        // snapshot is redundant for this short bounded workload.
        statisticsOptions: { persistenceOptions: { enable: false } },
        browserPoolOptions: {
            useFingerprints: true,
        },
        preNavigationHooks: [
            async ({ page, request }, gotoOptions) => {
                // The handler waits for __NEXT_DATA__ explicitly. Waiting for all page
                // resources first adds work without establishing review-data readiness.
                gotoOptions.waitUntil = 'domcontentloaded';
                // This hook runs before the first navigation or any configured proxy transfer.
                if (getScrapeState().spendingLimitReached) {
                    request.noRetry = true;
                    request.userData.billingBudgetSkipped = true;
                    throw new NonRetryableError('Stopped before navigation because the run charge limit was reached.');
                }
                let allowed: boolean;
                try { allowed = await billing.authorize(String(request.userData.slug)); }
                catch (error) { request.noRetry = true; throw error; }
                if (!allowed) {
                    markSpendingLimitReached();
                    request.noRetry = true;
                    request.userData.billingBudgetSkipped = true;
                    throw new NonRetryableError('Budget cannot cover this company check and one review; no page was fetched.');
                }
                await installTrafficPolicy(page);
            },
        ],
        requestHandler: async (context) => {
            if (getScrapeState().spendingLimitReached) {
                context.request.noRetry = true;
                log.warning(`Skipping ${context.request.url} because the run charge limit has been reached.`);
                return;
            }

            await handler(context);
        },
        failedRequestHandler: async ({ request, log: reqLog, error }) => {
            if (request.userData.billingBudgetSkipped) {
                reqLog.warning('Stopped company work before navigation at the user spending limit.');
                await crawler.autoscaledPool?.abort();
                return;
            }
            failedRequestCount++;
            const errMsg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
            reqLog.error(`Request ${request.url} failed after all retries: ${errMsg}`);
        },
    });

    await crawler.run();
    await finishRun(failedRequestCount);
});
