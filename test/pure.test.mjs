/**
 * dsh-selfskin — unit tests for the pure helpers.
 *
 * Run: node test/pure.test.mjs
 *
 * These cover the paths that are easiest to get subtly wrong and hardest to spot
 * in a running app: the import validator (which decides what a user is allowed to
 * write onto `<body>`), the state normalizer (which has to survive a payload from
 * an older build), the URL escaper, and the ripple clip geometry.
 */

import assert from 'node:assert/strict';

import {
    auroraValues,
    cssUrl,
    fillTemplate,
    hashString,
    normalizeState,
    parseImportedSkin,
    rippleClip,
    wallpaperValues,
    withCustomIdentity
} from '../src/pure.js';

import { BUILTIN_SKINS, DEFAULT_SKIN_ID, HOST_APPEARANCES } from '../src/skins.js';

let passed = 0;
const failures = [];

/**
 * Run one named assertion block.
 * @param name - test name.
 * @param fn - the block; any throw fails the test.
 */
function test(name, fn) {
    try {
        fn();
        passed += 1;
        process.stdout.write('  ok   ' + name + '\n');
    } catch (error) {
        failures.push({ name, error });
        process.stdout.write('  FAIL ' + name + '\n');
    }
}

process.stdout.write('pure helpers\n');

/* ------------------------------------------------------------------ parseImportedSkin */

test('parseImportedSkin accepts a well-formed document', () => {
    const result = parseImportedSkin(JSON.stringify({
        name: '我的皮肤',
        colorScheme: 'dark',
        tokens: { '--dsw-alias-brand-primary': '#ff6b6b' }
    }));
    assert.equal(result.ok, true);
    assert.equal(result.value.name, '我的皮肤');
    assert.equal(result.value.colorScheme, 'dark');
    assert.equal(result.value.tokens['--dsw-alias-brand-primary'], '#ff6b6b');
});

test('parseImportedSkin defaults a missing name instead of failing', () => {
    const result = parseImportedSkin('{"colorScheme":"light","tokens":{"--dsw-alias-bg-base":"#fff"}}');
    assert.equal(result.ok, true);
    assert.equal(result.value.name, '未命名皮肤');
});

test('parseImportedSkin rejects empty input', () => {
    const result = parseImportedSkin('   ');
    assert.equal(result.ok, false);
    assert.match(result.error, /粘贴/);
});

test('parseImportedSkin reports malformed JSON', () => {
    const result = parseImportedSkin('{ nope');
    assert.equal(result.ok, false);
    assert.match(result.error, /JSON 解析失败/);
});

test('parseImportedSkin rejects a non-object top level', () => {
    assert.equal(parseImportedSkin('[]').ok, false);
    assert.equal(parseImportedSkin('"x"').ok, false);
    assert.equal(parseImportedSkin('null').ok, false);
});

test('parseImportedSkin requires an explicit colorScheme', () => {
    const result = parseImportedSkin('{"tokens":{"--dsw-alias-bg-base":"#fff"}}');
    assert.equal(result.ok, false);
    assert.match(result.error, /colorScheme/);
});

test('parseImportedSkin refuses a token key outside --dsw-', () => {
    const result = parseImportedSkin('{"colorScheme":"dark","tokens":{"background":"#000"}}');
    assert.equal(result.ok, false);
    assert.match(result.error, /--dsw-/);
});

test('parseImportedSkin refuses an empty token map', () => {
    const result = parseImportedSkin('{"colorScheme":"dark","tokens":{}}');
    assert.equal(result.ok, false);
    assert.match(result.error, /不能为空/);
});

test('parseImportedSkin refuses a non-string token value', () => {
    const result = parseImportedSkin('{"colorScheme":"dark","tokens":{"--dsw-alias-bg-base":42}}');
    assert.equal(result.ok, false);
    assert.match(result.error, /非空字符串/);
});

test('parseImportedSkin trims token values and names the offender', () => {
    const bad = parseImportedSkin('{"colorScheme":"dark","tokens":{"--dsw-x":"  "}}');
    assert.equal(bad.ok, false);
    assert.match(bad.error, /--dsw-x/);

    const good = parseImportedSkin('{"colorScheme":"dark","tokens":{"--dsw-x":"  #123456  "}}');
    assert.equal(good.ok, true);
    assert.equal(good.value.tokens['--dsw-x'], '#123456');
});

/* ------------------------------------------------------------------ normalizeState */

test('normalizeState turns null into documented defaults', () => {
    const state = normalizeState(null, 'default');
    assert.equal(state.skinId, 'default');
    assert.deepEqual(state.custom, []);
    assert.deepEqual(state.buttons, { ripple: false, shimmer: true, lift: true });
    assert.equal(state.ambience.aurora, false);
    assert.equal(state.ambience.wallpaper.enabled, false);
    assert.equal(state.ambience.wallpaper.fit, 'cover');
    assert.equal(state.ambience.wallpaper.opacity, 0.45);
    assert.equal(state.ambience.wallpaper.blur, 0);
});

