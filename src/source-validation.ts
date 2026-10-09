import { normalizeCompanyTarget } from './run-config.js';

interface CompanyIdentity { id?: unknown; identifyingName?: unknown }

function sourceDomain(value: unknown): string | null {
    if (typeof value !== 'string' || value.includes('://')) return null;
    try { return normalizeCompanyTarget(value); } catch { return null; }
}

function sourceId(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** One matching field cannot override a conflicting company ID or domain. */
export function businessIdentityMatches(expected: CompanyIdentity, actual: CompanyIdentity): boolean {
    const expectedId = sourceId(expected?.id);
    const actualId = sourceId(actual?.id);
    const expectedDomain = sourceDomain(expected?.identifyingName);
    const actualDomain = sourceDomain(actual?.identifyingName);
    if (actual?.identifyingName != null && !actualDomain) return false;
    if (expectedId && actualId && expectedId !== actualId) return false;
    if (expectedDomain && actualDomain && expectedDomain !== actualDomain) return false;
    return !!((expectedId && actualId === expectedId) || (expectedDomain && actualDomain === expectedDomain));
}

/** Validate a browser result before saving or charging any review from it. */
export function reviewPageValidationError(data: any, slug: string, loadedUrl: string,
    expected?: CompanyIdentity): string | null {
    try {
        const url = new URL(loadedUrl);
        const host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password || url.port
            || (host !== 'trustpilot.com' && !host.endsWith('.trustpilot.com'))
            || normalizeCompanyTarget(loadedUrl) !== slug) return 'Unexpected Trustpilot company URL.';
    } catch { return 'Unexpected Trustpilot company URL.'; }

    const pp = data?.props?.pageProps;
    const company = pp?.businessUnit ?? pp?.business;
    if (!company || typeof company !== 'object' || Array.isArray(company) || !Object.keys(company).length) {
        return 'No source-reported Trustpilot company identity.';
    }
    const domain = sourceDomain(company.identifyingName);
    if (domain !== slug && !(domain === null && expected && businessIdentityMatches(expected, company))) {
        return 'Trustpilot source company does not match the requested company.';
    }
    if (expected && !businessIdentityMatches(expected, company)) {
        return 'Trustpilot company identity changed during pagination.';
    }
    if (!Array.isArray(pp?.reviews)) {
        return 'Trustpilot review collection is missing; not treating changed markup as an empty result.';
    }
    return null;
}
