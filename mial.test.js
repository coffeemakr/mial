const mial = require('./mial');

test('levelstein with omittion', () => {
    expect(mial.hasLevensthein1Distance('test1', 'test')).toBeTruthy();
    expect(mial.hasLevensthein1Distance('test', 'test1')).toBeTruthy();
    expect(mial.hasLevensthein1Distance('Test', 'Tesst')).toBeTruthy();
    expect(mial.hasLevensthein1Distance('Tesst', 'Test')).toBeTruthy();
});

test('levelstein with swap', () => {
    expect(mial.hasLevensthein1Distance('abcdefhg', 'abcdefgh')).toBeTruthy();
    expect(mial.hasLevensthein1Distance('abdcefgh', 'abcdefgh')).toBeTruthy();
    expect(mial.hasLevensthein1Distance('bacdefgh', 'abcdefgh')).toBeTruthy();
    expect(mial.hasLevensthein1Distance('acbdefgh', 'abcdefgh')).toBeTruthy();
});

test('levelstein with more changes', () => {
    expect(mial.hasLevensthein1Distance('bacdefhg', 'abcdefgh')).toBeFalsy();
    expect(mial.hasLevensthein1Distance('badcefgh', 'abcdefgh')).toBeFalsy();
    expect(mial.hasLevensthein1Distance('babcdfegh', 'abcdefgh')).toBeFalsy();
    expect(mial.hasLevensthein1Distance('test', 'test12')).toBeFalsy();
    expect(mial.hasLevensthein1Distance('test', 'test123')).toBeFalsy();
    expect(mial.hasLevensthein1Distance('test12', 'test')).toBeFalsy();
    expect(mial.hasLevensthein1Distance('12test', 'test')).toBeFalsy();
});


test('recommends correct domains', () => {
    const m = new mial.Mial({
        domains: [
            'bluewin.ch',
            'gmail.com',
            'hotmail.com',
            'yahoo.co.uk'
        ]
    });
    expect(m.recommend('test@bluewin.ch')).toBeFalsy();
    expect(m.recommend('test@bluewi.ch')).toBe("test@bluewin.ch");
    expect(m.recommend('test@bleuwin.ch')).toBe("test@bluewin.ch");
    expect(m.recommend('test@bluewin.cn')).toBe("test@bluewin.ch");
    expect(m.recommend('dsadsadsadsa@yaho.co.uk')).toBe("dsadsadsadsa@yahoo.co.uk");
    expect(m.recommend('dsadsadsadsa@yaoho.co.uk')).toBe("dsadsadsadsa@yahoo.co.uk");
    expect(m.recommend('user1@gmail.co')).toBe("user1@gmail.com");
    expect(m.recommend('user2@gmial.com')).toBe("user2@gmail.com");
    expect(m.recommend('user3@hotmial.com')).toBe("user3@hotmail.com");
    expect(m.recommend('user4@yaoo.co.uk')).toBe("user4@yahoo.co.uk");
    expect(m.recommend('user5@bluewn.ch')).toBe("user5@bluewin.ch");
    expect(m.recommend('user6@unknown.com')).toBeFalsy();
    expect(m.recommend('User1@GMAIL.co')).toBe("User1@gmail.com");
    expect(m.recommend('USER2@Gmial.COM')).toBe("USER2@gmail.com");
    expect(m.recommend('UsEr3@Hotmial.Com')).toBe("UsEr3@hotmail.com");
    expect(m.recommend('USER4@Yaoo.Co.UK')).toBe("USER4@yahoo.co.uk");
    expect(m.recommend('UsEr5@BlueWN.ch')).toBe("UsEr5@bluewin.ch");
    expect(m.recommend('USER6@Unknown.COM')).toBeFalsy();
});

test('recommends correct TLDs', () => {
    const m = new mial.Mial({
        domains: [
            'gmail.com',
            'yahoo.co.uk',
        ],
        tlds: [
            'com',
            'co.uk',
            'org',
            'net',
            'googlo'
        ]
    });

    expect(m.recommend('user1@gmail.co')).toBe("user1@gmail.com");
    expect(m.recommend('user1@gmail.con')).toBe("user1@gmail.com");
    expect(m.recommend('user1@gmail.col')).toBe("user1@gmail.com");
    expect(m.recommend('user1@gmail.co')).toBe("user1@gmail.com");
    expect(m.recommend('user1@googlo')).toBeFalsy();


    expect(m.recommend('user1@example.con')).toBe("user1@example.com");
    expect(m.recommend('user1@example.col')).toBe("user1@example.com");
    expect(m.recommend('user2@yahoo.cu.uk')).toBe("user2@yahoo.co.uk");
    expect(m.recommend('user3@domain.ork')).toBe("user3@domain.org");
    expect(m.recommend('user4@domain.met')).toBe("user4@domain.net");
    expect(m.recommend('user5@domain.unknown')).toBeFalsy();
    expect(m.recommend('user6@domain.xyz')).toBeFalsy();
});

