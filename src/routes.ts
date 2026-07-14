import { Actor, log } from 'apify';
import { PlaywrightCrawlingContext } from 'crawlee';
import { ActorInput, CompanyRecord, FilterByRating, ReviewRecord, SortOption } from './types.js';
import { buildReviewPageUrl, reviewMatchesStarFilter, wasRecordSaved } from './run-config.js';

const REVIEW_SCRAPED_EVENT = 'review-scraped';

let savedReviewCount = 0;
let spendingLimitReached = false;
const parsedCompanySlugs = new Set<string>();
const savedCompanySlugs = new Set<string>();
const savedReviewIds = new Set<string>();
const savedReviewCountsBySlug = new Map<string, number>();

export function getScrapeState() {
    return {
        savedReviewCount,
        savedCompanyCount: savedCompanySlugs.size,
        parsedCompanyCount: parsedCompanySlugs.size,
        spendingLimitReached,
    };
}

function toNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[, ]/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function toStr(v: unknown): string | null {
    if (typeof v === 'string') {
        const t = v.trim();
        return t.length > 0 ? t : null;
    }
    return null;
}

/** Pull the parsed __NEXT_DATA__ payload out of the rendered page. */
async function readNextData(page: PlaywrightCrawlingContext['page']): Promise<any | null> {
    // Wait until the AWS WAF challenge clears and Next.js has injected its data island.
    await page
        .waitForFunction(
            () => {
                const el = document.getElementById('__NEXT_DATA__');
                return !!(el && el.textContent && el.textContent.includes('pageProps'));
            },
            { timeout: 60000 },
        )
        .catch(() => null);

    const raw = await page.evaluate(() => {
        const el = document.getElementById('__NEXT_DATA__');
        return el ? el.textContent : null;
    });

    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function parseCompany(bu: any, slug: string, url: string, ratings: any): CompanyRecord {
    // numberOfReviews is sometimes a plain number, sometimes an object with per-star counts.
    const nr = bu?.numberOfReviews;
    const total =
        toNum(ratings?.total) ??
        (typeof nr === 'object' && nr !== null ? toNum(nr.total ?? nr.usedForTrustScoreCalculation) : toNum(nr));

    // Prefer the explicit ratings breakdown from filters.reviewStatistics.ratings.
    const counts = ratings
        ? {
              five: toNum(ratings.five),
              four: toNum(ratings.four),
              three: toNum(ratings.three),
              two: toNum(ratings.two),
              one: toNum(ratings.one),
          }
        : typeof nr === 'object' && nr !== null
          ? {
                five: toNum(nr.fiveStars),
                four: toNum(nr.fourStars),
                three: toNum(nr.threeStars),
                two: toNum(nr.twoStars),
                one: toNum(nr.oneStar),
            }
          : { five: null, four: null, three: null, two: null, one: null };

    const distTotal = toNum(ratings?.total) ?? total;
    const pct = (c: number | null): number | null => {
        if (c == null || !distTotal || distTotal <= 0) return null;
        return Math.round((c / distTotal) * 1000) / 10;
    };

    const categories = Array.isArray(bu?.categories)
        ? bu.categories
              .map((c: any) => toStr(c?.name) || toStr(c?.displayName) || toStr(c?.id) || toStr(c?.categoryId))
              .filter(Boolean)
        : [];

    return {
        companyName: toStr(bu?.displayName) || slug,
        domain: toStr(bu?.identifyingName) || slug,
        trustpilotUrl: url,
        overallTrustScore: toNum(bu?.trustScore),
        starRating: toNum(bu?.stars),
        totalReviewCount: total,
        fiveStarPercent: pct(counts.five),
        fourStarPercent: pct(counts.four),
        threeStarPercent: pct(counts.three),
        twoStarPercent: pct(counts.two),
        oneStarPercent: pct(counts.one),
        claimedStatus: typeof bu?.isClaimed === 'boolean' ? bu.isClaimed : null,
        category: categories.length > 0 ? categories.join(', ') : null,
        websiteUrl: toStr(bu?.contact?.website) || toStr(bu?.websiteUrl),
        scrapedAt: new Date().toISOString(),
    };
}

export function parseReview(r: any, companyName: string, companyUrl: string): ReviewRecord | null {
    const id = toStr(r?.id);
    if (!id) return null;
    return {
        reviewId: id,
        companyName,
        companyUrl,
        starRating: toNum(r?.rating ?? r?.stars),
        reviewTitle: toStr(r?.title),
        reviewBody: toStr(r?.text),
        dateOfExperience: toStr(r?.dates?.experiencedDate),
        reviewPostedDate: toStr(r?.dates?.publishedDate),
        verifiedPurchase: !!(r?.labels?.verification?.isVerified),
        usefulCount: toNum(r?.likes),
        companyReply: toStr(r?.reply?.message),
        companyReplyDate: toStr(r?.reply?.publishedDate),
        reviewUrl: `https://www.trustpilot.com/reviews/${id}`,
        scrapedAt: new Date().toISOString(),
    };
}

export function buildCompanyHandler(input: ActorInput) {
    const rawMax = input.maxReviewsPerCompany;
    const maxReviews = rawMax === 0 || rawMax == null ? Number.POSITIVE_INFINITY : rawMax;
    const verifiedOnly = input.verifiedOnly ?? false;

    return async (context: PlaywrightCrawlingContext) => {
        const { page, request, session } = context;
        const { slug, companyName, sort, filter } = request.userData as {
            slug: string;
            companyName: string;
            sort: SortOption;
            filter: FilterByRating;
        };

        if (spendingLimitReached) {
            request.noRetry = true;
            log.warning(`Skipping ${request.url} because the run charge limit has already been reached.`);
            return;
        }

        const firstData = await readNextData(page);
        if (!firstData) {
            // No data island -> almost always the AWS WAF challenge blocked this session.
            session?.markBad();
            throw new Error(`Could not load Trustpilot data for "${slug}" (blocked or layout changed). Retrying with a new session.`);
        }

        const pp = firstData?.props?.pageProps ?? {};
        const bu = pp.businessUnit ?? pp.business ?? {};

        if (!bu || Object.keys(bu).length === 0) {
            request.noRetry = true;
            throw new Error(`No Trustpilot company page was found for "${slug}". pageProps keys: ${Object.keys(pp).join(', ') || 'none'}.`);
        }
        parsedCompanySlugs.add(slug);

        const companyRecord = parseCompany(bu, slug, request.url, pp?.filters?.reviewStatistics?.ratings);
        const resolvedName = companyRecord.companyName || companyName || slug;

        log.info(`Company: ${resolvedName} | TrustScore ${companyRecord.overallTrustScore ?? 'n/a'} | ${companyRecord.totalReviewCount ?? '?'} reviews`);

        const totalPages =
            toNum(pp?.filters?.pagination?.totalPages) ?? toNum(pp?.pagination?.totalPages) ?? null;

        const seen = new Set<string>();
        let reviewCount = savedReviewCountsBySlug.get(slug) ?? 0;
        let pageNum = 1;
        let currentData: any = firstData;
        let companySummarySaved = savedCompanySlugs.has(slug);

        while (reviewCount < maxReviews) {
            const pageProps = currentData?.props?.pageProps ?? {};
            const reviews: any[] = Array.isArray(pageProps.reviews) ? pageProps.reviews : [];

            if (reviews.length === 0) {
                log.info(`No more reviews for ${resolvedName} (page ${pageNum}).`);
                break;
            }

            let parseableRowsOnPage = 0;
            for (const raw of reviews) {
                const review = parseReview(raw, resolvedName, request.url);
                if (!review) {
                    log.warning(`Skipping a malformed Trustpilot review without a stable review ID for ${resolvedName}.`);
                    continue;
                }
                parseableRowsOnPage++;
                if (seen.has(review.reviewId) || savedReviewIds.has(review.reviewId)) continue;
                seen.add(review.reviewId);

                if (!reviewMatchesStarFilter(review, sort, filter)) continue;
                if (verifiedOnly && !review.verifiedPurchase) continue;

                const charge = await Actor.pushData(review, REVIEW_SCRAPED_EVENT);
                const recordWasSaved = wasRecordSaved(charge);

                if (recordWasSaved) {
                    savedReviewIds.add(review.reviewId);
                    savedReviewCount++;
                    reviewCount++;
                    savedReviewCountsBySlug.set(slug, reviewCount);

                    if (!companySummarySaved) {
                        // Company summaries go to a dedicated "companies" dataset after the first
                        // saved review so blocked or empty runs do not create zero-revenue output.
                        try {
                            const companyDataset = await Actor.openDataset('companies');
                            await companyDataset.pushData(companyRecord);
                            savedCompanySlugs.add(slug);
                            companySummarySaved = true;
                        } catch (error) {
                            log.warning(`Review saved, but the optional company summary could not be saved for ${resolvedName}: ${(error as Error).message}`);
                        }
                    }
                }

                if (charge.eventChargeLimitReached) {
                    spendingLimitReached = true;
                    request.noRetry = true;
                    log.warning(`Charge limit reached for ${REVIEW_SCRAPED_EVENT}; stopping without saving more reviews.`);
                    break;
                }

                if (reviewCount >= maxReviews) break;
            }

            if (reviews.length > 0 && parseableRowsOnPage === 0) {
                request.noRetry = true;
                throw new Error(`Trustpilot returned review rows without stable IDs for ${resolvedName}; the page layout may have changed.`);
            }

            log.info(`Scraped ${reviewCount}/${maxReviews === Number.POSITIVE_INFINITY ? 'all' : maxReviews} reviews for ${resolvedName} (page ${pageNum})`);

            if (spendingLimitReached) break;
            if (reviewCount >= maxReviews) break;
            if (totalPages != null && pageNum >= totalPages) break;

            pageNum++;
            const nextUrl = buildReviewPageUrl(slug, sort, filter, pageNum);
            try {
                await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
            } catch (e) {
                log.warning(`Failed to navigate to page ${pageNum} for ${resolvedName}: ${(e as Error).message}`);
                break;
            }
            currentData = await readNextData(page);
            if (!currentData) {
                log.info(`Page ${pageNum} returned no data for ${resolvedName}; stopping pagination.`);
                break;
            }
        }

        log.info(`Finished ${resolvedName}: ${reviewCount} reviews scraped.`);
    };
}
