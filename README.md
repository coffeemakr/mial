# mial

## Overview
mial is a library designed to suggest better email domains and reduce errors effectively.

## Features
- Easy-to-use APIs
- Modular and extensible design
- Support for domain and TLD recommendations

## Installation
Install the package using npm:

```bash
npm install mial
```

## Usage

### Example Usage
Refer to the `example` folder for a complete working example. Below is a simplified usage:

```javascript
import { Mial } from "mial";
import { domains } from "mial/domains";
import { tlds } from "mial/tlds";

const mial = new Mial({ tlds, domains });

const email = "user@gmil.com";
const recommendation = mial.recommend(email);
const isInvalid = mial.isInvalid(email);

console.log(`Recommendation: ${recommendation}`); // Suggests 'user@gmail.com'
console.log(`Is Invalid: ${isInvalid}`); // Returns false
```

### Domains
`mial/domains` is a recommended list of common email providers. A domain in the list is never
corrected, and typos of it are corrected to it. Extend the list with your own domains:

```javascript
const mial = new Mial({
  tlds,
  domains: [...domains, "example.org"],
});
```

If a typo is one edit away from several domains, the first one in the list is recommended.
Put your own domains first to give them priority.

### DNS check
`mial/dns` checks with DNS over HTTPS whether the domain of an address can receive email:

```javascript
import { DnsChecker } from "mial/dns";
import { domains } from "mial/domains";

const checker = new DnsChecker({ knownDomains: domains });

const result = await checker.check("user@mial-does-not-exist.com", { signal });
// { status: "invalid", reason: "nxdomain", domain: "mial-does-not-exist.com" }
```

The status is `invalid` only if the domain does not exist or has no MX record. Failures and
timeouts result in `unknown`, which should not block the user.

Only the domain is sent to the resolver, by default `https://cloudflare-dns.com/dns-query`.
The options are documented in `DnsCheckerConfiguration`.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request.

## License
This project is licensed under the MIT License.
