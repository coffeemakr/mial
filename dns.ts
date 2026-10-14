import { normalizeDomain } from './mial';

/**
 * Default DNS over HTTPS endpoint. It sends `Access-Control-Allow-Origin: *`, so it can be
 * used from browsers, and it is reachable over HTTP/3.
 */
export const DEFAULT_DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

export const DNS_TYPE_A = 1;
export const DNS_TYPE_SOA = 6;
export const DNS_TYPE_MX = 15;
export const DNS_TYPE_AAAA = 28;

const RCODE_NOERROR = 0;
const RCODE_NXDOMAIN = 3;

/** Largest possible DNS message. Anything bigger is not a DNS response. */
const MAX_MESSAGE_SIZE = 65535;
/** Maximum number of compression pointers followed in a single name, to prevent loops. */
const MAX_POINTER_HOPS = 64;

export type DomainStatus = 'valid' | 'invalid' | 'unknown';

export type DomainCheckReason =
    /** The domain has an MX record. */
    | 'mx'
    /** The domain has no MX record, but an A or AAAA record (only with `requireMx: false`). */
    | 'implicit-mx'
    /** The domain explicitly does not accept email (RFC 7505). */
    | 'null-mx'
    /** The domain does not exist. */
    | 'nxdomain'
    /** The domain exists, but has no record to deliver email to. */
    | 'no-mx'
    /** The domain is in the list of known domains, no lookup was made. */
    | 'known'
    /** The domain can not exist (empty label, label or name too long). */
    | 'malformed'
    /** The domain is not complete yet (e.g. no dot), no lookup was made. */
    | 'incomplete'
    /** The domain contains characters that can not be looked up, no lookup was made. */
    | 'unsupported'
    /** The resolver answered with an error (e.g. SERVFAIL), for example because the domain is misconfigured. */
    | 'dns-error'
    /** The lookup did not finish within the time budget. */
    | 'timeout'
    /** The request failed or the response could not be read. */
    | 'error'
    /** Too many lookups failed recently, no lookup was made. */
    | 'circuit-open';

export interface DomainCheckResult {
    /**
     * `invalid` is only returned for a definitive answer. Every failure results in `unknown`,
     * which should never block the user.
     */
    status: DomainStatus;
    reason: DomainCheckReason;
    /** The normalized domain that was checked. */
    domain: string;
}

export interface DnsCheckerConfiguration {
    /**
     * DNS over HTTPS endpoint (RFC 8484) that accepts GET requests.
     *
     * In browsers the endpoint must send an `Access-Control-Allow-Origin` header, also over HTTP/3.
     * Use a proxy on your own domain for a resolver that does not.
     * @default DEFAULT_DOH_ENDPOINT
     */
    endpoint?: string;
    /**
     * Time budget for a whole check in milliseconds, including the A and AAAA queries if
     * `requireMx` is false. A check that takes longer resolves with `unknown`.
     * @default 2000
     */
    timeoutMs?: number;
    /**
     * If true, a domain without MX record is `invalid`, which needs a single query.
     *
     * If false, a domain without MX record is `valid` if it has an A or AAAA record, because mail
     * servers fall back to it (implicit MX, RFC 5321). This needs two additional queries, and typo
     * domains that only host a website are accepted.
     * @default true
     */
    requireMx?: boolean;
    /**
     * Domains that are known to receive email and are never looked up, e.g. `domains` from `mial/domains`.
     * @default []
     */
    knownDomains?: string[];
    /**
     * Maximum number of domains in the cache. The least recently used domain is removed first.
     * `unknown` results are never cached. Set to 0 to disable the cache.
     * @default 500
     */
    cacheSize?: number;
    /**
     * Maximum time in seconds to cache an answer. Answers are cached for their DNS TTL, but not longer.
     * @default 300
     */
    maxTtl?: number;
    /**
     * Number of consecutive failed lookups (network errors, HTTP errors, timeouts) after which
     * checks resolve with `unknown` immediately, without lookup, for `cooldownMs`. This avoids
     * waiting for the timeout on every check while the resolver is unreachable.
     * @default 3
     */
    failureThreshold?: number;
    /**
     * Time in milliseconds to skip lookups after `failureThreshold` failures. Afterwards, a single
     * failure skips lookups again until a lookup succeeds.
     * @default 30000
     */
    cooldownMs?: number;
    /**
     * Fetch implementation used for the requests, e.g. to add headers or for tests.
     * @default globalThis.fetch
     */
    fetch?: (input: string, init: RequestInit) => Promise<Response>;
}

