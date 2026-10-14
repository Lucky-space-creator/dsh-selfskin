/**
 * dsh-selfskin — DIY theme derivation engine.
 *
 * Dependency-free, DOM-free and React-free on purpose, so `test/pure.test.mjs`
 * can exercise it directly and build.mjs can inline it into the browser bundle
 * with its `export` keywords stripped (same treatment as src/pure.js).
 *
 * WHAT THIS FILE IS FOR
 * A DIY theme is still a token table — the only shape `ctx.theme.register()`
 * accepts. The user picks four seed colours and this module derives the full set
 * of `~32` `--dsw-alias-*` / `--dsw-specific-*` tokens the host reads, in the
 * OKLab colour space (perceptually even, so a 10% lightness step looks the same
 * everywhere) and then *warns* about contrast problems rather than silently
 * rewriting the user's colours. The host's own Appearance toggle stays the
 * authority on light/dark; a skin only carries one `colorScheme`.
 *
 * WHY OKLAB, NOT HSL
 * HSL lightness is relative to each hue's own extremes, so "make this 20% lighter"
 * produces wildly different perceptual steps between a yellow and a blue. OKLab's
 * L is a single perceptual axis, so mixing and stepping are uniform across hues —
 * which is exactly what a one-click "derive my whole palette" needs.
 *
 * WHY WARN, NOT CLAMP
 * A curated skin (the kind shipped by a vendor) can be force-corrected. A DIY
 * tool is the user's taste; swapping their accent for a "safe" one would be the
 * plugin deciding for them. So contrast shortfalls are reported as warnings and
 * the decision is left to the user.
 */

/* ------------------------------------------------------------------ *
 * Colour primitives
 * ------------------------------------------------------------------ */

/**
 * Parse a CSS hex colour into 0-255 channels.
 * @param hex - `#rgb`, `#rrggbb`, or without the leading `#`.
 * @returns `{ r, g, b }` or `null` when the string is not a hex colour.
 */
export function hexToRgb(hex) {
    const text = String(hex == null ? '' : hex).trim();
    const value = text.startsWith('#') ? text.slice(1) : text;
    let r;
    let g;
    let b;
    if (/^[0-9a-fA-F]{3}$/.test(value)) {
        r = parseInt(value[0] + value[0], 16);
        g = parseInt(value[1] + value[1], 16);
        b = parseInt(value[2] + value[2], 16);
    } else if (/^[0-9a-fA-F]{6}$/.test(value)) {
        r = parseInt(value.slice(0, 2), 16);
        g = parseInt(value.slice(2, 4), 16);
        b = parseInt(value.slice(4, 6), 16);
    } else {
        return null;
    }
    return { r, g, b };
}

/** Build a `#rrggbb` string from 0-255 channels (each clamped to range). */
export function rgbToHex(rgb) {
    const to = channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0');
    return '#' + to(rgb.r) + to(rgb.g) + to(rgb.b);
}

/** sRGB channel (0-255) -> linear (0-1). */
function channelToLinear(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear channel (0-1) -> sRGB (0-255). */
function linearToChannel(linear) {
    const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    return c * 255;
}

/** sRGB -> OKLab (Björn Ottosson's reference matrices). */
export function rgbToOklab(rgb) {
    const r = channelToLinear(rgb.r);
    const g = channelToLinear(rgb.g);
    const b = channelToLinear(rgb.b);

    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);

    return {
        L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
    };
}

/** OKLab -> sRGB (channels clamped to 0-255). */
export function oklabToRgb(lab) {
    const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
    const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
    const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

    return { r: linearToChannel(r), g: linearToChannel(g), b: linearToChannel(b) };
}

/**
 * Mix two hex colours in OKLab.
 * @param hexA - first colour.
 * @param hexB - second colour.
 * @param t - mix amount, 0 = A, 1 = B.
 * @returns a `#rrggbb` string, or `null` if either input is not a hex colour.
 */
export function mixOklab(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (a === null || b === null) return null;
    const labA = rgbToOklab(a);
    const labB = rgbToOklab(b);
    const mixed = {
        L: labA.L + (labB.L - labA.L) * t,
        a: labA.a + (labB.a - labA.a) * t,
        b: labA.b + (labB.b - labA.b) * t
    };
    return rgbToHex(oklabToRgb(mixed));
}

/**
 * A colour plus an alpha, as an `rgba(...)` string.
 * @param hex - solid colour; `null` yields transparent black.
 * @param alpha - 0-1.
 * @returns an `rgba(r, g, b, a)` string.
 */
