"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mial = exports.hasLevensthein1Distance = exports.normalizeDomain = void 0;
function normalizeDomain(domain) {
    domain = domain.toLowerCase();
    try {
        const url = new URL('http://' + domain);
        domain = url.hostname;
    }
    catch (_a) {
    }
    return domain;
}
exports.normalizeDomain = normalizeDomain;
function hasOneCharacterOmitted(first, second) {
    if ((first.length - 1) == second.length) {
        return hasOneCharacterOmitted(second, first);
    }
    else if (first.length == (second.length - 1)) {
        let si = 0;
        for (let fi = 0; fi < first.length; ++fi) {
            if (first[fi] !== second[si]) {
                if (fi == si && (first[fi] === second[si + 1])) {
                    si++;
                }
                else {
                    return false;
                }
            }
            si++;
        }
        return true;
    }
    return false;
}
function hasLevensthein1Distance(first, second) {
    let distance = 0;
    if (first === second)
        return false;
    if (first.length == second.length) {
        for (let i = 0; i < first.length; i++) {
            if (first[i] !== second[i]) {
                if (i < (first.length - 1) && first[i] === second[i + 1] && first[i + 1] === second[i]) {
                    i++;
                }
                distance++;
            }
        }
    }
    else {
        return hasOneCharacterOmitted(first, second);
    }
    return distance == 1;
}
exports.hasLevensthein1Distance = hasLevensthein1Distance;
class Mial {
    constructor(config) {
        this.config = config;
    }
    recommend(mail) {
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
    isInvalid(mail) {
        const parts = mail.split('@');
        if (parts.length == 2) {
            const domain = normalizeDomain(parts[1]);
            if (this.config.domains && this.config.domains.length > 0) {
                if (this.config.domains.indexOf(domain) >= 0) {
                    return false;
                }
            }
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
exports.Mial = Mial;
