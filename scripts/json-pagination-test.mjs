import assert from 'node:assert/strict';
import { buildJsonPageUrl, jsonPageSkipReason, validateJsonPage, tryJsonPage } from '../dist/json-pagination.js';
const first = { buildId: 'build-1', props: { pageProps: { businessUnit: { id: 'company1' } } } };
const next = 'https://www.trustpilot.com/review/nike.com?sort=recency&stars=4&page=2';
assert.equal(buildJsonPageUrl(first, next), 'https://www.trustpilot.com/_next/data/build-1/review/nike.com.json?sort=recency&stars=4&page=2');
assert.equal(buildJsonPageUrl({}, next), null);
assert.match(buildJsonPageUrl({ ...first, buildId: '2.123.0', locale: null }, next), /\/2\.123\.0\/review\//);
assert.equal(jsonPageSkipReason({ ...first, buildId: '2.123.0' }, next), null);
assert.equal(jsonPageSkipReason({}, next), 'missing_build_id');
assert.equal(jsonPageSkipReason({ ...first, buildId: '..' }, next), 'unsupported_build_id');
assert.equal(jsonPageSkipReason({ ...first, locale: 42 }, next), 'unsupported_locale');
assert.equal(buildJsonPageUrl(first, 'malformed'), null);
assert.equal(buildJsonPageUrl({ ...first, buildId: '../bad' }, next), null);
assert.equal(buildJsonPageUrl(first, 'https://example.com/review/nike.com'), null);
assert.match(buildJsonPageUrl({ ...first, locale: 'en-US' }, next), /\/en-US\/review\//);
const good = { pageProps: { businessUnit: { id: 'company1' }, reviews: [{ id: 'new', reply: { message: 'Reply preserved' } }] } };
assert.equal(validateJsonPage(good, first, new Set()).props.pageProps.reviews[0].reply.message, 'Reply preserved');
for (const payload of [null, {}, { pageProps: { ...good.pageProps, reviews: [] } }, { pageProps: { ...good.pageProps, businessUnit: { id: 'other' } } }, { pageProps: { ...good.pageProps, reviews: [{}] } }]) {
    assert.equal(validateJsonPage(payload, first, new Set()), null);
}
assert.equal(validateJsonPage(good, first, new Set(['new'])), null);
assert.equal(await tryJsonPage({ evaluate: async () => { throw Error('timeout'); } }, first, next, new Set()), null);
assert.ok(await tryJsonPage({ evaluate: async () => good }, first, next, new Set()));
console.log('JSON pagination URL, identity, field preservation, duplicate and fallback checks passed.');
