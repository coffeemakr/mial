// Queries a real DNS over HTTPS endpoint. Run with `pnpm run test:live`, or set
// MIAL_LIVE_DNS to the endpoint to test, e.g. `MIAL_LIVE_DNS=https://cloudflare-dns.com/dns-query jest dns.live`.
const dns = require('./dns');

const endpoint = process.env.MIAL_LIVE_DNS;
const live = endpoint ? describe : describe.skip;

live(`DnsChecker against ${endpoint}`, () => {
    let checker;

    beforeAll(() => {
        checker = new dns.DnsChecker({ endpoint, timeoutMs: 3000, failureThreshold: Infinity });
    });

    test.each([
        ['user@gmail.com', 'valid', 'mx'],
        ['user@example.com', 'invalid', 'null-mx'],
        [`user@mial-${Date.now()}-does-not-exist.com`, 'invalid', 'nxdomain'],
    ])('%s is %s (%s)', async (email, status, reason) => {
        expect(await checker.check(email)).toMatchObject({ status, reason });
    });
});
