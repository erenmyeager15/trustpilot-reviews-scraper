import type { Page } from 'playwright';

const TRACKING_HOSTS = ['google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'hotjar.com', 'segment.io', 'segment.com'];

/** Keep documents and challenge traffic. Review extraction reads server-rendered JSON,
 * so the site's UI bundles, styling and media are not needed by this collector. */
export function shouldBlockResource(url: string, resourceType: string): boolean {
    if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font'
        || resourceType === 'stylesheet' || resourceType === 'manifest' || resourceType === 'texttrack') return true;
    let target: URL;
    try { target = new URL(url); } catch { return false; }
    const host = target.hostname.toLowerCase();
    if (TRACKING_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`))) return true;
    const trustpilotHost = host === 'trustpilot.com' || host.endsWith('.trustpilot.com');
    return trustpilotHost && resourceType === 'script' && target.pathname.startsWith('/_next/static/');
}

export async function installTrafficPolicy(page: Page): Promise<void> {
    await page.route('**/*', async route => {
        const request = route.request();
        if (shouldBlockResource(request.url(), request.resourceType())) await route.abort();
        else await route.continue();
    });
}