test('isInvalid for invalid TLDs', () => {
    const m = new mial.Mial({
        tlds: [
            'com',
            'NET',
            'org',
            'ch',
            'cz',
            'xn--vermgensberater-ctb',
        ],
        domains: [
            'valid.com',
            'valid.ch',
            'valid.cz',
            'valid.xn--vermgensberater-ctb',
        ]
    });

    // Ensure uppercase TLDs also work
    expect(m.isInvalid('test@example.COM')).toBeFalsy();
    expect(m.isInvalid('test@example.NET')).toBeFalsy();
    expect(m.isInvalid('test@example.ORG')).toBeFalsy();
    expect(m.isInvalid('test@example.CH')).toBeFalsy();
    expect(m.isInvalid('test@example.CZ')).toBeFalsy();
    expect(m.isInvalid('test@example.XN--VERMGENSBERATER-CTB')).toBeFalsy();

    expect(m.isInvalid('test@example.invalid')).toBeTruthy();
    expect(m.isInvalid('test@example.xyz')).toBeTruthy();
    expect(m.isInvalid('test@example.unknown')).toBeTruthy();
    expect(m.isInvalid('user1@domain.invalid')).toBeTruthy();
    expect(m.isInvalid('user2@domain.fake')).toBeTruthy();
    expect(m.isInvalid('user3@domain.test')).toBeTruthy();
    expect(m.isInvalid('user4@domain.xyz')).toBeTruthy();
    expect(m.isInvalid('user5@domain.unknown')).toBeTruthy();

    expect(m.isInvalid('test@example.com')).toBeFalsy();
    expect(m.isInvalid('test@example.ch')).toBeFalsy();
    expect(m.isInvalid('user6@domain.com')).toBeFalsy();
    expect(m.isInvalid('user7@domain.net')).toBeFalsy();
    expect(m.isInvalid('user8@domain.org')).toBeFalsy();
    expect(m.isInvalid('user9@domain.ch')).toBeFalsy();
    expect(m.isInvalid('user10@domain.cz')).toBeFalsy();

    expect(m.isInvalid('test@example.vermogensberater')).toBeTruthy();
    expect(m.isInvalid('test@example.xn-vermgensberater-ctb')).toBeTruthy();
    expect(m.isInvalid('test@example.xn--vermogensberater-ctb')).toBeTruthy();
    expect(m.isInvalid('test@example.xn--vermögensberater-ctb')).toBeTruthy();
    expect(m.isInvalid('user13@domain.vermogensberater')).toBeTruthy();
    expect(m.isInvalid('user14@domain.xn-vermgensberater-ctb')).toBeTruthy();
    expect(m.isInvalid('user15@domain.xn--vermogensberater-ctb')).toBeTruthy();
    expect(m.isInvalid('user16@domain.xn--vermögensberater-ctb')).toBeTruthy();

    expect(m.isInvalid('TEST@EXAMPLE.VERMOGENSBERATER')).toBeTruthy();
    expect(m.isInvalid('TEST@EXAMPLE.XN-VERMGENSBERATER-CTB')).toBeTruthy();
    expect(m.isInvalid('TEST@EXAMPLE.XN--VERMOGENSBERATER-CTB')).toBeTruthy();
    expect(m.isInvalid('TEST@EXAMPLE.XN--VERMÖGENSBERATER-CTB')).toBeTruthy();
    expect(m.isInvalid('USER13@DOMAIN.VERMOGENSBERATER')).toBeTruthy();
    expect(m.isInvalid('USER14@DOMAIN.XN-VERMGENSBERATER-CTB')).toBeTruthy();
    expect(m.isInvalid('USER15@DOMAIN.XN--VERMOGENSBERATER-CTB')).toBeTruthy();
    expect(m.isInvalid('USER16@DOMAIN.XN--VERMÖGENSBERATER-CTB')).toBeTruthy();

    expect(m.isInvalid('test@example.xn--vermgensberater-ctb')).toBeFalsy();
    expect(m.isInvalid('test@example.vermögensberater')).toBeFalsy();
    expect(m.isInvalid('user11@domain.xn--vermgensberater-ctb')).toBeFalsy();
    expect(m.isInvalid('user12@domain.vermögensberater')).toBeFalsy();

    expect(m.isInvalid('TEST@EXAMPLE.XN--VERMGENSBERATER-CTB')).toBeFalsy();
    expect(m.isInvalid('TEST@EXAMPLE.VERMÖGENSBERATER')).toBeFalsy();
    expect(m.isInvalid('USER11@DOMAIN.XN--VERMGENSBERATER-CTB')).toBeFalsy();
    expect(m.isInvalid('USER12@DOMAIN.VERMÖGENSBERATER')).toBeFalsy();

    expect(m.isInvalid('TEST@EXAMPLE.INVALID')).toBeTruthy();
    expect(m.isInvalid('Test@Example.XYZ')).toBeTruthy();
    expect(m.isInvalid('USER1@DOMAIN.INVALID')).toBeTruthy();
    expect(m.isInvalid('USER2@DOMAIN.FAKE')).toBeTruthy();
    expect(m.isInvalid('USER3@DOMAIN.TEST')).toBeTruthy();
    expect(m.isInvalid('USER4@DOMAIN.XYZ')).toBeTruthy();
    expect(m.isInvalid('USER5@DOMAIN.UNKNOWN')).toBeTruthy();

    expect(m.isInvalid('TEST@EXAMPLE.COM')).toBeFalsy();
    expect(m.isInvalid('TEST@EXAMPLE.CH')).toBeFalsy();
    expect(m.isInvalid('USER6@DOMAIN.COM')).toBeFalsy();
    expect(m.isInvalid('USER7@DOMAIN.NET')).toBeFalsy();
    expect(m.isInvalid('USER8@DOMAIN.ORG')).toBeFalsy();
    expect(m.isInvalid('USER9@DOMAIN.CH')).toBeFalsy();
    expect(m.isInvalid('USER10@DOMAIN.CZ')).toBeFalsy();


    // Test that domains still work
    expect(m.isInvalid('valid@valid.com')).toBeFalsy();
    expect(m.isInvalid('valid@valid.ch')).toBeFalsy();
    expect(m.isInvalid('valid@valid.cz')).toBeFalsy();
    expect(m.isInvalid('valid@valid.xn--vermgensberater-ctb')).toBeFalsy();

});

