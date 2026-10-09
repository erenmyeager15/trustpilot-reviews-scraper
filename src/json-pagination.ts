import type { Page } from 'playwright';
import { businessIdentityMatches } from './source-validation.js';

export function buildJsonPageUrl(firstData: any, nextUrl: string): string | null {
    const build = firstData?.buildId;
    if (typeof build !== 'string' || !/^[a-zA-Z0-9_.-]{1,200}$/.test(build) || build === '.' || build === '..') return null;
    let url: URL;
    try { url = new URL(nextUrl); } catch { return null; }
    if (url.origin !== 'https://www.trustpilot.com' || !/^\/review\/[^/]+$/.test(url.pathname)) return null;
    const locale = firstData?.locale;
    if (locale != null && (typeof locale !== 'string' || !/^[a-zA-Z-]{2,15}$/.test(locale))) return null;
    url.pathname = `/_next/data/${build}${locale ? `/${locale}` : ''}${url.pathname}.json`;
    return url.toString();
}

export function jsonPageSkipReason(firstData: any, nextUrl: string): string | null {
    if (buildJsonPageUrl(firstData, nextUrl)) return null;
    if (typeof firstData?.buildId !== 'string' || !firstData.buildId) return 'missing_build_id';
    if (!/^[a-zA-Z0-9_.-]{1,200}$/.test(firstData.buildId) || ['.', '..'].includes(firstData.buildId)) return 'unsupported_build_id';
    if (firstData.locale != null && (typeof firstData.locale !== 'string' || !/^[a-zA-Z-]{2,15}$/.test(firstData.locale))) return 'unsupported_locale';
    return 'unsupported_page_url';
}

export function validateJsonPage(payload: any, firstData: any, seenIds: Set<string>): any | null {
    const pp = payload?.pageProps;
    const expected = firstData?.props?.pageProps?.businessUnit ?? firstData?.props?.pageProps?.business;
    const actual = pp?.businessUnit ?? pp?.business;
    if (!actual || !expected || !Array.isArray(pp?.reviews) || !pp.reviews.length) return null;
    // Require source identity, not just a matching display name.
    if (!businessIdentityMatches(expected, actual)) return null;
    if (!pp.reviews.every((r: any) => typeof r?.id === 'string' && r.id.length > 0)) return null;
    if (pp.reviews.every((r: any) => seenIds.has(r.id))) return null;
    return { ...firstData, props: { ...firstData.props, pageProps: pp } };
}

export async function tryJsonPage(page: Page, firstData: any, nextUrl: string, seenIds: Set<string>): Promise<any | null> {
    const url = buildJsonPageUrl(firstData, nextUrl);
    if (!url) return null;
    try {
        // Fetch in the current browser context: same cookies and configured proxy.
        // No new browser, credential copying, proxy switch or retries.
        const payload = await page.evaluate(async (target) => {
            if (new URL(target).origin !== location.origin) return null;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
            try {
                const response = await fetch(target, { credentials: 'same-origin', redirect: 'error', signal: controller.signal,
                    headers: { accept: 'application/json', 'x-nextjs-data': '1' } });
                if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
                    await response.body?.cancel(); return null;
                }
                reader = response.body?.getReader();
                if (!reader) return null;
                const decoder = new TextDecoder(); let text = ''; let size = 0;
                while (true) {
                    const chunk = await reader.read(); if (chunk.done) break;
                    size += chunk.value.byteLength;
                    if (size > 2 * 1024 * 1024) return null;
                    text += decoder.decode(chunk.value, { stream: true });
                }
                return JSON.parse(text + decoder.decode());
            } catch { return null; }
            finally { clearTimeout(timer); await reader?.cancel().catch(() => {}); }
        }, url);
        return validateJsonPage(payload, firstData, seenIds);
    } catch { return null; }
}
