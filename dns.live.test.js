// Queries the real DNS over HTTPS endpoint. Run with `pnpm run test:live`.
const dns = require('./dns');

const live = process.env.MIAL_LIVE_DNS ? describe : describe.skip;

live('DnsChecker against ' + dns.DEFAULT_DOH_ENDPOINT, () => {
    const checker = new dns.DnsChecker({ timeoutMs: 3000, failureThreshold: Infinity });

    test.each([
        ['user@gmail.com', 'valid', 'mx'],
        ['user@example.com', 'invalid', 'null-mx'],
        [`user@mial-${Date.now()}-does-not-exist.com`, 'invalid', 'nxdomain'],
    ])('%s is %s (%s)', async (email, status, reason) => {
        expect(await checker.check(email)).toMatchObject({ status, reason });
    });
});
