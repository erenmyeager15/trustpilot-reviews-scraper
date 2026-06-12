export interface ReviewDraft {
    reviewId: string;
    starRating: number | null;
    reviewTitle: string | null;
    reviewBody: string | null;
    dateOfExperience: string | null;
    reviewPostedDate: string | null;
    verifiedPurchase: boolean;
    usefulCount: number | null;
    companyReply: string | null;
    companyReplyDate: string | null;
    reviewUrl: string | null;
}

export type SortOption = 'most_recent' | 'most_relevant' | 'lowest_rated';
export type FilterByRating = 'all' | '1' | '2' | '3' | '4' | '5';

export interface ActorInput {
    companyNames?: string[];
    companyUrls?: string[];
    maxReviewsPerCompany: number;
    sortBy: SortOption;
    filterByRating: FilterByRating;
    verifiedOnly: boolean;
    proxyConfiguration?: {
        useApifyProxy: boolean;
        apifyProxyGroups?: string[];
        proxyUrls?: string[];
    };
}

export interface CompanyRecord {
    companyName: string;
    domain: string;
    trustpilotUrl: string;
    overallTrustScore: number | null;
    starRating: number | null;
    totalReviewCount: number | null;
    fiveStarPercent: number | null;
    fourStarPercent: number | null;
    threeStarPercent: number | null;
    twoStarPercent: number | null;
    oneStarPercent: number | null;
    claimedStatus: boolean | null;
    category: string | null;
    websiteUrl: string | null;
    scrapedAt: string;
}

export interface ReviewRecord {
    reviewId: string;
    companyName: string;
    companyUrl: string;
    starRating: number | null;
    reviewTitle: string | null;
    reviewBody: string | null;
    dateOfExperience: string | null;
    reviewPostedDate: string | null;
    verifiedPurchase: boolean;
    usefulCount: number | null;
    companyReply: string | null;
    companyReplyDate: string | null;
    reviewUrl: string | null;
    scrapedAt: string;
}