test('normalizeState drops unknown wallpaper fit modes', () => {
    const state = normalizeState({ ambience: { wallpaper: { fit: 'stretch' } } }, 'default');
    assert.equal(state.ambience.wallpaper.fit, 'stretch');
    const bogus = normalizeState({ ambience: { wallpaper: { fit: 'wobble' } } }, 'default');
    assert.equal(bogus.ambience.wallpaper.fit, 'cover');
});

test('normalizeState clamps numeric ranges', () => {
    const high = normalizeState({ ambience: { wallpaper: { opacity: 9, blur: 999 } } }, 'default');
    assert.equal(high.ambience.wallpaper.opacity, 1);
    assert.equal(high.ambience.wallpaper.blur, 40);

    const low = normalizeState({ ambience: { wallpaper: { opacity: -3, blur: -5 } } }, 'default');
    assert.equal(low.ambience.wallpaper.opacity, 0.05);
    assert.equal(low.ambience.wallpaper.blur, 0);
});

test('normalizeState keeps only plausible imported skins', () => {
    const state = normalizeState({
        custom: [{ id: 'a', name: 'A' }, null, 'nope', { name: 'no id' }, { id: 'b' }]
    }, 'default');
    assert.deepEqual(state.custom.map(skin => skin.id), ['a', 'b']);
});

test('normalizeState treats a non-object payload as empty', () => {
    assert.equal(normalizeState('nope', 'default').skinId, 'default');
    assert.equal(normalizeState(undefined, 'default').skinId, 'default');
});

test('normalizeState forces the error field to be transient', () => {
    const state = normalizeState({ ambience: { wallpaper: { error: 'stale' } } }, 'default');
    assert.equal(state.ambience.wallpaper.error, '');
});

/* ------------------------------------------------------------------ misc helpers */

test('cssUrl escapes the characters that would break out of url("")', () => {
    assert.equal(cssUrl('a"b'), 'a\\"b');
    assert.equal(cssUrl('a\\b'), 'a\\\\b');
    assert.equal(cssUrl('a\nb'), 'a\\\nb');
    assert.equal(cssUrl('https://x/y.png?v=1'), 'https://x/y.png?v=1');
});

test('fillTemplate blanks an unknown placeholder rather than leaving it', () => {
    assert.equal(fillTemplate('a{{X}}b{{MISSING}}c', { X: '1' }), 'a1bc');
});

test('fillTemplate substitutes keys that contain digits', () => {
    // Regression guard: the aurora stops are named AURORA_1..AURORA_3, and a
    // letters-only key class left them unsubstituted — the gradient then failed
    // to parse and the whole aurora layer vanished with no error anywhere.
    assert.equal(
        fillTemplate('{{AURORA_1}}/{{AURORA_2}}/{{AURORA_3}}', { AURORA_1: 'a', AURORA_2: 'b', AURORA_3: 'c' }),
        'a/b/c'
    );
});

test('withCustomIdentity is stable for identical input and distinct otherwise', () => {
    const one = { name: 'A', colorScheme: 'dark', tokens: { '--dsw-x': '#111111' } };
    const two = { name: 'A', colorScheme: 'dark', tokens: { '--dsw-x': '#222222' } };
    assert.equal(withCustomIdentity(one).id, withCustomIdentity(one).id);
    assert.notEqual(withCustomIdentity(one).id, withCustomIdentity(two).id);
    assert.match(withCustomIdentity(one).id, /^selfskin-custom-/);
});

test('withCustomIdentity derives a three-stop swatch with fallbacks', () => {
    const bare = withCustomIdentity({ name: 'A', colorScheme: 'dark', tokens: { '--dsw-x': '#111111' } });
    assert.equal(bare.swatch.length, 3);
    const rich = withCustomIdentity({
        name: 'B',
        colorScheme: 'light',
        tokens: {
            '--dsw-alias-bg-base': '#ffffff',
            '--dsw-alias-brand-primary': '#ff0000',
            '--dsw-alias-label-primary': '#000000'
        }
    });
    assert.deepEqual(rich.swatch, ['#ffffff', '#ff0000', '#000000']);
});

test('hashString is deterministic', () => {
    assert.equal(hashString('hello'), hashString('hello'));
    assert.notEqual(hashString('hello'), hashString('hellp'));
});

test('rippleClip reproduces the button rect as insets', () => {
    // Span exactly covers the button: every inset is zero.
    const exact = rippleClip(0, 0, 100, { top: 0, right: 100, bottom: 100, left: 0 }, '8px');
    assert.equal(exact, 'inset(0px 0px 0px 0px round 8px)');

    // Concentric but larger: the insets stay equal on all four sides.
    const concentric = rippleClip(-50, -50, 200, { top: 0, right: 100, bottom: 100, left: 0 }, '4px');
    assert.equal(concentric, 'inset(50px 50px 50px 50px round 4px)');

    // Off-centre: each side reports its own distance to the button edge.
    const offCentre = rippleClip(-80, -50, 200, { top: 0, right: 100, bottom: 100, left: 0 }, '6px');
    assert.equal(offCentre, 'inset(50px 20px 50px 80px round 6px)');
});

