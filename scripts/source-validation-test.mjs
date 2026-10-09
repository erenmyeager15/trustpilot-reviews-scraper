import assert from 'node:assert/strict';
import { test } from 'node:test';
import { businessIdentityMatches, reviewPageValidationError } from '../dist/source-validation.js';

const company = { id: 'source-1', identifyingName: 'nike.com' };
const data = (businessUnit = company, reviews = [{ id: 'real-id' }]) => ({ props: { pageProps: { businessUnit, reviews } } });
const url = 'https://www.trustpilot.com/review/nike.com?sort=recency';

test('browser company identity allows normalized domains and a legitimate empty review array', () => {
    assert.equal(reviewPageValidationError(data(), 'nike.com', url), null);
    assert.equal(reviewPageValidationError(data({ ...company, identifyingName: 'WWW.NIKE.COM/' }, []), 'nike.com', url), null);
    assert.equal(reviewPageValidationError(data(), 'nike.com', 'https://uk.trustpilot.com/review/nike.com'), null);
});

test('source identity, not an invented domain or display name, is required on the first page', () => {
    for (const business of [{ displayName: 'Nike' }, { id: 'source-1' }, { identifyingName: 'other.com' },
        { identifyingName: 'https://nike.com' }, {}, []]) {
        assert.ok(reviewPageValidationError(data(business), 'nike.com', url));
    }
});

test('wrong origins, companies, credentials, paths and insecure redirects are rejected', () => {
    for (const loaded of ['http://www.trustpilot.com/review/nike.com',
        'https://www.trustpilot.com.evil.com/review/nike.com', 'https://evil.com/review/nike.com',
        'https://user:secret@www.trustpilot.com/review/nike.com', 'https://www.trustpilot.com:444/review/nike.com',
        'https://www.trustpilot.com/review/other.com', 'https://www.trustpilot.com/review/nike.com/extra',
        'https://www.trustpilot.com/', 'not-a-url']) {
        assert.ok(reviewPageValidationError(data(), 'nike.com', loaded));
    }
});

test('missing review collections never become a verified empty result', () => {
    for (const reviews of [null, {}, 'not-reviews']) {
        assert.match(reviewPageValidationError(data(company, reviews), 'nike.com', url), /collection is missing/);
    }
});

test('pagination needs matching identity and cannot override a conflicting field', () => {
    assert.equal(businessIdentityMatches(company, { id: 'source-1' }), true);
    assert.equal(businessIdentityMatches(company, { identifyingName: 'WWW.NIKE.COM' }), true);
    for (const business of [{ id: 'source-1', identifyingName: 'other.com' },
        { id: 'different', identifyingName: 'nike.com' }, {}, { displayName: 'Nike' }]) {
        assert.equal(businessIdentityMatches(company, business), false);
        assert.ok(reviewPageValidationError(data(business), 'nike.com', url, company));
    }
    assert.equal(reviewPageValidationError(data({ id: 'source-1' }), 'nike.com', url, company), null);
});
