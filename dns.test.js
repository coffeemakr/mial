const http = require('node:http');
const dns = require('./dns');

// Responses captured from https://cloudflare-dns.com/dns-query
const fixtures = {
    'gmail.com MX': '00008180000100050000000005676d61696c03636f6d00000f0001c00c000f00010000016d0020001e04616c74330d676d61696c2d736d74702d696e016c06676f6f676c65c012c00c000f00010000016d0009002804616c7434c02ec00c000f00010000016d0009000a04616c7431c02ec00c000f00010000016d00040005c02ec00c000f00010000016d0009001404616c7432c02e',
    // Null MX (RFC 7505)
    'example.com MX': '000081800001000100000000076578616d706c6503636f6d00000f0001c00c000f0001000000ea0003000000',
    // NXDOMAIN with SOA (TTL 900, minimum 900)
    'does-not-exist-mial-test.com MX': '00008183000100000001000018646f65732d6e6f742d65786973742d6d69616c2d7465737403636f6d00000f0001c0250006000100000384003d01610c67746c642d73657276657273036e657400056e73746c640c766572697369676e2d677273c0256acf6465000007080000038400093a8000000384',
    // NOERROR without MX, with SOA (TTL 60, minimum 60)
    'blogspot.com MX': '00008180000100000001000008626c6f6773706f7403636f6d00000f0001c00c000600010000003c002d036e733106676f6f676c65c01509646e732d61646d696ec02e3b83ffee0000038400000384000007080000003c',
    'blogspot.com A': '00008180000100010000000008626c6f6773706f7403636f6d0000010001c00c000100010000012c00044a7d1dbf',
    'blogspot.com AAAA': '00008180000100010000000008626c6f6773706f7403636f6d00001c0001c00c001c00010000012c00102a001450400a100900000000000000bf',
    // SERVFAIL
    'gmial.com MX': '00008182000100000000000005676d69616c03636f6d00000f0001',
    // CNAME to github.com, followed by its MX
    'www.github.com MX': '000081800001000200000000037777770667697468756203636f6d00000f0001c00c0005000100000e100002c010c010000f00010000012c002700000a6769746875622d636f6d046d61696c0a70726f74656374696f6e076f75746c6f6f6bc017',
};

const TYPE_NAMES = { 1: 'A', 15: 'MX', 28: 'AAAA' };

function bytes(hex) {
    return new Uint8Array(Buffer.from(hex, 'hex'));
}

/** Decodes the question of a DoH GET request URL, e.g. 'gmail.com MX'. */
function questionOf(url) {
    const query = Buffer.from(new URL(url).searchParams.get('dns'), 'base64url');
    const question = dns.parseMessage(new Uint8Array(query)).questions[0];
    return `${question.name} ${TYPE_NAMES[question.type]}`;
}

function dnsResponse(body, init = {}) {
    return new Response(body, { status: 200, headers: { 'content-type': 'application/dns-message' }, ...init });
}

/** A fetch mock answering with the fixtures. */
function fixtureFetch() {
    return jest.fn(async (url) => {
        const hex = fixtures[questionOf(url)];
        if (!hex) {
            throw new Error(`No fixture for ${questionOf(url)}`);
        }
        return dnsResponse(bytes(hex));
    });
}

/** A fetch mock that never answers, but rejects when its signal is aborted. */
function hangingFetch() {
    return jest.fn((url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
    }));
}

describe('encodeQuery', () => {
    test('encodes a query with ID 0 and recursion desired', () => {
        expect(Buffer.from(dns.encodeQuery('gmail.com', dns.DNS_TYPE_MX)).toString('hex'))
            .toBe('00000100000100000000000005676d61696c03636f6d00000f0001');
    });
});

