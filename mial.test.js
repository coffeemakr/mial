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
    expect(m.recommend('dsadsadsadsa@yaho.co.uk')).toBe("dsadsadsadsa@yahoo.co.uk");
    expect(m.recommend('dsadsadsadsa@yaoho.co.uk')).toBe("dsadsadsadsa@yahoo.co.uk");
});