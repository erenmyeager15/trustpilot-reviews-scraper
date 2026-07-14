import { ActorInput, FilterByRating, ReviewRecord, SortOption } from './types.js';

export const MAX_COMPANIES_PER_RUN = 50;
export const MAX_REVIEWS_PER_COMPANY = 10_000;

const SORT_OPTIONS = new Set<SortOption>(['most_recent', 'most_relevant', 'lowest_rated']);
const RATING_FILTERS = new Set<FilterByRating>(['all', '1', '2', '3', '4', '5']);

function normalizeSlug(value: string): string {
    const slug = value.toLowerCase().trim().replace(/^www\./, '').replace(/\/+$/, '');

    if (!slug || slug.length > 253 || /[\s\\/?#@:]/.test(slug) || slug.includes('..')) {
        throw new Error(`Invalid Trustpilot company domain or slug: "${value}".`);
    }

    const labels = slug.split('.');
    if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
        throw new Error(`Invalid Trustpilot company domain or slug: "${value}".`);
    }

    return slug;
}

/** Normalize a company domain, Trustpilot slug, or full Trustpilot review URL. */
export function normalizeCompanyTarget(value: string): string {
    const input = value.trim();
    if (!input) throw new Error('Company targets cannot be blank.');

    if (/^https?:\/\//i.test(input)) {
        let url: URL;
        try {
            url = new URL(input);
        } catch {
            throw new Error(`Invalid Trustpilot company URL: "${value}".`);
        }
        const hostname = url.hostname.toLowerCase();
        if (hostname !== 'trustpilot.com' && !hostname.endsWith('.trustpilot.com')) {
            throw new Error(`Only Trustpilot review URLs are accepted in companyUrls: "${value}".`);
        }

        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length !== 2 || segments[0].toLowerCase() !== 'review') {
            throw new Error(`Expected a Trustpilot company review URL such as https://www.trustpilot.com/review/nike.com: "${value}".`);
        }

        try {
            return normalizeSlug(decodeURIComponent(segments[1]));
        } catch (error) {
            if (error instanceof URIError) throw new Error(`Invalid encoded Trustpilot company URL: "${value}".`);
            throw error;
        }
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
        throw new Error(`Unsupported URL scheme in company target: "${value}".`);
    }

    return normalizeSlug(input);
}

/** Merge and de-duplicate both target inputs before any billed work starts. */
export function collectCompanySlugs(companyNames: unknown, companyUrls: unknown): string[] {
    if (companyNames != null && !Array.isArray(companyNames)) throw new Error('companyNames must be an array of strings.');
    if (companyUrls != null && !Array.isArray(companyUrls)) throw new Error('companyUrls must be an array of strings.');

    const values = [
        ...(Array.isArray(companyUrls) ? companyUrls : []),
        ...(Array.isArray(companyNames) ? companyNames : []),
    ];

    const unique = new Set<string>();
    for (const value of values) {
        if (typeof value !== 'string') throw new Error('Every company target must be a string.');
        if (!value.trim()) continue;
        unique.add(normalizeCompanyTarget(value));
        if (unique.size > MAX_COMPANIES_PER_RUN) {
            throw new Error(`At most ${MAX_COMPANIES_PER_RUN} unique companies can be scraped in one run.`);
        }
    }

    if (unique.size === 0) {
        throw new Error('Add at least one company domain, Trustpilot slug, or full Trustpilot review URL.');
    }

    return [...unique];
}

export function normalizeMaxReviewsPerCompany(value: unknown): number {
    const normalized = value == null ? 1 : value;
    if (!Number.isInteger(normalized) || (normalized as number) < 0 || (normalized as number) > MAX_REVIEWS_PER_COMPANY) {
        throw new Error(`maxReviewsPerCompany must be an integer from 0 to ${MAX_REVIEWS_PER_COMPANY}.`);
    }
    return normalized as number;
}

export function normalizeSortOption(value: unknown): SortOption {
    const normalized = (value ?? 'most_recent') as SortOption;
    if (!SORT_OPTIONS.has(normalized)) throw new Error(`Unsupported sortBy value: "${String(value)}".`);
    return normalized;
}

export function normalizeRatingFilter(value: unknown): FilterByRating {
    const normalized = (value ?? 'all') as FilterByRating;
    if (!RATING_FILTERS.has(normalized)) throw new Error(`Unsupported filterByRating value: "${String(value)}".`);
    return normalized;
}

export function normalizeInput(input: ActorInput): ActorInput {
    return {
        ...input,
        maxReviewsPerCompany: normalizeMaxReviewsPerCompany(input.maxReviewsPerCompany),
        sortBy: normalizeSortOption(input.sortBy),
        filterByRating: normalizeRatingFilter(input.filterByRating),
        verifiedOnly: input.verifiedOnly ?? false,
    };
}

export function effectiveStarFilter(sort: SortOption, filter: FilterByRating): FilterByRating {
    if (filter !== 'all') return filter;
    return sort === 'lowest_rated' ? '1' : 'all';
}

/** Build a Trustpilot review-page URL with sort, star filter, and pagination. */
export function buildReviewPageUrl(slug: string, sort: SortOption, filter: FilterByRating, pageNum: number): string {
    const params = new URLSearchParams();
    if (sort === 'most_recent') params.set('sort', 'recency');
    const starFilter = effectiveStarFilter(sort, filter);
    if (starFilter !== 'all') params.set('stars', starFilter);
    if (pageNum > 1) params.set('page', String(pageNum));
    const qs = params.toString();
    return `https://www.trustpilot.com/review/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`;
}

export function reviewMatchesStarFilter(review: Pick<ReviewRecord, 'starRating'>, sort: SortOption, filter: FilterByRating): boolean {
    const starFilter = effectiveStarFilter(sort, filter);
    if (starFilter === 'all') return true;
    return review.starRating !== null && Number.isFinite(review.starRating) && Math.round(review.starRating) === Number(starFilter);
}

export function wasRecordSaved(charge: { chargedCount: number; eventChargeLimitReached: boolean }): boolean {
    return charge.chargedCount > 0 || !charge.eventChargeLimitReached;
}

export type RunOutcome = 'results' | 'empty' | 'budget-limited';

export function classifyRunOutcome(
    state: { parsedCompanyCount: number; savedReviewCount: number; spendingLimitReached: boolean },
    failedRequestCount: number,
): RunOutcome {
    if (state.parsedCompanyCount === 0) {
        throw new Error(`No valid Trustpilot company page could be parsed. Failed requests: ${failedRequestCount}.`);
    }
    if (state.spendingLimitReached) return 'budget-limited';
    if (state.savedReviewCount === 0) return 'empty';
    return 'results';
}
