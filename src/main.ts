import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { ActorInput } from './types.js';
import { buildCompanyHandler, getScrapeState } from './routes.js';
import { buildReviewPageUrl, classifyRunOutcome, collectCompanySlugs, normalizeInput } from './run-config.js';

Actor.main(async () => {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);

    const normalizedInput = normalizeInput(input);
    const companySlugs = collectCompanySlugs(input.companyNames, input.companyUrls);
    const sort = normalizedInput.sortBy!;
    const filter = normalizedInput.filterByRating!;

    log.info(`Starting Trustpilot scrape for ${companySlugs.length} unique company(ies) | sort=${sort} | filter=${filter}`);

    // Trustpilot is protected by an AWS WAF JS challenge, so residential proxies + a real
    // browser are required. Default to Apify residential proxies when nothing is provided.
    const proxyConfig = await Actor.createProxyConfiguration(
        normalizedInput.proxyConfiguration ?? { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
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

    const handler = buildCompanyHandler(normalizedInput);
    let failedRequestCount = 0;

    const crawler = new PlaywrightCrawler({
        proxyConfiguration: proxyConfig,
        maxConcurrency: 3,
        minConcurrency: 1,
        requestHandlerTimeoutSecs: 180,
        navigationTimeoutSecs: 90,
        maxRequestRetries: 4,
        maxSessionRotations: 3,
        sessionPoolOptions: {
            maxPoolSize: 50,
            // Trustpilot serves the AWS WAF challenge as a 403 interstitial that the browser
            // solves in-page. Do not retire sessions on 403/429; let readNextData() wait it out.
            blockedStatusCodes: [],
            sessionOptions: {
                maxAgeSecs: 1800,
                maxUsageCount: 20,
            },
        },
        browserPoolOptions: {
            useFingerprints: true,
        },
        requestHandler: async (context) => {
            if (getScrapeState().spendingLimitReached) {
                context.request.noRetry = true;
                log.warning(`Skipping ${context.request.url} because the run charge limit has been reached.`);
                return;
            }

            await handler(context);
        },
        failedRequestHandler: async ({ request, log: reqLog, error }) => {
            failedRequestCount++;
            const errMsg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
            reqLog.error(`Request ${request.url} failed after all retries: ${errMsg}`);
        },
    });

    await crawler.run(startRequests);

    const scrapeState = getScrapeState();
    const outcome = classifyRunOutcome(scrapeState, failedRequestCount);
    if (outcome === 'budget-limited') {
        log.warning(`Run stopped cleanly at the user's charge limit after saving ${scrapeState.savedReviewCount} review(s).`);
    } else if (outcome === 'empty') {
        log.warning('Valid Trustpilot company pages were parsed, but no reviews matched the selected filters. The empty result is legitimate.');
    }

    log.info(`Crawler finished. Reviews saved: ${scrapeState.savedReviewCount}. Companies parsed: ${scrapeState.parsedCompanyCount}. Company summaries saved: ${scrapeState.savedCompanyCount}. Failed requests: ${failedRequestCount}.`);
});