export function withAlpha(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (rgb === null) return 'rgba(0, 0, 0, ' + alpha + ')';
    const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

/** WCAG 2.1 relative luminance of an sRGB colour. */
export function relativeLuminance(rgb) {
    const r = channelToLinear(rgb.r);
    const g = channelToLinear(rgb.g);
    const b = channelToLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio between two colours (1 to 21).
 * @param rgbA - first colour.
 * @param rgbB - second colour.
 * @returns the contrast ratio.
 */
export function contrastRatio(rgbA, rgbB) {
    const la = relativeLuminance(rgbA);
    const lb = relativeLuminance(rgbB);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast between two hex colours, or 1 when either is not a hex colour. */
export function contrastHex(hexA, hexB) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (a === null || b === null) return 1;
    return contrastRatio(a, b);
}

/* ------------------------------------------------------------------ *
 * Palette derivation
 * ------------------------------------------------------------------ */

/** Dark-scheme seed defaults, also used to fall back on a bad seed. */
const DARK_DEFAULTS = { accent: '#3b82f6', secondary: '#22d3ee', surface: '#0a1020', text: '#e6edf8' };

/** Light-scheme seed defaults. */
const LIGHT_DEFAULTS = { accent: '#2563eb', secondary: '#0891b2', surface: '#f5f6f8', text: '#1f2430' };

/**
 * The token keys the derivation produces, in the same order the built-in skins
 * declare them. Every key here has a `--dsw-` prefix, so a derived skin passes
 * the same import validator the pasted-JSON path uses.
 */
const TOKEN_KEYS = [
    '--dsw-alias-bg-base',
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-layer-3',
    '--dsw-alias-bg-layer-4',
    '--dsw-alias-bg-mask-1',
    '--dsw-alias-brand-primary',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-label-caption',
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-border-l3',
    '--dsw-alias-border-l4',
    '--dsw-alias-link',
    '--dsw-alias-button-primary-fill',
    '--dsw-alias-button-primary-hover',
    '--dsw-alias-button-ghost-active-fill',
    '--dsw-alias-button-ghost-active-border',
    '--dsw-alias-button-tool-bar-fill',
    '--dsw-alias-button-tool-bar-hover',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-interactive-bg-active',
    '--dsw-alias-state-business-primary',
    '--dsw-alias-markdown-inline-code',
    '--dsw-alias-markdown-code-block',
    '--dsw-alias-scrollbar-bg-l2',
    '--dsw-alias-scrollbar-hover-l2',
    '--dsw-specific-sidebar-fill',
    '--dsw-specific-input-major',
    '--dsw-specific-menu'
];

/**
 * Derive a complete token table from four seed colours.
 *
 * The recipe is a small, documented heuristic — not a per-pixel match for the
 * built-in skins — and that is appropriate for a DIY tool: it produces a
 * coherent, readable palette from whatever the user picked, and the contrast
 * warnings tell them when a choice falls short.
 *
 * @param seeds - `{ accent, secondary, surface, text }`, any of which may be
 *   missing or invalid; an invalid seed falls back to the scheme default and is
 *   reported in `warnings`.
 * @param scheme - `'light'` or `'dark'`.
 * @returns `{ tokens, warnings }`. `tokens` holds 32 `--dsw-*` string values;
 *   `warnings` is an array of human-readable contrast notes (possibly empty).
 */
export function deriveTokens(seeds, scheme) {
    const isDark = scheme !== 'light';
    const defaults = isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS;
    const warnings = [];

    function pick(key) {
        const value = seeds && typeof seeds === 'object' ? seeds[key] : undefined;
        if (typeof value !== 'string' || hexToRgb(value) === null) {
            if (value !== undefined && value !== '') {
                warnings.push('种子色 ' + key + ' 不是合法十六进制色，已回退为默认值。');
            }
            return defaults[key];
        }
        return value;
    }

    const accent = pick('accent');
    const secondary = pick('secondary');
    const surface = pick('surface');
    const text = pick('text');

    // A near-black / near-white used for scrims and neutral fills; the host
    // already resolves alpha, so the exact shade only nudges the overlay tint.
    const ink = '#000000';
    const paper = '#ffffff';

    const tokens = {};
    tokens['--dsw-alias-bg-base'] = surface;
    tokens['--dsw-alias-bg-layer-1'] = mixOklab(surface, paper, 0.06) || surface;
    tokens['--dsw-alias-bg-layer-2'] = mixOklab(surface, paper, 0.13) || surface;
    tokens['--dsw-alias-bg-layer-3'] = mixOklab(surface, paper, 0.22) || surface;
    tokens['--dsw-alias-bg-layer-4'] = mixOklab(surface, paper, 0.32) || surface;
    tokens['--dsw-alias-bg-mask-1'] = withAlpha(mixOklab(surface, ink, isDark ? 0.7 : 0.5) || surface, isDark ? 0.62 : 0.28);

    tokens['--dsw-alias-brand-primary'] = accent;
    tokens['--dsw-alias-state-business-primary'] = accent;
    tokens['--dsw-alias-link'] = secondary;

    tokens['--dsw-alias-label-primary'] = text;
    tokens['--dsw-alias-label-secondary'] = mixOklab(text, surface, 0.25) || text;
    tokens['--dsw-alias-label-tertiary'] = mixOklab(text, surface, 0.45) || text;
    tokens['--dsw-alias-label-caption'] = mixOklab(text, surface, 0.58) || text;

    tokens['--dsw-alias-border-l1'] = mixOklab(surface, text, 0.12) || surface;
    tokens['--dsw-alias-border-l2'] = mixOklab(surface, text, 0.18) || surface;
    tokens['--dsw-alias-border-l3'] = mixOklab(surface, text, 0.26) || surface;
    tokens['--dsw-alias-border-l4'] = mixOklab(surface, text, 0.34) || surface;

    tokens['--dsw-alias-button-primary-fill'] = 'linear-gradient(135deg, ' + (mixOklab(accent, ink, 0.16) || accent) + ', ' + accent + ')';
    tokens['--dsw-alias-button-primary-hover'] = 'linear-gradient(135deg, ' + (mixOklab(accent, ink, 0.06) || accent) + ', ' + (mixOklab(accent, paper, 0.14) || accent) + ')';
    tokens['--dsw-alias-button-ghost-active-fill'] = withAlpha(accent, 0.14);
    tokens['--dsw-alias-button-ghost-active-border'] = withAlpha(accent, 0.5);
    tokens['--dsw-alias-button-tool-bar-fill'] = withAlpha(paper, isDark ? 0.04 : 0.05);
    tokens['--dsw-alias-button-tool-bar-hover'] = withAlpha(paper, isDark ? 0.09 : 0.12);
    tokens['--dsw-alias-interactive-bg-hover'] = withAlpha(paper, isDark ? 0.06 : 0.08);
    tokens['--dsw-alias-interactive-bg-active'] = withAlpha(paper, isDark ? 0.1 : 0.12);

    tokens['--dsw-alias-markdown-inline-code'] = withAlpha(accent, 0.14);
    tokens['--dsw-alias-markdown-code-block'] = mixOklab(surface, paper, isDark ? 0.08 : 0.02) || surface;

    tokens['--dsw-alias-scrollbar-bg-l2'] = withAlpha(paper, isDark ? 0.1 : 0.12);
    tokens['--dsw-alias-scrollbar-hover-l2'] = withAlpha(paper, isDark ? 0.18 : 0.2);

    tokens['--dsw-specific-sidebar-fill'] = mixOklab(surface, paper, isDark ? 0.04 : 0.02) || surface;
    tokens['--dsw-specific-input-major'] = mixOklab(surface, paper, isDark ? 0.06 : 0) || surface;
    tokens['--dsw-specific-menu'] = mixOklab(surface, paper, isDark ? 0.05 : 0.01) || surface;

    // --- Contrast warnings (warn, never rewrite) -----------------------
    const crPrimary = contrastHex(text, surface);
    if (crPrimary < 4.5) {
        warnings.push('正文色与背景对比度 ' + crPrimary.toFixed(2) + ':1（建议 ≥ 4.5:1），暗色背景下可能偏灰。');
    }
    const secondaryColor = tokens['--dsw-alias-label-secondary'];
    const crSecondary = contrastHex(secondaryColor, surface);
    if (crSecondary < 4.5) {
        warnings.push('次要文字对比度 ' + crSecondary.toFixed(2) + ':1（建议 ≥ 4.5:1）。');
    }
    const captionColor = tokens['--dsw-alias-label-caption'];
    const crCaption = contrastHex(captionColor, surface);
    if (crCaption < 3) {
        warnings.push('弱化文字对比度 ' + crCaption.toFixed(2) + ':1（建议 ≥ 3:1）。');
    }
    // The primary button paints the accent as its fill and layers label text on
    // it; this is an approximation (host text colour varies) but a useful guard.
    const crOnAccent = contrastHex(text, accent);
    if (crOnAccent < 3) {
        warnings.push('主按钮文字（正文色）落在强调色上的对比度 ' + crOnAccent.toFixed(2) + ':1（建议 ≥ 3:1），按钮文字可能发虚。');
    }
    const crAccentBg = contrastHex(accent, surface);
    if (crAccentBg < 1.6) {
        warnings.push('强调色与背景对比度 ' + crAccentBg.toFixed(2) + ':1 过低，链接与高亮可能看不清。');
    }

    // Defensive: every key resolved to a string. A mix/alpha returning null would
    // have fallen back to a seed above, so this is a last-resort guarantee.
    for (const key of TOKEN_KEYS) {
        if (typeof tokens[key] !== 'string' || tokens[key] === '') {
            tokens[key] = isDark ? '#000000' : '#ffffff';
            warnings.push('令牌 ' + key + ' 推导失败，已占位。');
        }
    }

    return { tokens, warnings };
}
