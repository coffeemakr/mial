

interface MialConfiguration {
    domains: string[]

}

function hasOneCharacterOmitted(first: string, second: string): boolean {
    if((first.length - 1) == second.length) {
        return hasOneCharacterOmitted(second, first);
    } else if(first.length == (second.length - 1)) {
        let si = 0;
        for(let fi=0; fi < first.length; ++fi) {
            if(first[fi] !== second[si]) {
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

    recommend(mail: String): String|undefined {
        const parts = mail.split('@');
        console.log(parts);
        if(parts.length == 2) {
            const domain = parts[1];
            for(let checkDomain of this.config.domains) {
                if(hasLevensthein1Distance(checkDomain, domain)) {
                    return parts[0] + '@' + checkDomain;
                }
            }
        }

        return undefined;
    }
} 