export interface DnsCheckOptions {
    /**
     * Signal to cancel the check, e.g. when the user typed again.
     *
     * Aborting the signal rejects the returned promise with the abort reason. The lookup itself
     * continues within its time budget, so its result is cached for the next check.
     */
    signal?: AbortSignal;
}

export interface DnsRecord {
    name: string;
    type: number;
    ttl: number;
    /** MX only: the preference of the mail exchange. */
    preference?: number;
    /** MX only: the mail exchange, an empty string for the root (null MX). */
    exchange?: string;
    /** SOA only: the minimum field, used as TTL for negative answers (RFC 2308). */
    minimum?: number;
}

export interface DnsMessage {
    id: number;
    isResponse: boolean;
    truncated: boolean;
    rcode: number;
    questions: { name: string; type: number }[];
    answers: DnsRecord[];
    authorities: DnsRecord[];
}

/**
 * Encodes a DNS query for a single question with recursion desired.
 * The ID is 0 as recommended by RFC 8484, so responses can be cached by HTTP caches.
 * @param domain Normalized ASCII domain without trailing dot.
 * @param type The record type, e.g. {@link DNS_TYPE_MX}.
 */
export function encodeQuery(domain: string, type: number): Uint8Array {
    // ID 0, flags: RD, 1 question, no answers, authorities or additionals
    const bytes = [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
    for (const label of domain.split('.')) {
        bytes.push(label.length);
        for (let i = 0; i < label.length; i++) {
            bytes.push(label.charCodeAt(i));
        }
    }
    bytes.push(0, type >> 8, type & 0xff, 0, 1); // Root label, type, class IN
    return new Uint8Array(bytes);
}

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...Array.from(bytes)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

class DnsMessageReader {
    private offset = 0;

    constructor(private readonly bytes: Uint8Array) {}

    private ensure(length: number, offset = this.offset) {
        if (offset + length > this.bytes.length) {
            throw new Error('DNS message is truncated');
        }
    }

    uint8(): number {
        this.ensure(1);
        return this.bytes[this.offset++];
    }

    uint16(): number {
        this.ensure(2);
        const value = (this.bytes[this.offset] << 8) | this.bytes[this.offset + 1];
        this.offset += 2;
        return value;
    }

    uint32(): number {
        return this.uint16() * 0x10000 + this.uint16();
    }

    skip(length: number) {
        this.ensure(length);
        this.offset += length;
    }

    /** Reads a (possibly compressed) name, returned lowercased and without trailing dot. */
    name(): string {
        const labels: string[] = [];
        let offset = this.offset;
        let end = -1; // Position after the name in the original location, once a pointer was followed
        let hops = 0;
        for (;;) {
            this.ensure(1, offset);
            const length = this.bytes[offset];
            if (length === 0) {
                offset += 1;
                break;
            } else if ((length & 0xc0) === 0xc0) {
                this.ensure(2, offset);
                if (++hops > MAX_POINTER_HOPS) {
                    throw new Error('DNS message contains a compression loop');
                }
                if (end < 0) {
                    end = offset + 2;
                }
                offset = ((length & 0x3f) << 8) | this.bytes[offset + 1];
            } else if ((length & 0xc0) === 0) {
                this.ensure(1 + length, offset);
                labels.push(String.fromCharCode(...Array.from(this.bytes.subarray(offset + 1, offset + 1 + length))));
                offset += 1 + length;
            } else {
                throw new Error('DNS message contains an unsupported label type');
            }
        }
        this.offset = end < 0 ? offset : end;
        return labels.join('.').toLowerCase();
    }

    record(): DnsRecord {
        const name = this.name();
        const type = this.uint16();
        this.uint16(); // Class
        const ttl = this.uint32();
        const length = this.uint16();
        this.ensure(length);
        const end = this.offset + length;
        const record: DnsRecord = { name, type, ttl };
        if (type === DNS_TYPE_MX) {
            record.preference = this.uint16();
            record.exchange = this.name();
        } else if (type === DNS_TYPE_SOA) {
            this.name(); // Primary name server
            this.name(); // Responsible mailbox
            this.skip(16); // Serial, refresh, retry, expire
            record.minimum = this.uint32();
        }
        if (this.offset > end) {
            throw new Error('DNS record data exceeds its length');
        }
        this.offset = end;
        return record;
    }
}

/**
 * Parses a DNS message. Additional records are ignored.
 * @throws Error if the message is malformed.
 */
export function parseMessage(bytes: Uint8Array): DnsMessage {
    const reader = new DnsMessageReader(bytes);
    const id = reader.uint16();
    const flags = reader.uint16();
    const questionCount = reader.uint16();
    const answerCount = reader.uint16();
    const authorityCount = reader.uint16();
    reader.uint16(); // Additional count
    const questions: { name: string; type: number }[] = [];
    for (let i = 0; i < questionCount; i++) {
        const name = reader.name();
        const type = reader.uint16();
        reader.uint16(); // Class
        questions.push({ name, type });
    }
    const answers: DnsRecord[] = [];
    for (let i = 0; i < answerCount; i++) {
        answers.push(reader.record());
    }
    const authorities: DnsRecord[] = [];
    for (let i = 0; i < authorityCount; i++) {
        authorities.push(reader.record());
    }
    return {
        id,
        isResponse: (flags & 0x8000) !== 0,
        truncated: (flags & 0x0200) !== 0,
        rcode: flags & 0x000f,
        questions,
        answers,
        authorities,
    };
}

/**
 * Extracts the domain from an email address or domain and checks whether it can be looked up.
 * @returns The normalized domain, or the result if no lookup should be made.
 */
function prepareDomain(emailOrDomain: string): string | DomainCheckResult {
    let domain = emailOrDomain.trim();
    if (domain.indexOf('@') >= 0) {
        const parts = domain.split('@');
        domain = parts.length === 2 ? parts[1] : '';
    }
    domain = normalizeDomain(domain).replace(/\.$/, '');
    if (domain.indexOf('.') < 0) {
        return { status: 'unknown', reason: 'incomplete', domain };
    }
    if (!/^[a-z0-9_.-]+$/.test(domain)) {
        return { status: 'unknown', reason: 'unsupported', domain };
    }
    const labels = domain.split('.');
    if (domain.length > 253 || labels.some(label => label.length === 0 || label.length > 63)) {
        return { status: 'invalid', reason: 'malformed', domain };
    }
    return domain;
}

function abortReason(signal: AbortSignal): unknown {
    return signal.reason !== undefined ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');
}

/** Rejects as soon as the signal is aborted, without cancelling the promise itself. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
        return promise;
    }
    if (signal.aborted) {
        return Promise.reject(abortReason(signal));
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortReason(signal));
        signal.addEventListener('abort', onAbort);
        promise.then(value => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}

class ResolverError extends Error {
    constructor(readonly rcode: number) {
        super(`DNS query failed with rcode ${rcode}`);
    }
}

interface CacheEntry {
    result: DomainCheckResult;
    expires: number;
}

/**
 * Checks whether the domain of an email address can receive email, using DNS over HTTPS.
 *
 * Only the domain is sent to the resolver, never the local part of the address.
 */
export class DnsChecker {
    private readonly endpoint: string;
    private readonly timeoutMs: number;
    private readonly requireMx: boolean;
    private readonly knownDomains: string[];
    private readonly cacheSize: number;
    private readonly maxTtl: number;
    private readonly failureThreshold: number;
    private readonly cooldownMs: number;
    private readonly fetch: (input: string, init: RequestInit) => Promise<Response>;

    private readonly cache = new Map<string, CacheEntry>();
    private readonly pending = new Map<string, Promise<DomainCheckResult>>();
    private consecutiveFailures = 0;
    private circuitOpenUntil = 0;

    constructor(config: DnsCheckerConfiguration = {}) {
        this.endpoint = config.endpoint ?? DEFAULT_DOH_ENDPOINT;
        this.timeoutMs = config.timeoutMs ?? 2000;
        this.requireMx = config.requireMx ?? true;
        this.knownDomains = (config.knownDomains ?? []).map(domain => normalizeDomain(domain));
        this.cacheSize = config.cacheSize ?? 500;
        this.maxTtl = config.maxTtl ?? 300;
        this.failureThreshold = config.failureThreshold ?? 3;
        this.cooldownMs = config.cooldownMs ?? 30000;
        this.fetch = config.fetch ?? ((input, init) => fetch(input, init));
    }

    /**
     * Checks whether the domain of the email address (or the domain itself) can receive email.
     *
     * Resolves with `unknown` on any failure or timeout and only rejects if `options.signal` is aborted.
     */
    check(emailOrDomain: string, options: DnsCheckOptions = {}): Promise<DomainCheckResult> {
        const prepared = prepareDomain(emailOrDomain);
        if (typeof prepared !== 'string') {
            return abortable(Promise.resolve(prepared), options.signal);
        }
        const domain = prepared;
        if (this.knownDomains.indexOf(domain) >= 0) {
            return abortable(Promise.resolve<DomainCheckResult>({ status: 'valid', reason: 'known', domain }), options.signal);
        }
        const cached = this.getCached(domain);
        if (cached) {
            return abortable(Promise.resolve(cached), options.signal);
        }
        let pending = this.pending.get(domain);
        if (!pending) {
            if (Date.now() < this.circuitOpenUntil) {
                return abortable(Promise.resolve<DomainCheckResult>({ status: 'unknown', reason: 'circuit-open', domain }), options.signal);
            }
            pending = this.lookup(domain);
            this.pending.set(domain, pending);
            pending.then(() => this.pending.delete(domain));
        }
        return abortable(pending, options.signal);
    }

    private getCached(domain: string): DomainCheckResult | undefined {
        const entry = this.cache.get(domain);
        if (!entry) {
            return undefined;
        }
        this.cache.delete(domain);
        if (entry.expires <= Date.now()) {
            return undefined;
        }
        this.cache.set(domain, entry); // Mark as recently used
        return entry.result;
    }

    private setCached(result: DomainCheckResult, ttl: number) {
        const seconds = Math.min(ttl, this.maxTtl);
        if (seconds <= 0 || this.cacheSize <= 0) {
            return;
        }
        this.cache.delete(result.domain);
        this.cache.set(result.domain, { result, expires: Date.now() + seconds * 1000 });
        if (this.cache.size > this.cacheSize) {
            this.cache.delete(this.cache.keys().next().value!);
        }
    }

    /** Looks up the domain within the time budget. Never rejects. */
    private async lookup(domain: string): Promise<DomainCheckResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const { result, ttl } = await this.resolve(domain, controller.signal);
            this.consecutiveFailures = 0;
            this.setCached(result, ttl);
            return result;
        } catch (error) {
            if (error instanceof ResolverError) {
                // The resolver works, but the domain is broken. Not cached, so it is retried later.
                this.consecutiveFailures = 0;
                return { status: 'unknown', reason: 'dns-error', domain };
            }
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= this.failureThreshold) {
                this.circuitOpenUntil = Date.now() + this.cooldownMs;
            }
            return { status: 'unknown', reason: controller.signal.aborted ? 'timeout' : 'error', domain };
        } finally {
            clearTimeout(timer);
        }
    }

    private async resolve(domain: string, signal: AbortSignal): Promise<{ result: DomainCheckResult; ttl: number }> {
        const mx = await this.query(domain, DNS_TYPE_MX, signal);
        if (mx.rcode === RCODE_NXDOMAIN) {
            return { result: { status: 'invalid', reason: 'nxdomain', domain }, ttl: negativeTtl(mx) };
        }
        const mxRecords = mx.answers.filter(record => record.type === DNS_TYPE_MX);
        if (mxRecords.some(record => record.exchange !== '')) {
            return { result: { status: 'valid', reason: 'mx', domain }, ttl: minTtl(mxRecords) };
        }
        if (mxRecords.length > 0) {
            return { result: { status: 'invalid', reason: 'null-mx', domain }, ttl: minTtl(mxRecords) };
        }
        if (!this.requireMx) {
            const addresses = await Promise.all([
                this.query(domain, DNS_TYPE_A, signal),
                this.query(domain, DNS_TYPE_AAAA, signal),
            ]);
            const records = addresses[0].answers.concat(addresses[1].answers)
                .filter(record => record.type === DNS_TYPE_A || record.type === DNS_TYPE_AAAA);
            if (records.length > 0) {
                return { result: { status: 'valid', reason: 'implicit-mx', domain }, ttl: minTtl(records) };
            }
        }
        return { result: { status: 'invalid', reason: 'no-mx', domain }, ttl: negativeTtl(mx) };
    }

    /**
     * Sends a single query.
     * @throws ResolverError if the resolver answered with an error other than NXDOMAIN.
     * @throws Error if the request failed or the response is not a valid answer to the query.
     */
    private async query(domain: string, type: number, signal: AbortSignal): Promise<DnsMessage> {
        const separator = this.endpoint.indexOf('?') >= 0 ? '&' : '?';
        const url = this.endpoint + separator + 'dns=' + base64Url(encodeQuery(domain, type));
        // Not called as a method, because the browser fetch throws if `this` is not the window.
        const fetchImpl = this.fetch;
        // GET with only an Accept header does not need a CORS preflight.
        const response = await fetchImpl(url, { headers: { accept: 'application/dns-message' }, signal });
        if (!response.ok) {
            throw new Error(`DNS over HTTPS request failed with HTTP ${response.status}`);
        }
        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (contentType !== 'application/dns-message') {
            throw new Error(`DNS over HTTPS response has unexpected content type ${contentType}`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > MAX_MESSAGE_SIZE) {
            throw new Error('DNS over HTTPS response is too large');
        }
        const message = parseMessage(bytes);
        const question = message.questions[0];
        if (!message.isResponse || message.truncated || message.id !== 0 || message.questions.length !== 1
            || question.name !== domain || question.type !== type) {
            throw new Error('DNS over HTTPS response does not answer the query');
        }
        if (message.rcode !== RCODE_NOERROR && message.rcode !== RCODE_NXDOMAIN) {
            throw new ResolverError(message.rcode);
        }
        return message;
    }
}

function minTtl(records: DnsRecord[]): number {
    return Math.min(...records.map(record => record.ttl));
}

/** TTL of a negative answer: the minimum of the SOA TTL and its minimum field (RFC 2308). */
function negativeTtl(message: DnsMessage): number {
    const soa = message.authorities.filter(record => record.type === DNS_TYPE_SOA)[0];
    return soa ? Math.min(soa.ttl, soa.minimum!) : 0;
}
