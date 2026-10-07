export const COMPANY_CHECK_EVENT = 'company-check';
export const REVIEW_SCRAPED_EVENT = 'review-scraped';

export interface BillingPort {
    runId: string;
    pricing(): { isPayPerEvent: boolean; maxTotalChargeUsd: number; perEventPrices: Record<string, number> };
    chargedCount(event: string): number;
    canCharge(event: string): number;
    chargeCompany(): Promise<{ chargedCount: number; eventChargeLimitReached: boolean }>;
    persist(records: Record<string, CompanyCheckRecord>): Promise<void>;
}

export interface CompanyCheckRecord {
    runId: string;
    companyDomain: string;
    status: 'charging' | 'authorized' | 'billing_uncertain';
    requestedAt: string;
    feeUsd: number;
    charged: boolean;
}

/** Reserve one review as well as the opening fee before browsing a new company. */
export class CompanyCheckBilling {
    private pending = new Map<string, Promise<boolean>>();
    private queue = Promise.resolve();
    private skipped = new Set<string>();
    private budgetReached = false;
    private records: Record<string, CompanyCheckRecord> = Object.create(null);

    constructor(private port: BillingPort, previousRecords: unknown = {}) {
        if (!port.runId) throw new Error('Missing run identity for company billing.');
        if (!previousRecords || typeof previousRecords !== 'object' || Array.isArray(previousRecords)) {
            throw new Error('Invalid company-check ledger; refusing to repeat uncertain charges.');
        }
        for (const [domain, candidate] of Object.entries(previousRecords)) {
            if (!candidate || typeof candidate !== 'object') throw new Error('Invalid company-check record.');
            const record = candidate as CompanyCheckRecord;
            // A reused store must never make a new run inherit a previous run's paid opening.
            if (typeof record.runId !== 'string') throw new Error('Company-check record has no run identity.');
            if (record.runId !== port.runId) continue;
            if (record.companyDomain !== domain || !['charging', 'authorized', 'billing_uncertain'].includes(record.status)
                || !Number.isFinite(record.feeUsd) || record.feeUsd < 0 || typeof record.charged !== 'boolean'
                || typeof record.requestedAt !== 'string' || !Number.isFinite(Date.parse(record.requestedAt))) {
                throw new Error('Invalid company-check record; refusing uncertain billing.');
            }
            if (record.status === 'authorized' && record.feeUsd > 0 && !record.charged) {
                throw new Error('Company-check authorization has no confirmed charge.');
            }
            this.records[domain] = { ...record };
        }
        const chargedRecords = Object.values(this.records).filter((record) => record.charged).length;
        if (chargedRecords > port.chargedCount(COMPANY_CHECK_EVENT)) {
            throw new Error('Company-check ledger disagrees with this run\'s confirmed event counts.');
        }
    }

    getSummary() {
        const pricing = this.port.pricing();
        return {
            mode: pricing.isPayPerEvent && COMPANY_CHECK_EVENT in pricing.perEventPrices
                ? 'company-check-pricing' : 'legacy-pricing',
            companyCheckPriceUsd: pricing.perEventPrices[COMPANY_CHECK_EVENT] ?? 0,
            companyChecksCharged: Object.values(this.records).filter((record) => record.charged).length,
            companyChecksAuthorized: Object.values(this.records).filter((record) => record.status === 'authorized').length,
            companiesSkippedForBudget: [...this.skipped],
            spendingLimitReached: this.budgetReached,
            companyChecksKey: 'COMPANY_CHECKS',
        };
    }

    canSaveReview(): boolean {
        const pricing = this.port.pricing();
        const price = pricing.isPayPerEvent ? (pricing.perEventPrices[REVIEW_SCRAPED_EVENT] ?? 0) : 0;
        if (!Number.isFinite(price) || price < 0) throw new Error('Invalid active billing prices; not saving reviews.');
        return !pricing.isPayPerEvent || (this.canAfford(price) && this.port.canCharge(REVIEW_SCRAPED_EVENT) >= 1);
    }

