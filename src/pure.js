/**
 * dsh-selfskin — pure helpers.
 *
 * Everything here is dependency-free: no DOM, no React, no theme service. That is
 * deliberate. build.mjs inlines this file into the browser bundle with its
 * `export` keywords stripped, while `test/pure.test.mjs` imports it directly, so
 * the parts most likely to be wrong — the import validator, the state normalizer
 * and the ripple clip geometry — are covered by real assertions instead of only
 * being exercised through a running app.
 *
 * Keep this file free of side effects and free of references to `SKINS`, `CSS`,
 * `React` or `document`: it has to be loadable in Node.
 */

/** localStorage key holding every preference this plugin owns. */
export const STORAGE_KEY = 'dsh-selfskin:state:v1';

/** Prefix that marks an id as user-imported rather than built-in. */
export const CUSTOM_SKIN_PREFIX = 'selfskin-custom-';

/** Upper bound on imported skins, so localStorage cannot be filled by accident. */
export const MAX_CUSTOM_SKINS = 20;

/** Accepted wallpaper fit modes. */
export const WALLPAPER_FITS = ['cover', 'contain', 'stretch', 'tile'];

/**
 * Default wallpaper settings.
 *
 * `opacity` defaults high (0.6) on purpose: a wallpaper that reads as a faint
 * ghost behind the frame is the "颜色过淡" complaint, and the frame veil
 * (`WALLPAPER_TOKENS` in client.js) already keeps the image from competing with
 * text. The opacity slider (5-100%) remains the fine control.
 */
export function defaultWallpaper() {
    return { enabled: false, url: '', opacity: 0.6, blur: 0, fit: 'cover', error: '' };
}

/** Default button-effect switches: ripple off (opt-in), the rest on. */
export function defaultButtons() {
    return { ripple: false, shimmer: true, lift: true };
}

/** Default ambience switches: all four off until asked for. */
export function defaultAmbience() {
    return { aurora: false, particles: false, glass: false, wallpaper: defaultWallpaper() };
}

/**
 * Factory state for a given default skin id.
 * @param defaultSkinId - the sentinel id meaning "follow the host".
 * @returns a fresh default state.
 */
export function defaultState(defaultSkinId) {
    return {
        skinId: defaultSkinId,
        custom: [],
        buttons: defaultButtons(),
        ambience: defaultAmbience()
    };
}

/**
 * Coerce an unknown payload into a shape the components can trust.
 *
 * Every field falls back individually rather than wholesale, because a payload
 * written by an older build of this plugin is expected to be missing newer keys.
 * @param raw - whatever came out of localStorage.
 * @param defaultSkinId - the sentinel id meaning "follow the host".
 * @returns a fully populated state.
 */
export function normalizeState(raw, defaultSkinId) {
    const source = raw !== null && typeof raw === 'object' && Array.isArray(raw) !== true ? raw : {};
    const buttons = source.buttons !== null && typeof source.buttons === 'object' ? source.buttons : {};
    const ambience = source.ambience !== null && typeof source.ambience === 'object' ? source.ambience : {};
    const wallpaper = ambience.wallpaper !== null && typeof ambience.wallpaper === 'object' ? ambience.wallpaper : {};
    const custom = Array.isArray(source.custom)
        ? source.custom.filter(skin => skin !== null && typeof skin === 'object' && typeof skin.id === 'string').slice(0, MAX_CUSTOM_SKINS)
        : [];
    return {
        skinId: typeof source.skinId === 'string' ? source.skinId : defaultSkinId,
        custom,
        buttons: {
            ripple: buttons.ripple === true,
            shimmer: buttons.shimmer !== false,
            lift: buttons.lift !== false
        },
        ambience: {
            aurora: ambience.aurora === true,
            particles: ambience.particles === true,
            glass: ambience.glass === true,
            wallpaper: {
                enabled: wallpaper.enabled === true,
                url: typeof wallpaper.url === 'string' ? wallpaper.url : '',
                opacity: typeof wallpaper.opacity === 'number' ? Math.min(1, Math.max(0.05, wallpaper.opacity)) : 0.6,
                blur: typeof wallpaper.blur === 'number' ? Math.min(40, Math.max(0, wallpaper.blur)) : 0,
                fit: WALLPAPER_FITS.includes(wallpaper.fit) ? wallpaper.fit : 'cover',
                error: ''
            }
        }
    };
}