describe('parseMessage', () => {
    test('parses MX records with compressed names', () => {
        const message = dns.parseMessage(bytes(fixtures['gmail.com MX']));
        expect(message.isResponse).toBe(true);
        expect(message.rcode).toBe(0);
        expect(message.questions).toEqual([{ name: 'gmail.com', type: dns.DNS_TYPE_MX }]);
        expect(message.answers).toHaveLength(5);
        expect(message.answers[0]).toEqual({
            name: 'gmail.com', type: dns.DNS_TYPE_MX, ttl: 365, preference: 30, exchange: 'alt3.gmail-smtp-in.l.google.com',
        });
        expect(message.answers.map(record => record.exchange)).toContain('gmail-smtp-in.l.google.com');
    });

    test('parses a null MX', () => {
        const message = dns.parseMessage(bytes(fixtures['example.com MX']));
        expect(message.answers).toEqual([{ name: 'example.com', type: dns.DNS_TYPE_MX, ttl: 234, preference: 0, exchange: '' }]);
    });

    test('parses the SOA of a negative answer', () => {
        const message = dns.parseMessage(bytes(fixtures['does-not-exist-mial-test.com MX']));
        expect(message.rcode).toBe(3);
        expect(message.authorities).toEqual([{ name: 'com', type: dns.DNS_TYPE_SOA, ttl: 900, minimum: 900 }]);
    });

    test('throws on truncated messages', () => {
        const hex = fixtures['gmail.com MX'];
        for (const length of [0, 5, 12, 20, 40, hex.length / 2 - 1]) {
            expect(() => dns.parseMessage(bytes(hex).subarray(0, length))).toThrow();
        }
    });

    test('throws on compression loops', () => {
        // One question whose name is a pointer to itself
        expect(() => dns.parseMessage(bytes('000081800001000000000000c00c000f0001'))).toThrow(/loop/);
    });

    test('throws if record data exceeds its length', () => {
        // MX record with a data length of 2, but preference and exchange need 3 bytes
        expect(() => dns.parseMessage(bytes('00008180000000010000000000000f00010000003c0002000000'))).toThrow();
    });
});

