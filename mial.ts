interface MialConfiguration {
    domains: string[];
    /**
     * List of all top level domains that are allowed.
     * 
     * Leave empty to skip TLD checks.
     */
    tlds?: string[];
}

export function normalizeDomain(domain: string): string {
    // Lowercase the domain
    domain = domain.toLowerCase();

    // We use the browser URL class to punycode the domain.
    try {
        const url = new URL('http://' + domain);
        domain = url.hostname;
    } catch {
        // Ignore
    }
    return domain;
}


/**
 * Checks if the first or the second word has one character omitted in the other word.
 * @param first 
 * @param second 
 * @returns True if the first or the second word has one character omitted in the other word.
 */
function hasOneCharacterOmitted(first: string, second: string): boolean {
    if ((first.length - 1) == second.length) {
        return hasOneCharacterOmitted(second, first);
    } else if (first.length == (second.length - 1)) {
        let si = 0;
        for (let fi = 0; fi < first.length; ++fi) {
            if (first[fi] !== second[si]) {
                if (fi == si && (first[fi] === second[si + 1])) { // No skipped character yet and next character matches
                    si++;
                } else {
                    return false;
                }
            }
            si++;
        }
        return true;
    }
    return false;
}

/**
 * Returns true if the first and the second word have a Damerau-Levenshtein-Distanz distance of 1.
 * This is true in the following cases:
 *   * 1 character is omitted in the first word
 *   * 1 character is omitted in the second word
 *   * 1 character is changed between the first and the second.
 *   * If 2 characters next to each other are switched in on of the words.
 * @param first 
 * @param second 
 */
export function hasLevensthein1Distance(first: string, second: string): boolean {
    let distance = 0;
    if (first === second) return false;
    if (first.length == second.length) {
        for (let i = 0; i < first.length; i++) {
            if (first[i] !== second[i]) {
                if (i < (first.length - 1) && first[i] === second[i + 1] && first[i + 1] === second[i]) {
                    i++; // Skip next character if we can swap the characters
                }
                distance++;
            }
        }
    } else {
        return hasOneCharacterOmitted(first, second);
    }
    return distance == 1;
}

/**
 * Extracts the top-level domain (TLD) from an email address.
 * @param mail The email address to extract the TLD from.
 * @returns The TLD if present, otherwise null.
 */
export function extractTLD(mail: string): string | null {
    const parts = mail.split('@');
    if (parts.length === 2) {
        const domainParts = parts[1].split('.');
        if (domainParts.length > 1) {
            return domainParts.pop() || null;
        }
    }
    return null;
}

export class Mial {
    private readonly domains: string[];
    private readonly allowedTLDs?: string[];

    constructor(config: MialConfiguration) {
        this.domains = config.domains;
        const normalizedTLDs = config.tlds ? config.tlds.map(tld => normalizeDomain(tld)) : [];
        this.allowedTLDs = normalizedTLDs;
    }

    recommend(mail: string): string | null {
        const parts = mail.split('@');
        if (parts.length == 2) {
            const domain = normalizeDomain(parts[1]);
            if (this.domains.includes(domain)) {
                return null; // No recommendation needed
            }

            for (let checkDomain of this.domains) {
                if (hasLevensthein1Distance(checkDomain, domain)) {
                    return parts[0] + '@' + checkDomain;
                }
            }

            // Check for TLD corrections with the same length and 1 character changed
            const domainParts = domain.split('.');
            if (domainParts.length > 1) {
                const tld = domainParts.pop();
                if (tld && this.allowedTLDs && this.allowedTLDs.length > 0) {
                    // Check if the TLD is in the list of allowed top level domains
                    if (this.allowedTLDs.indexOf(tld) < 0) {
                        const matchingTLDs = this.allowedTLDs.filter(distinctTLD =>
                            tld.length === distinctTLD.length && hasLevensthein1Distance(tld, distinctTLD)
                        );

                        if (matchingTLDs.length === 1) {
                            const tldIndex = domain.lastIndexOf(tld);
                            const correctedDomain = domain.substring(0, tldIndex) + matchingTLDs[0];
                            return parts[0] + '@' + correctedDomain;
                        } else {
                            console.log(`Multiple TLDs found for ${domain}: ${matchingTLDs.join(', ')}`);
                        }
                    }
                }
            }
        }
        return null;
    }

    isInvalid(mail: string): boolean {
        const parts = mail.split('@');
        if (parts.length == 2) {
            const domain = normalizeDomain(parts[1]);
            // If the domain is in list of domains, skip the tld check
            if (this.domains && this.domains.length > 0) {
                if (this.domains.indexOf(domain) >= 0) {
                    return false;
                }
            }
            // If the TLD is not in the list of allowed top level domains, the domain is invalid 
            if (this.allowedTLDs && this.allowedTLDs.length > 0) {
                const tld = extractTLD(mail);
                if (tld && this.allowedTLDs.indexOf(tld) < 0) {
                    return true;
                }
            }
        }
        return false;
    }
}