test('rippleClip clamps every inset to the span extent', () => {
    // Span far left of the button: the raw distances exceed the span itself and
    // must saturate, so a clip can never describe an impossible region.
    const size = 100;
    const clip = rippleClip(-900, 0, size, { top: 0, right: 100, bottom: 100, left: 0 }, '0');
    const inner = clip.slice('inset('.length, clip.indexOf(' round'));
    const insets = inner.split(/\s+/).map(token => parseFloat(token));
    assert.equal(insets.length, 4);
    for (const inset of insets) {
        assert.ok(Number.isFinite(inset), 'inset should parse, got ' + inset);
        assert.ok(inset >= -size && inset <= size, 'inset ' + inset + ' escaped +/-' + size);
    }
    assert.equal(insets[3], size, 'the left inset should saturate at the span extent');
});

test('wallpaperValues maps fit modes onto background properties', () => {
    assert.equal(wallpaperValues({ fit: 'cover', url: 'u', opacity: 0.5, blur: 0 }).WALLPAPER_SIZE, 'cover');
    assert.equal(wallpaperValues({ fit: 'tile', url: 'u', opacity: 0.5, blur: 0 }).WALLPAPER_REPEAT, 'repeat');
    assert.equal(wallpaperValues({ fit: 'stretch', url: 'u', opacity: 0.5, blur: 0 }).WALLPAPER_SIZE, '100% 100%');
    const blurred = wallpaperValues({ fit: 'cover', url: 'u', opacity: 0.5, blur: 40 });
    assert.ok(Number(blurred.WALLPAPER_SCALE) > 1, 'blur should scale the layer up');
});

test('auroraValues derives stops from the accent and scheme', () => {
    const dark = auroraValues('#4f6bff', 'dark');
    assert.match(dark.AURORA_1, /#4f6bff/);
    assert.equal(dark.AURORA_OPACITY, '0.55');
    const light = auroraValues(null, 'light');
    assert.match(light.AURORA_1, /#7aa7ff/);
    assert.equal(light.AURORA_OPACITY, '0.34');
});

/* ------------------------------------------------------------------ skin catalog */

test('every picker id the catalog can produce is a valid theme id', () => {
    // Regression guard. An earlier revision shipped a `default` sentinel that was
    // not a registered theme, so setTheme threw, the recovery path swallowed it,
    // and selecting it left the previous skin in place with no error.
    const hostIds = HOST_APPEARANCES.map(item => item.id).sort();
    assert.deepEqual(hostIds, ['dark', 'light', 'system']);
    assert.ok(hostIds.includes(DEFAULT_SKIN_ID), 'the default selection must be a real preference id');
});

test('built-in skin ids are unique and namespaced', () => {
    const ids = BUILTIN_SKINS.map(skin => skin.id);
    assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
    const hostIds = new Set(HOST_APPEARANCES.map(item => item.id));
    for (const id of ids) {
        assert.match(id, /^selfskin-[a-z0-9-]+$/, 'unexpected id: ' + id);
        assert.ok(!hostIds.has(id), 'a skin must not shadow a host preference id: ' + id);
    }
});

test('every built-in skin is renderable', () => {
    for (const skin of BUILTIN_SKINS) {
        assert.ok(['light', 'dark'].includes(skin.colorScheme), skin.id + ' needs a scheme');
        assert.equal(skin.swatch.length, 3, skin.id + ' needs a three-stop swatch');
        assert.ok(skin.name.zh && skin.name.en, skin.id + ' needs both names');
        const names = Object.keys(skin.tokens);
        assert.ok(names.length >= 10, skin.id + ' should cover a meaningful token set');
        for (const name of names) {
            assert.ok(name.startsWith('--dsw-'), skin.id + ' has a non-token key: ' + name);
            assert.equal(typeof skin.tokens[name], 'string', skin.id + ' token ' + name + ' must be a plain string');
            assert.ok(skin.tokens[name].trim() !== '', skin.id + ' token ' + name + ' must not be empty');
        }
        // A skin that does not repaint the canvas is not visible as a skin.
        assert.ok('--dsw-alias-bg-base' in skin.tokens, skin.id + ' must override the canvas token');
        assert.ok('--dsw-alias-brand-primary' in skin.tokens, skin.id + ' must override the accent token');
    }
});

/* ------------------------------------------------------------------ report */

process.stdout.write('\n' + passed + ' passed, ' + failures.length + ' failed\n');
for (const failure of failures) {
    process.stdout.write('\n--- ' + failure.name + '\n' + (failure.error && failure.error.stack ? failure.error.stack : String(failure.error)) + '\n');
}
process.exit(failures.length === 0 ? 0 : 1);