describe('DnsChecker', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    test.each([
        ['user@gmail.com', 'valid', 'mx'],
        ['User@GMAIL.com', 'valid', 'mx'],
        ['gmail.com', 'valid', 'mx'],
        ['user@gmail.com.', 'valid', 'mx'],
        ['user@www.github.com', 'valid', 'mx'],
        ['user@example.com', 'invalid', 'null-mx'],
        ['user@does-not-exist-mial-test.com', 'invalid', 'nxdomain'],
        ['user@blogspot.com', 'invalid', 'no-mx'],
        ['user@gmial.com', 'unknown', 'dns-error'],
    ])('%s is %s (%s)', async (email, status, reason) => {
        const checker = new dns.DnsChecker({ fetch: fixtureFetch() });
        expect(await checker.check(email)).toEqual({ status, reason, domain: expect.any(String) });
    });

    test('accepts A and AAAA records without requireMx', async () => {
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch, requireMx: false });
        expect(await checker.check('user@blogspot.com')).toEqual({ status: 'valid', reason: 'implicit-mx', domain: 'blogspot.com' });
        expect(fetch.mock.calls.map(([url]) => questionOf(url)).sort()).toEqual(['blogspot.com A', 'blogspot.com AAAA', 'blogspot.com MX']);
    });

    test('only sends one MX query with requireMx', async () => {
        const fetch = fixtureFetch();
        await new dns.DnsChecker({ fetch }).check('user@blogspot.com');
        expect(fetch.mock.calls.map(([url]) => questionOf(url))).toEqual(['blogspot.com MX']);
    });

    test('sends a GET request with only an Accept header', async () => {
        const fetch = fixtureFetch();
        await new dns.DnsChecker({ fetch }).check('user@gmail.com');
        const [url, init] = fetch.mock.calls[0];
        expect(url.startsWith(dns.DEFAULT_DOH_ENDPOINT + '?dns=')).toBe(true);
        expect(init.method).toBeUndefined();
        expect(init.headers).toEqual({ accept: 'application/dns-message' });
    });

    test('appends the query to an endpoint with parameters', async () => {
        const fetch = fixtureFetch();
        await new dns.DnsChecker({ fetch, endpoint: 'https://example.org/dns?key=1' }).check('user@gmail.com');
        expect(fetch.mock.calls[0][0].startsWith('https://example.org/dns?key=1&dns=')).toBe(true);
    });

    test('does not call fetch as a method', async () => {
        // The browser fetch throws an "Illegal invocation" if it is called with another `this`
        let calledWith = null;
        const checker = new dns.DnsChecker({
            fetch: function (url) {
                calledWith = this;
                return Promise.resolve(dnsResponse(bytes(fixtures[questionOf(url)])));
            },
        });
        await checker.check('user@gmail.com');
        expect(calledWith).not.toBe(checker);
    });

    test.each([
        ['user@gmail', 'unknown', 'incomplete'],
        ['user@', 'unknown', 'incomplete'],
        ['user', 'unknown', 'incomplete'],
        ['a@b@gmail.com', 'unknown', 'incomplete'],
        ['user@exa mple.com', 'unknown', 'unsupported'],
        ['user@[1.2.3.4]', 'unknown', 'unsupported'],
        ['user@a..com', 'invalid', 'malformed'],
        ['user@.com', 'invalid', 'malformed'],
        [`user@${'a'.repeat(64)}.com`, 'invalid', 'malformed'],
        [`user@${'abcdefghi.'.repeat(26)}com`, 'invalid', 'malformed'],
    ])('%s is %s (%s) without lookup', async (email, status, reason) => {
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch });
        expect(await checker.check(email)).toMatchObject({ status, reason });
        expect(fetch).not.toHaveBeenCalled();
    });

    test('does not look up known domains', async () => {
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch, knownDomains: ['Bluewin.ch'] });
        expect(await checker.check('user@bluewin.ch')).toEqual({ status: 'valid', reason: 'known', domain: 'bluewin.ch' });
        expect(fetch).not.toHaveBeenCalled();
    });

    test.each([
        ['an HTTP error', async () => dnsResponse('error', { status: 500 })],
        ['a wrong content type', async () => dnsResponse(bytes(fixtures['gmail.com MX']), { headers: { 'content-type': 'text/html' } })],
        ['a rejected request', async () => { throw new TypeError('Failed to fetch'); }],
        ['a malformed response', async () => dnsResponse(bytes('0000'))],
        ['an answer to another question', async () => dnsResponse(bytes(fixtures['example.com MX']))],
        ['a query instead of a response', async () => dnsResponse(dns.encodeQuery('gmail.com', dns.DNS_TYPE_MX))],
    ])('is unknown on %s', async (name, fetchImpl) => {
        const checker = new dns.DnsChecker({ fetch: jest.fn(fetchImpl) });
        expect(await checker.check('user@gmail.com')).toEqual({ status: 'unknown', reason: 'error', domain: 'gmail.com' });
    });

    test('is unknown after the time budget', async () => {
        jest.useFakeTimers();
        const fetch = hangingFetch();
        const checker = new dns.DnsChecker({ fetch, timeoutMs: 1500 });
        const result = checker.check('user@gmail.com');
        await jest.advanceTimersByTimeAsync(1499);
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        expect(await result).toEqual({ status: 'unknown', reason: 'timeout', domain: 'gmail.com' });
    });

    test('the time budget includes the fallback queries', async () => {
        jest.useFakeTimers();
        const fetch = jest.fn((url, init) => questionOf(url).endsWith(' MX')
            ? new Promise(resolve => setTimeout(() => resolve(dnsResponse(bytes(fixtures[questionOf(url)]))), 800))
            : hangingFetch()(url, init));
        const checker = new dns.DnsChecker({ fetch, timeoutMs: 1000, requireMx: false });
        const result = checker.check('user@blogspot.com');
        await jest.advanceTimersByTimeAsync(1000);
        expect(await result).toMatchObject({ status: 'unknown', reason: 'timeout' });
    });

    test('rejects if the caller aborts, but still caches the result', async () => {
        jest.useFakeTimers();
        const fetch = jest.fn(url => new Promise(resolve => setTimeout(() => resolve(dnsResponse(bytes(fixtures[questionOf(url)]))), 100)));
        const checker = new dns.DnsChecker({ fetch });
        const controller = new AbortController();
        const result = checker.check('user@gmail.com', { signal: controller.signal });
        controller.abort();
        await expect(result).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
        await jest.advanceTimersByTimeAsync(100);
        expect(await checker.check('user@gmail.com')).toMatchObject({ status: 'valid' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('rejects if the signal is already aborted', async () => {
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch });
        await expect(checker.check('user@gmail.com', { signal: AbortSignal.abort() })).rejects.toThrow();
    });

    test('shares concurrent lookups of the same domain', async () => {
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch });
        const results = await Promise.all([checker.check('a@gmail.com'), checker.check('b@GMAIL.com')]);
        expect(results.map(result => result.status)).toEqual(['valid', 'valid']);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('caches answers for their TTL, but at most maxTtl', async () => {
        jest.useFakeTimers();
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch, maxTtl: 300 });
        await checker.check('user@gmail.com'); // TTL 365
        await checker.check('user@blogspot.com'); // Negative TTL 60
        jest.advanceTimersByTime(59 * 1000);
        await checker.check('user@gmail.com');
        await checker.check('user@blogspot.com');
        expect(fetch).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(1000);
        await checker.check('user@blogspot.com');
        expect(fetch).toHaveBeenCalledTimes(3);
        jest.advanceTimersByTime(240 * 1000);
        await checker.check('user@gmail.com');
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    test('does not cache unknown results', async () => {
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch });
        await checker.check('user@gmial.com');
        await checker.check('user@gmial.com');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('evicts the least recently used domain', async () => {
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch, cacheSize: 2 });
        await checker.check('user@gmail.com');
        await checker.check('user@example.com');
        await checker.check('user@gmail.com'); // Cached, now most recently used
        await checker.check('user@does-not-exist-mial-test.com'); // Evicts example.com
        expect(fetch).toHaveBeenCalledTimes(3);
        await checker.check('user@gmail.com');
        expect(fetch).toHaveBeenCalledTimes(3);
        await checker.check('user@example.com');
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    test('stops looking up domains after repeated failures', async () => {
        jest.useFakeTimers();
        const fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
        const checker = new dns.DnsChecker({ fetch, failureThreshold: 3, cooldownMs: 30000 });
        for (let i = 0; i < 3; i++) {
            expect(await checker.check('user@gmail.com')).toMatchObject({ reason: 'error' });
        }
        expect(await checker.check('user@example.com')).toEqual({ status: 'unknown', reason: 'circuit-open', domain: 'example.com' });
        expect(fetch).toHaveBeenCalledTimes(3);

        // After the cooldown a single lookup is tried, and another failure opens the circuit again
        jest.advanceTimersByTime(30000);
        expect(await checker.check('user@gmail.com')).toMatchObject({ reason: 'error' });
        expect(await checker.check('user@gmail.com')).toMatchObject({ reason: 'circuit-open' });
        expect(fetch).toHaveBeenCalledTimes(4);

        // A successful lookup closes the circuit
        fetch.mockImplementation(fixtureFetch());
        jest.advanceTimersByTime(30000);
        expect(await checker.check('user@gmail.com')).toMatchObject({ status: 'valid' });
        fetch.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
        expect(await checker.check('user@example.com')).toMatchObject({ reason: 'error' });
        expect(await checker.check('user@example.com')).toMatchObject({ reason: 'error' });
    });

    test('resolver errors do not open the circuit', async () => {
        const fetch = fixtureFetch();
        const checker = new dns.DnsChecker({ fetch, failureThreshold: 1 });
        await checker.check('user@gmial.com');
        expect(await checker.check('user@gmail.com')).toMatchObject({ status: 'valid' });
    });
});