/**
 * Stable non-cryptographic hash (djb2), used to derive an import's id.
 *
 * The id only has to be stable for the same input and differ between inputs; it
 * is never a security boundary.
 * @param text - input text.
 * @returns a base-36 digest.
 */
export function hashString(text) {
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
}

/**
 * Give a parsed import its id and preview chip.
 * @param skin - `{ name, colorScheme, tokens }`.
 * @returns the stored shape `{ id, name, colorScheme, tokens, swatch }`.
 */
export function withCustomIdentity(skin) {
    const tokens = skin.tokens;
    return {
        id: CUSTOM_SKIN_PREFIX + hashString(skin.name + '|' + JSON.stringify(tokens)),
        name: skin.name,
        colorScheme: skin.colorScheme,
        tokens,
        swatch: [
            tokens['--dsw-alias-bg-base'] || (skin.colorScheme === 'dark' ? '#131313' : '#f5f5f5'),
            tokens['--dsw-alias-brand-primary'] || '#888888',
            tokens['--dsw-alias-label-primary'] || (skin.colorScheme === 'dark' ? '#ffffff' : '#111111')
        ]
    };
}

/**
 * Parse and validate a pasted skin document.
 *
 * Validation is strict about the token keys on purpose: a key outside `--dsw-*`
 * would be written onto `<body>` as an arbitrary custom property, and a key that
 * happens to name a non-token property would corrupt unrelated surfaces. Both are
 * refused with a message naming the offending key.
 * @param text - raw JSON pasted by the user.
 * @returns `{ ok: true, value }` or `{ ok: false, error }`.
 */
export function parseImportedSkin(text) {
    const trimmed = String(text === null || text === undefined ? '' : text).trim();
    if (trimmed === '') return { ok: false, error: '请先粘贴皮肤 JSON。' };

    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        const detail = error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message : String(error);
        return { ok: false, error: 'JSON 解析失败：' + detail };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: '顶层必须是一个对象。' };
    }

    const name = typeof parsed.name === 'string' && parsed.name.trim() !== '' ? parsed.name.trim() : '未命名皮肤';
    if (parsed.colorScheme !== 'light' && parsed.colorScheme !== 'dark') {
        return { ok: false, error: 'colorScheme 必须是 "light" 或 "dark"。' };
    }

    const rawTokens = parsed.tokens;
    if (rawTokens === null || typeof rawTokens !== 'object' || Array.isArray(rawTokens)) {
        return { ok: false, error: 'tokens 必须是一个对象。' };
    }
    const names = Object.keys(rawTokens);
    if (names.length === 0) {
        return { ok: false, error: 'tokens 不能为空，至少要覆盖一个 --dsw- 令牌。' };
    }

    const tokens = {};
    for (const tokenName of names) {
        if (tokenName.startsWith('--dsw-') !== true) {
            return { ok: false, error: '令牌名必须以 --dsw- 开头，收到："' + tokenName + '"' };
        }
        const value = rawTokens[tokenName];
        if (typeof value !== 'string' || value.trim() === '') {
            return { ok: false, error: '令牌 "' + tokenName + '" 的值必须是非空字符串。' };
        }
        tokens[tokenName] = value.trim();
    }
    return { ok: true, value: { name, colorScheme: parsed.colorScheme, tokens } };
}

