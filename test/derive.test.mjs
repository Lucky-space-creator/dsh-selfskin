/**
 * dsh-selfskin — tests for the DIY palette derivation engine (src/derive.js).
 *
 * The engine is dependency-free (no DOM/React), so it is exercised directly here
 * the same way test/pure.test.mjs exercises src/pure.js. Every assertion is
 * falsifiable: the "warns on bad seed" and "warns on low contrast" cases set up a
 * concrete input that must trip the guard, and the round-trip cases assert a
 * numeric tolerance rather than exact equality.
 */

import {
    hexToRgb,
    rgbToHex,
    rgbToOklab,
    oklabToRgb,
    mixOklab,
    withAlpha,
    contrastHex,
    deriveTokens
} from '../src/derive.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition === true) {
        passed += 1;
    } else {
        failed += 1;
        process.stdout.write('  FAIL: ' + message + '\n');
    }
}

function near(a, b, tolerance, message) {
    assert(Math.abs(a - b) <= tolerance, message + ' (got ' + a + ', want ~' + b + ')');
}

/* ---- colour primitives ---- */

const rgb = hexToRgb('#3b82f6');
assert(rgb !== null && rgb.r === 59 && rgb.g === 130 && rgb.b === 246, 'hexToRgb parses #rrggbb');
assert(hexToRgb('#fff') !== null && hexToRgb('#fff').r === 255, 'hexToRgb parses #rgb shorthand');
assert(hexToRgb('not-a-colour') === null, 'hexToRgb rejects non-hex');
assert(hexToRgb('#3b82f6').r !== undefined, 'hexToRgb returns channels');

assert(rgbToHex({ r: 59, g: 130, b: 246 }) === '#3b82f6', 'rgbToHex round-trips #3b82f6');

const back = oklabToRgb(rgbToOklab({ r: 59, g: 130, b: 246 }));
near(back.r, 59, 1, 'rgb->oklab->rgb r');
near(back.g, 130, 1, 'rgb->oklab->rgb g');
near(back.b, 246, 1, 'rgb->oklab->rgb b');

// The OKLab midpoint of black/white is a neutral grey around sRGB ~0.39 (not the
// linear midpoint 0.5 / 128, nor the sRGB midpoint), because OKLab L is a single
// perceptual axis. Assert it is neutral and sits in that perceptual band.
const mid = mixOklab('#000000', '#ffffff', 0.5);
const midRgb = hexToRgb(mid);
assert(midRgb !== null && midRgb.r === midRgb.g && midRgb.g === midRgb.b,
    'mixOklab midpoint of black/white is a neutral grey');
assert(midRgb !== null && midRgb.r > 90 && midRgb.r < 110,
    'mixOklab midpoint is the perceptual ~0.39 grey (got ' + (midRgb && midRgb.r) + ')');
assert(mixOklab('#3b82f6', '#000000', 0) === '#3b82f6', 'mixOklab t=0 keeps A');
// 'banana' is not a hex colour (contains no valid 3/6-digit hex), so it returns
// null; contrast with the string 'bad', which is a valid 3-digit hex by accident.
assert(mixOklab('banana', '#000000', 0.5) === null, 'mixOklab returns null on a bad seed');

assert(withAlpha('#3b82f6', 0.5) === 'rgba(59, 130, 246, 0.5)', 'withAlpha formats rgba');
assert(withAlpha(null, 0.5) === 'rgba(0, 0, 0, 0.5)', 'withAlpha null falls back to transparent black');

assert(contrastHex('#000000', '#ffffff') > 20, 'contrastHex black/white is ~21:1');
assert(contrastHex('#666666', '#666666') === 1, 'contrastHex identical colours is 1:1');

/* ---- derivation ---- */

const seeds = { accent: '#3b82f6', secondary: '#22d3ee', surface: '#0a1020', text: '#e6edf8' };
const dark = deriveTokens(seeds, 'dark');
const light = deriveTokens(seeds, 'light');

// Every key resolves to a non-empty string and carries the --dsw- prefix, which
// is the contract the import validator enforces.
const allKeys = Object.keys(dark.tokens);
assert(allKeys.length === 32, 'deriveTokens dark produces 32 tokens (got ' + allKeys.length + ')');
// The surface seed the user picks is intentionally identical across schemes; the
// schemes differ in the derived paper/ink overlays (alpha and blend amount).
assert(light.tokens['--dsw-alias-bg-base'] === dark.tokens['--dsw-alias-bg-base'],
    'the user-picked surface seed is identical across schemes');
assert(light.tokens['--dsw-alias-button-tool-bar-fill'] !== dark.tokens['--dsw-alias-button-tool-bar-fill'],
    'light and dark differ in the derived paper overlays');
assert(allKeys.every(k => k.startsWith('--dsw-') && typeof dark.tokens[k] === 'string' && dark.tokens[k] !== ''),
    'every dark token is a non-empty --dsw- string');
assert(Object.keys(light.tokens).length === 32, 'deriveTokens light produces 32 tokens');

// The seed colours land where they should, un-rewritten (warn, never clamp).
assert(dark.tokens['--dsw-alias-brand-primary'] === '#3b82f6', 'brand-primary equals the accent seed');
assert(dark.tokens['--dsw-alias-bg-base'] === '#0a1020', 'bg-base equals the surface seed');
assert(dark.tokens['--dsw-alias-label-primary'] === '#e6edf8', 'label-primary equals the text seed');

// A seed that is not a hex colour falls back to the scheme default and is
// reported, rather than producing a broken token or throwing.
const bad = deriveTokens({ accent: 'banana', secondary: '#22d3ee', surface: '#0a1020', text: '#e6edf8' }, 'dark');
assert(bad.warnings.some(w => w.indexOf('accent') >= 0), 'invalid accent seed produces a warning');
assert(bad.tokens['--dsw-alias-brand-primary'] !== 'banana', 'invalid accent seed is not written through');

// Low-contrast text against its own surface must be flagged, not silently fixed.
const lowContrast = deriveTokens({ accent: '#1a1f2b', secondary: '#1a1f2b', surface: '#10141c', text: '#1c2230' }, 'dark');
assert(lowContrast.warnings.length > 0, 'a near-invisible palette produces contrast warnings');
assert(lowContrast.tokens['--dsw-alias-label-primary'] === '#1c2230', 'low-contrast text is kept, not rewritten');

// The derived tokens must be acceptable to the same validator the pasted-JSON
// path uses, so a saved DIY theme is a legitimate custom skin.
assert(allKeys.every(k => k.startsWith('--dsw-')), 'derived keys pass the import validator prefix rule');

/* ---- summary ---- */

process.stdout.write('derive.test.mjs: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed === 0 ? 0 : 1);