describe('DnsChecker with a local DoH server', () => {
    let server;
    let endpoint;

    beforeAll(async () => {
        server = http.createServer((request, response) => {
            const question = questionOf('http://localhost' + request.url);
            if (question.startsWith('hang.test ')) {
                return; // Never answer
            }
            const hex = fixtures[question];
            response.writeHead(hex ? 200 : 404, { 'content-type': 'application/dns-message' });
            response.end(hex ? Buffer.from(hex, 'hex') : undefined);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        endpoint = `http://127.0.0.1:${server.address().port}/dns-query`;
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });

    test('checks domains with the global fetch', async () => {
        const checker = new dns.DnsChecker({ endpoint });
        expect(await checker.check('user@gmail.com')).toMatchObject({ status: 'valid', reason: 'mx' });
        expect(await checker.check('user@does-not-exist-mial-test.com')).toMatchObject({ status: 'invalid', reason: 'nxdomain' });
        expect(await checker.check('user@unknown-fixture.com')).toMatchObject({ status: 'unknown', reason: 'error' });
    });

    test('times out if the server does not answer', async () => {
        const checker = new dns.DnsChecker({ endpoint, timeoutMs: 200 });
        const start = Date.now();
        expect(await checker.check('user@hang.test')).toMatchObject({ status: 'unknown', reason: 'timeout' });
        expect(Date.now() - start).toBeLessThan(1000);
    });

    test('is unknown if the server is not reachable', async () => {
        const checker = new dns.DnsChecker({ endpoint: 'http://127.0.0.1:1/dns-query' });
        expect(await checker.check('user@gmail.com')).toMatchObject({ status: 'unknown', reason: 'error' });
    });
});
