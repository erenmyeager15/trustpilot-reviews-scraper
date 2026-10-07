import assert from 'node:assert/strict';
import { shouldBlockResource, installTrafficPolicy } from '../dist/traffic-policy.js';

const cases = [
    ['https://www.trustpilot.com/review/nike.com', 'document', false],
    ['https://www.trustpilot.com/review/nike.com?page=2', 'document', false],
    ['https://www.trustpilot.com/_next/static/chunks/app.js', 'script', true],
    ['https://static.trustpilot.com/_next/static/chunks/app.js', 'script', true],
    ['https://www.trustpilot.com/styles.css', 'stylesheet', true],
    ['https://cdn.example.com/picture.webp', 'image', true],
    ['https://token.awswaf.com/challenge.js', 'script', false],
    ['https://token.awswaf.com/verify', 'fetch', false],
    ['https://www.trustpilot.com/challenge.js', 'script', false],
    ['https://www.trustpilot.com/_next/data/build/review/nike.com.json', 'fetch', false],
    ['https://www.google-analytics.com/collect', 'fetch', true],
    ['https://notgoogle-analytics.com/verify', 'fetch', false],
];
for (const [url, type, expected] of cases) assert.equal(shouldBlockResource(url, type), expected, url);
let handler;
await installTrafficPolicy({ route: async (pattern, fn) => { assert.equal(pattern, '**/*'); handler = fn; } });
for (const [url, type, blocked] of cases) {
    const actions = [];
    await handler({ request: () => ({ url: () => url, resourceType: () => type }), abort: async () => actions.push('abort'), continue: async () => actions.push('continue') });
    assert.deepEqual(actions, [blocked ? 'abort' : 'continue']);
}
console.log('24 resource-policy and route-action checks passed.');
