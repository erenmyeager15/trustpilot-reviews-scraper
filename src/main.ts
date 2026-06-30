import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { ActorInput } from './types.js';
import { buildCompanyHandler, buildReviewPageUrl, getScrapeState } from './routes.js';

/** Derive the Trustpilot business-unit slug from a name, domain, or full URL. */
function slugFromInput(input: string): string {
    const cleaned = input.toLowerCase().trim();
    if (cleaned.startsWith('http')) {
        const match = cleaned.match(/trustpilot\.com\/review\/([^/?#]+)/);
        if (match) return match[1];
    }
    return cleaned.replace(/^www\./, '').replace(/\/+$/, '');
}

Actor.main(async () => {
    const input = (await Actor.getInput<ActorInput>()) ?? ({} as ActorInput);

    const companyNames = input.companyNames ?? [];
    const companyUrls = input.companyUrls ?? [];
    const allTargets = [...companyUrls, ...companyNames].filter((t) => typeof t === 'string' && t.trim().length > 0);

    if (allTargets.length === 0) {
        log.error('No company names or URLs provided. Add at least one company domain (e.g. "netflix.com") or a Trustpilot review URL.');
        return;
    }

    const sort = input.sortBy || 'most_recent';
    const filter = input.filterByRating || 'all';

    log.info(`Starting Trustpilot scrape for ${allTargets.length} company(ies) | sort=${sort} | filter=${filter}`);

    // Trustpilot is protected by an AWS WAF JS challenge, so residential proxies + a real
    // browser are required. Default to Apify residential proxies when nothing is provided.
    const proxyConfig = await Actor.createProxyConfiguration(
        input.proxyConfiguration ?? { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    );

    const startRequests = allTargets.map((target) => {
        const slug = slugFromInput(target);
        return {
            url: buildReviewPageUrl(slug, sort, filter, 1),
            userData: {
                slug,
                companyName: slug,
                sort,
                filter,
                label: 'company',
            },
        };
    });

    const handler = buildCompanyHandler(input);
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
                throw new Error('Charge limit reached; stopping remaining Trustpilot requests.');
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
    if (scrapeState.spendingLimitReached) {
        throw new Error('Trustpilot crawl stopped because the charge limit was reached.');
    }

    if (scrapeState.chargedReviewCount === 0) {
        throw new Error(`No Trustpilot reviews were charged and saved. Failed requests: ${failedRequestCount}.`);
    }

    log.info(`Crawler finished. Charged reviews: ${scrapeState.chargedReviewCount}. Company summaries saved: ${scrapeState.savedCompanyCount}. Failed requests: ${failedRequestCount}.`);
});