/**
 * Replace `{{KEY}}` placeholders in a CSS template.
 *
 * The key class includes digits because several aurora stops are named
 * `AURORA_1`..`AURORA_3`: a letters-only pattern would silently leave those
 * placeholders in the sheet, and the gradient would be dropped as invalid CSS
 * with no error anywhere. That exact defect was caught by
 * `test/pure.test.mjs`, which is why the digits are pinned by a test.
 *
 * An unknown placeholder resolves to the empty string rather than surviving into
 * the stylesheet, where it would poison the whole rule.
 * @param template - CSS text.
 * @param values - placeholder values.
 * @returns the filled text.
 */
export function fillTemplate(template, values) {
    return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
        const value = values[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

/**
 * Escape a URL for use inside CSS `url("...")`.
 *
 * A pasted value containing a quote, a backslash or a newline would otherwise
 * close the string early — the way a user-supplied value escapes a `url()` and
 * injects further declarations.
 * @param url - raw URL.
 * @returns the escaped URL.
 */
export function cssUrl(url) {
    return String(url)
        .split('')
        .map(char => (char === '"' || char === '\\' || char === '\n' || char === '\r' ? '\\' + char : char))
        .join('');
}

/**
 * Clip geometry that keeps a ripple inside its button.
 *
 * The ripple span is drawn in this plugin's overlay layer and is therefore not
 * clipped by the button. `inset()` with a `round` radius reproduces the button's
 * corner rounding; each inset is the distance from a span edge to the matching
 * button edge and is legitimately negative when the span starts outside.
 * @param left - span left, viewport coordinates.
 * @param top - span top, viewport coordinates.
 * @param size - span edge length.
 * @param rect - button rect, viewport coordinates.
 * @param radius - button computed border-radius.
 * @returns a `clip-path` value.
 */
export function rippleClip(left, top, size, rect, radius) {
    const clamp = value => Math.max(-size, Math.min(size, value));
    const topInset = clamp(rect.top - top);
    const rightInset = clamp((left + size) - rect.right);
    const bottomInset = clamp((top + size) - rect.bottom);
    const leftInset = clamp(rect.left - left);
    return 'inset(' + topInset + 'px ' + rightInset + 'px ' + bottomInset + 'px ' + leftInset + 'px round ' + radius + ')';
}

/**
 * Wallpaper values for the stylesheet template.
 * @param wallpaper - wallpaper settings.
 * @returns template values.
 */
export function wallpaperValues(wallpaper) {
    const fit = wallpaper.fit;
    // Blur samples past the element edge and bleeds transparency inward, so the
    // layer is scaled up by an amount proportional to the blur radius.
    const scale = 1 + Math.min(0.12, wallpaper.blur / 320);
    return {
        WALLPAPER_URL: cssUrl(wallpaper.url),
        WALLPAPER_SIZE: fit === 'stretch' ? '100% 100%' : fit,
        WALLPAPER_REPEAT: fit === 'tile' ? 'repeat' : 'no-repeat',
        WALLPAPER_OPACITY: String(wallpaper.opacity),
        WALLPAPER_BLUR: String(wallpaper.blur),
        WALLPAPER_SCALE: scale.toFixed(4)
    };
}

/**
 * Aurora tint stops, derived from an accent colour and a colour scheme.
 *
 * Stops are emitted as CSS expressions rather than resolved colours, so the
 * aurora re-tints when the skin changes without this module knowing any palette.
 * @param accent - accent colour of the active skin, or null.
 * @param scheme - `light` or `dark`.
 * @returns template values.
 */
export function auroraValues(accent, scheme) {
    const base = accent || (scheme === 'dark' ? '#4f6bff' : '#7aa7ff');
    return {
        AURORA_1: 'color-mix(in srgb, ' + base + ' 48%, transparent)',
        AURORA_2: 'color-mix(in srgb, color-mix(in srgb, ' + base + ' 72%, #7b5cff) 36%, transparent)',
        AURORA_3: 'color-mix(in srgb, color-mix(in srgb, ' + base + ' 60%, #22d3ee) 30%, transparent)',
        AURORA_OPACITY: scheme === 'dark' ? '0.55' : '0.34'
    };
}
