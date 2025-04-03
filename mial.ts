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
 * Checks if the first word has one character omitted in the second word.
 * @param first 
 * @param second 
 * @returns true if the first word has one character omitted in the second word
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

export class Mial {
    config: MialConfiguration;

    constructor(config: MialConfiguration) {
        this.config = config;
    }

    recommend(mail: String): String | undefined {
        const parts = mail.split('@');
        console.log(parts);
        if (parts.length == 2) {
            const domain = normalizeDomain(parts[1]);
            for (let checkDomain of this.config.domains) {
                if (hasLevensthein1Distance(checkDomain, domain)) {
                    return parts[0] + '@' + checkDomain;
                }
            }
        }
        return undefined;
    }

    isInvalid(mail: String): boolean {
        const parts = mail.split('@');
        if (parts.length == 2) {
            const domain = normalizeDomain(parts[1]);
            // If the domain is in list of domains, skip the tld check
            if (this.config.domains && this.config.domains.length > 0) {
                if (this.config.domains.indexOf(domain) >= 0) {
                    return false;
                }
            }
            // If the TLD is not in the list of top level domains, the domain is invalid 
            if (this.config.tlds && this.config.tlds.length > 0) {
                const tld = domain.split('.').pop();
                if (tld && this.config.tlds.indexOf(tld) < 0) {
                    return true;
                }
            }
        }
        return false;
    }
}