    private canAfford(amount: number): boolean {
        const pricing = this.port.pricing();
        if (pricing.maxTotalChargeUsd !== Infinity
            && (!Number.isFinite(pricing.maxTotalChargeUsd) || pricing.maxTotalChargeUsd < 0)) {
            throw new Error('Invalid billing budget; not starting work.');
        }
        const chargedUsd = Object.entries(pricing.perEventPrices).reduce((sum, [event, price]) => {
            const count = this.port.chargedCount(event);
            if (!Number.isFinite(price) || price < 0 || !Number.isFinite(count) || count < 0) {
                throw new Error('Invalid active billing prices or charged counts; not starting work.');
            }
            return sum + price * count;
        }, 0);
        const remaining = pricing.maxTotalChargeUsd - chargedUsd;
        if (Number.isNaN(remaining)) throw new Error('Invalid billing budget; not starting work.');
        // Tolerate only sub-picodollar float noise, not a partially funded review.
        return remaining === Infinity || Number(remaining.toFixed(12)) >= Number(amount.toFixed(12));
    }

    async authorize(companyDomain: string): Promise<boolean> {
        const pending = this.pending.get(companyDomain);
        if (pending) return pending;
        // Serializing openings prevents two companies from reserving the same remaining budget.
        const task = this.queue.then(() => this.authorizeOnce(companyDomain));
        this.queue = task.then(() => {}, () => {});
        this.pending.set(companyDomain, task);
        try { return await task; } finally { this.pending.delete(companyDomain); }
    }

    /** Read-only charge preflight: safe to call before a browser is launched. */
    canStartCompany(companyDomain: string): boolean {
        const existing = this.records[companyDomain];
        if (existing?.status === 'charging' || existing?.status === 'billing_uncertain') {
            throw new Error(`Billing for ${companyDomain} has an uncertain outcome; refusing a second company charge or page fetch.`);
        }
        if (existing?.status === 'authorized') {
            if (this.canSaveReview()) return true;
            this.skipped.add(companyDomain);
            this.budgetReached = true;
            return false;
        }

        const pricing = this.port.pricing();
        const feeEnabled = pricing.isPayPerEvent && COMPANY_CHECK_EVENT in pricing.perEventPrices;
        const fee = feeEnabled ? pricing.perEventPrices[COMPANY_CHECK_EVENT] : 0;
        const reviewPrice = pricing.isPayPerEvent ? (pricing.perEventPrices[REVIEW_SCRAPED_EVENT] ?? 0) : 0;
        if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(reviewPrice) || reviewPrice < 0) {
            throw new Error('Invalid active billing prices; not starting company work.');
        }
        if (!this.canSaveReview() || (feeEnabled && this.port.canCharge(COMPANY_CHECK_EVENT) < 1)
            || !this.canAfford(fee + reviewPrice)) {
            this.skipped.add(companyDomain);
            this.budgetReached = true;
            return false;
        }
        return true;
    }

    private async authorizeOnce(companyDomain: string): Promise<boolean> {
        if (!this.canStartCompany(companyDomain)) return false;
        if (this.records[companyDomain]?.status === 'authorized') return true;
        const pricing = this.port.pricing();
        const feeEnabled = pricing.isPayPerEvent && COMPANY_CHECK_EVENT in pricing.perEventPrices;
        const fee = feeEnabled ? pricing.perEventPrices[COMPANY_CHECK_EVENT] : 0;
        const record: CompanyCheckRecord = { runId: this.port.runId, companyDomain, status: 'charging', requestedAt: new Date().toISOString(),
            feeUsd: fee, charged: false };
        this.records[companyDomain] = record;
        // Save a user-accessible check record and a duplicate-charge guard before charging.
        try { await this.port.persist(this.records); }
        catch (error) { delete this.records[companyDomain]; throw error; }
        if (feeEnabled) {
            try {
                const result = await this.port.chargeCompany();
                // The company event's limit flag only concerns ANOTHER company fee, not reviews.
                if (result.chargedCount !== 1) {
                    record.status = 'billing_uncertain';
                    await this.port.persist(this.records);
                    throw new Error('The company-check charge was not confirmed; no page fetch was started.');
                }
                record.charged = true;
            } catch (error) {
                record.status = 'billing_uncertain';
                await this.port.persist(this.records).catch(() => {});
                throw error;
            }
        }
        record.status = 'authorized';
        await this.port.persist(this.records);
        return true;
    }
}