test('normalizeDomain', () => {

    expect(mial.normalizeDomain('EXAMPLE.COM')).toBe('example.com');
    expect(mial.normalizeDomain('Example.CoM')).toBe('example.com');
    expect(mial.normalizeDomain('example.com')).toBe('example.com');
    expect(mial.normalizeDomain('EXAMPLE.XN--VERMGENSBERATER-CTB')).toBe('example.xn--vermgensberater-ctb');
    expect(mial.normalizeDomain('example.vermögensberater')).toBe('example.xn--vermgensberater-ctb');
    expect(mial.normalizeDomain('EXAMPLE.VERMÖGENSBERATER')).toBe('example.xn--vermgensberater-ctb');
    expect(mial.normalizeDomain('example.xn--vermgensberater-ctb')).toBe('example.xn--vermgensberater-ctb');
    expect(mial.normalizeDomain('EXAMPLE.XN--VERMGENSBERATER-CTB')).toBe('example.xn--vermgensberater-ctb');
    expect(mial.normalizeDomain('example.invalid')).toBe('example.invalid');
    expect(mial.normalizeDomain('EXAMPLE.INVALID')).toBe('example.invalid');
});

test('does not recommend similar TLDs with Levenshtein distance of 1', () => {
    // TLDs 'cz' and 'ch' have a Levenshtein distance of 1, so they should not be recommended interchangeably.
    const m = new mial.Mial({
        domains: [
            'example.com',
            'bluewin.ch',
        ],
        tlds: [
            'com',
            'cz',
            'ch',
        ]
    });

    // Ensure 'cz' is not recommended as 'ch' and vice versa
    expect(m.recommend('user1@example.cz')).toBeFalsy();
    expect(m.recommend('user2@example.ch')).toBeFalsy();

    // Ensure valid TLDs are still recommended correctly
    expect(m.recommend('user3@example.con')).toBe("user3@example.com");
    expect(m.recommend('user4@example.czz')).toBeFalsy();
    expect(m.recommend('user5@example.chh')).toBeFalsy();

    // Ensure other domains are recommended correctly
    expect(m.recommend('user6@bluewin.cn')).toBe("user6@bluewin.ch");
    expect(m.recommend('user7@bluewin.ch')).toBeFalsy();
    expect(m.recommend('user8@bluewin.cnn')).toBeFalsy();
});


test('dont recommend domain if another already matches', () => {

    const m = new mial.Mial({
        domains: [
            'gmail.com',
            'mail.com',
        ],
    });

    expect(m.recommend('test@gmail.com')).toBeFalsy();
    expect(m.recommend('test@mail.com')).toBeFalsy();


    const m2 = new mial.Mial({
        domains: [
            'mail.com',
            'gmail.com',

        ],
    });

    expect(m2.recommend('test@gmail.com')).toBeFalsy();
    expect(m2.recommend('test@mail.com')).toBeFalsy();
});


