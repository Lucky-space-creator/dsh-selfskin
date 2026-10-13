/* dsh-selfskin — browser half: plugin body.
 *
 * NOTE ON FORM: concatenated into the client bundle's factory scope by build.mjs
 * (after src/pure.js), so it is a plain script, not an ES module. `React`, `h`,
 * `SKINS`, `DEFAULT_SKIN_ID`, `CSS` and every helper from src/pure.js arrive from
 * that surrounding scope. Do not add `import`/`export` here.
 *
 * WHAT THIS HALF TOUCHES, AND WHAT IT REFUSES TO TOUCH
 *
 * Owned, mutated freely:
 *   - one `<style data-plugin="dsh-selfskin">` element in <head>, whose text is
 *     recomposed from the preference state (plugin-owned global styles are the
 *     documented mechanism; the shipped ui-theme package ships eight of them);
 *   - up to two `overrideTokens` layers (glass / wallpaper translucency);
 *   - registered theme ids, through the public theme service;
 *   - React elements inside `sidebar.panellist` (the 「皮肤管理」 row), `main`
 *     (the panel that row opens) and `shell.overlay` (ambient motes, ripples).
 *
 * Never touched:
 *   - no node is appended to `document.body`, no app root is replaced, no host
 *     class or inline style is written, and no other plugin's DOM is read. The
 *     ripple in particular is drawn in this plugin's own overlay layer and
 *     clipped to the button's rect, so a press never mutates a host element.
 *
 * The theme service is reached as `ctx.theme` because that is the name the shipped
 * ui-theme package provides it under (`ctx.provide("theme", new ThemeRuntime(...))`)
 * and the name ui-layout consumes it under. `slots` is the other required service.
 */

/** Override-layer identities; one layer per source, replaced on re-entry. */
const OVERRIDE_GLASS = 'dsh-selfskin/glass';
const OVERRIDE_WALLPAPER = 'dsh-selfskin/wallpaper';

/**
 * The id shared by the sidebar entry and the main panel it opens.
 *
 * The layout renders whichever `main` entry's `key` equals the active panel id,
 * and the sidebar row registered under `PANEL_ID` is what sets that id. The two
 * registrations are therefore halves of one contract: let the ids drift apart
 * and the row opens nothing, which fails silently — the sidebar still lists it.
 *
 * `order: 20` places the entry after the host's own plugin (0) and task (10)
 * rows, so the skin panel sits with the host's management panels rather than
 * ahead of them.
 */
const PANEL_ID = 'selfskin';

/**
 * The sidebar entry's caption.
 *
 * A plain string rather than a locale key: the rest of this plugin's copy is
 * hard-coded Chinese too, and mixing a translated navigation label into an
 * otherwise untranslated panel would be the inconsistency, not the fix.
 */
const PANEL_LABEL = '皮肤管理';

/** How long a ripple element lives before it is dropped from the layer. */
const RIPPLE_LIFETIME_MS = 700;

/** Starting point offered by the import panel's "填入模板" button. */
const SKIN_TEMPLATE = '{\n'
    + '  "name": "我的皮肤",\n'
    + '  "colorScheme": "dark",\n'
    + '  "tokens": {\n'
    + '    "--dsw-alias-brand-primary": "#ff6b6b",\n'
    + '    "--dsw-alias-bg-base": "#101418",\n'
    + '    "--dsw-alias-label-primary": "#f2f5fa"\n'
    + '  }\n'
    + '}';

/**
 * Translucency layer stacked while the wallpaper is on.
 *
 * Only the canvas and the sidebar are opened up; `--dsw-alias-bg-layer-*` keeps
 * its opaque values so cards, bubbles and inputs stay readable over a photograph.
 * Values are `{ light, dark }` pairs because that is the shape
 * `ThemeRuntime.composeActive()` resolves. A registered theme's own tokens are the
 * opposite — plain strings — and handing a pair to `register()` is the easiest way
 * to blank a surface.
 */
const WALLPAPER_TOKENS = {
    '--dsw-alias-bg-base': { light: 'rgba(255, 255, 255, 0.42)', dark: 'rgba(8, 12, 20, 0.46)' },
    '--dsw-specific-sidebar-fill': { light: 'rgba(255, 255, 255, 0.5)', dark: 'rgba(8, 12, 20, 0.52)' }
};

/**
 * Translucency layer stacked while the glass effect is on. Deeper than the
 * wallpaper layer, and it also opens the first two surface levels so nested
 * panels pick up the tint.
 */
const GLASS_TOKENS = {
    '--dsw-alias-bg-base': { light: 'rgba(255, 255, 255, 0.34)', dark: 'rgba(8, 12, 20, 0.4)' },
    '--dsw-specific-sidebar-fill': { light: 'rgba(255, 255, 255, 0.42)', dark: 'rgba(8, 12, 20, 0.46)' },
    '--dsw-alias-bg-layer-1': { light: 'rgba(255, 255, 255, 0.62)', dark: 'rgba(20, 24, 34, 0.62)' },
    '--dsw-alias-bg-layer-2': { light: 'rgba(255, 255, 255, 0.7)', dark: 'rgba(26, 30, 42, 0.7)' }
};

/* ------------------------------------------------------------------ *
 * Stores
 *
 * Both keep a frozen snapshot and only replace it on change, which is what
 * `useSyncExternalStore` requires to avoid an infinite render loop.
 * ------------------------------------------------------------------ */

/**
 * Build a store around a plain state object.
 * @param initial - starting state.
 * @param write - persistence hook, called with every committed state.
 * @returns `{ subscribe, getSnapshot, commit }`.
 */
function createStore(initial, write) {
    let state = initial;
    const listeners = new Set();
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        getSnapshot() {
            return state;
        },
        /** Replace the whole state, persist it and notify subscribers. */
        commit(next) {
            state = Object.freeze(next);
            try {
                write(state);
            } catch (error) {
                // A full or blocked localStorage must not take the UI down: the
                // in-memory state stays authoritative for this page's lifetime.
                void error;
            }
            for (const listener of [...listeners]) listener();
        }
    };
}

/** Read the persisted payload; any failure means "no stored preference". */
function readPersistedRaw() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw === null ? null : JSON.parse(raw);
    } catch (error) {
        void error;
        return null;
    }
}

/**
 * Ripple registry.
 *
 * Its own store so the overlay component only re-renders while a ripple is alive,
 * never for a preference change.
 */
const ripples = (() => {
    let list = Object.freeze([]);
    const listeners = new Set();
    const notify = () => { for (const listener of [...listeners]) listener(); };
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        getSnapshot() {
            return list;
        },
        push(item) {
            list = Object.freeze([...list, item]);
            notify();
        },
        remove(id) {
            const next = list.filter(item => item.id !== id);
            if (next.length === list.length) return;
            list = Object.freeze(next);
            notify();
        }
    };
})();

/** Preference store: the single writer for localStorage. */
const store = (() => {
    const base = createStore(normalizeState(readPersistedRaw(), DEFAULT_SKIN_ID), (state) => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
    const commit = base.commit;
    return {
        subscribe: base.subscribe,
        getSnapshot: base.getSnapshot,
        /** Merge top-level fields. */
        patch(partial) {
            commit({ ...base.getSnapshot(), ...partial });
        },
        /** Merge one button effect switch. */
        patchButtons(partial) {
            const state = base.getSnapshot();
            commit({ ...state, buttons: { ...state.buttons, ...partial } });
        },
        /** Merge one ambience switch. */
        patchAmbience(partial) {
            const state = base.getSnapshot();
            commit({ ...state, ambience: { ...state.ambience, ...partial } });
        },
        /** Merge one wallpaper field. */
        patchWallpaper(partial) {
            const state = base.getSnapshot();
            commit({
                ...state,
                ambience: { ...state.ambience, wallpaper: { ...state.ambience.wallpaper, ...partial } }
            });
        },
        /**
         * Register an imported skin.
         * @param skin - validated `{ name, colorScheme, tokens }`.
         * @returns `{ ok: true, value }`, or `{ ok: false, error }`.
         */
        addCustomSkin(skin) {
            const state = base.getSnapshot();
            const entry = withCustomIdentity(skin);
            if (state.custom.some(item => item.id === entry.id)) {
                return { ok: false, error: '这套皮肤已经导入过了。' };
            }
            if (state.custom.length >= MAX_CUSTOM_SKINS) {
                return { ok: false, error: '导入数量已达上限（' + MAX_CUSTOM_SKINS + ' 套）。' };
            }
            commit({ ...state, custom: [...state.custom, entry] });
            return { ok: true, value: entry };
        },
        /** Drop an imported skin; falls back to the default when it was active. */
        removeCustomSkin(id) {
            const state = base.getSnapshot();
            commit({
                ...state,
                custom: state.custom.filter(item => item.id !== id),
                skinId: state.skinId === id ? DEFAULT_SKIN_ID : state.skinId
            });
        }
    };
})();

/* ------------------------------------------------------------------ *
 * Skin helpers
 * ------------------------------------------------------------------ */

/** Every registered skin descriptor, built-ins first. */
function allSkins(state) {
    return [...SKINS, ...state.custom];
}

/** Resolve the active skin descriptor, or null for the default sentinel. */
function resolveSkin(state) {
    if (state.skinId === DEFAULT_SKIN_ID) return null;
    return allSkins(state).find(skin => skin.id === state.skinId) || null;
}

/** Colour scheme in force, honouring the host when no skin is active. */
function currentScheme(state) {
    const skin = resolveSkin(state);
    if (skin) return skin.colorScheme;
    return document.body && document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
}

/** Aurora template values for the active skin. */
function auroraTemplateValues(state) {
    const skin = resolveSkin(state);
    const accent = skin && Array.isArray(skin.swatch) && skin.swatch.length > 1 ? skin.swatch[1] : null;
    return auroraValues(accent, currentScheme(state));
}

/**
 * Compose the plugin's whole stylesheet from the current preferences.
 *
 * Each optional block is a separate source file, so a disabled effect costs
 * nothing at runtime rather than being toggled by a root class the plugin would
 * have to write onto a host element.
 * @param state - current preferences.
 * @returns CSS text.
 */
function composeStylesheet(state) {
    const parts = [CSS.ui, CSS.base];
    if (state.buttons.lift) parts.push(CSS.lift);
    if (state.buttons.shimmer) parts.push(CSS.shimmer);
    if (state.buttons.ripple) parts.push(CSS.ripple);
    if (state.ambience.aurora) parts.push(fillTemplate(CSS.aurora, auroraTemplateValues(state)));
    const wallpaper = state.ambience.wallpaper;
    if (wallpaper.enabled && wallpaper.url !== '') {
        parts.push(fillTemplate(CSS.wallpaper, wallpaperValues(wallpaper)));
    }
    return parts.join('\n');
}

/* ------------------------------------------------------------------ *
 * Ripple
 * ------------------------------------------------------------------ */

/** Elements a ripple may be drawn on. Mirrors the buttons.base.css selector. */
const RIPPLE_SELECTOR = 'button, [role="button"], summary, input[type="submit"], input[type="button"], input[type="reset"]';

let rippleSeq = 0;

/**
 * Queue a ripple for the pressed control, if there is one.
 *
 * Only the visual is produced here; the element is rendered by `RippleLayer` in
 * this plugin's overlay slot. Nothing is written to the pressed element.
 * @param event - the originating pointer event.
 */
function spawnRipple(event) {
    const target = event.target;
    if (target === null || typeof target.closest !== 'function') return;
    const control = target.closest(RIPPLE_SELECTOR);
    if (control === null || control.disabled === true) return;
    if (typeof control.getBoundingClientRect !== 'function') return;

    const rect = control.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const style = window.getComputedStyle(control);
    const radius = typeof style.borderRadius === 'string' && style.borderRadius.trim() !== ''
        ? style.borderRadius.trim()
        : '8px';
    const size = Math.max(rect.width, rect.height) * 2.2;
    const left = event.clientX - size / 2;
    const top = event.clientY - size / 2;
    const id = ++rippleSeq;

    ripples.push({ id, left, top, size, clip: rippleClip(left, top, size, rect, radius) });
    window.setTimeout(() => ripples.remove(id), RIPPLE_LIFETIME_MS);
}

/* ------------------------------------------------------------------ *
 * Plugin
 * ------------------------------------------------------------------ */

/**
 * Build the client plugin the module loader receives.
 *
 * @param React - React from the browser module table.
 * @param h - `React.createElement` alias, shared with src/ui.js.
 * @returns the plugin object `{ inject, apply }`.
 */
function createPlugin(React, h) {
    /** Every skin id already handed to the theme service. */
    const registeredIds = new Set();

    /** Disposers for imported-skin registrations, keyed by skin id. */
    const customRegistration = new Map();

    /**
     * Register every skin the theme service does not have yet.
     *
     * `ThemeRuntime.register()` throws on a duplicate id, so without the set below
     * the second pass (the sync effect re-runs `registerSkins` right after `apply`
     * already did) would raise one thrown-and-swallowed error per skin. Tracking
     * the ids keeps the path quiet and makes the intent explicit rather than
     * relying on an exception as a control signal.
     *
     * A registration that throws for another reason is not marked, so a later pass
     * may retry it.
     * @param ctx - client plugin context.
     * @param state - current preferences.
     */
    function registerSkins(ctx, state) {
        for (const skin of allSkins(state)) {
            if (registeredIds.has(skin.id)) continue;
            try {
                const dispose = ctx.theme.register({
                    id: skin.id,
                    colorScheme: skin.colorScheme,
                    tokens: skin.tokens
                });
                registeredIds.add(skin.id);
                if (skin.id.startsWith(CUSTOM_SKIN_PREFIX)) customRegistration.set(skin.id, dispose);
            } catch (error) {
                // One bad skin must not stop the rest; the theme service stays
                // authoritative and the id is retried on the next pass.
                void error;
            }
        }
    }

    /**
     * Drop registrations for imports the user deleted, so deleting and re-importing
     * the same document produces a fresh registration instead of a silent no-op.
     * @param state - current preferences.
     */
    function pruneCustomRegistrations(state) {
        const live = new Set(state.custom.map(skin => skin.id));
        for (const [id, dispose] of [...customRegistration]) {
            if (live.has(id)) continue;
            try {
                dispose();
            } catch (error) {
                void error;
            }
            customRegistration.delete(id);
            registeredIds.delete(id);
        }
    }

    /**
     * Push the stored skin at the theme service, unless it is already showing it.
     *
     * The guard is what keeps the `theme/change` listener from looping: our own
     * `setTheme` emits that event, and on re-entry the preference already matches.
     * @param ctx - client plugin context.
     * @param state - current preferences.
     */
    function applySkin(ctx, state) {
        if (ctx.theme.getTheme().preference === state.skinId) return;
        try {
            ctx.theme.setTheme(state.skinId);
        } catch (error) {
            // The id is not registered (for example a stale import). Fall back
            // once; the re-entry guard above then stops the second pass.
            void error;
            if (state.skinId !== DEFAULT_SKIN_ID) store.patch({ skinId: DEFAULT_SKIN_ID });
        }
    }

    /**
     * Restack the translucency layers for the current effects.
     *
     * Re-calling `overrideTokens` with the same source replaces that source's whole
     * layer, so an empty object is how a layer is withdrawn — no bookkeeping of the
     * previous disposer is needed.
     * @param ctx - client plugin context.
     * @param state - current preferences.
     */
    function applyTokenLayers(ctx, state) {
        try {
            ctx.theme.overrideTokens(OVERRIDE_GLASS, state.ambience.glass ? GLASS_TOKENS : {});
            ctx.theme.overrideTokens(
                OVERRIDE_WALLPAPER,
                state.ambience.wallpaper.enabled && state.ambience.wallpaper.url !== '' ? WALLPAPER_TOKENS : {}
            );
        } catch (error) {
            if (ctx.logger && typeof ctx.logger.warn === 'function') {
                ctx.logger.warn('selfskin: token layer rejected', error);
            }
        }
    }

    return {
        /** Services this half cannot work without. */
        inject: ['theme', 'slots'],

        /**
         * Mount every contribution.
         * @param ctx - client plugin context.
         */
        apply(ctx) {
            registerSkins(ctx, store.getSnapshot());

            // 1) Plugin-owned global stylesheet. One tag, recomposed on change.
            ctx.effect(() => {
                const tag = document.createElement('style');
                tag.dataset.plugin = 'dsh-selfskin';
                document.head.appendChild(tag);
                const render = () => { tag.textContent = composeStylesheet(store.getSnapshot()); };
                render();
                const unsubscribe = store.subscribe(render);
                return () => {
                    unsubscribe();
                    tag.remove();
                };
            }, 'selfskin: plugin stylesheet');

            // 2) Preferences -> theme + token layers.
            ctx.effect(() => {
                const sync = () => {
                    const state = store.getSnapshot();
                    registerSkins(ctx, state);
                    pruneCustomRegistrations(state);
                    applySkin(ctx, state);
                    applyTokenLayers(ctx, state);
                };
                sync();
                const unsubscribe = store.subscribe(sync);
                return () => {
                    unsubscribe();
                    try {
                        ctx.theme.overrideTokens(OVERRIDE_GLASS, {});
                        ctx.theme.overrideTokens(OVERRIDE_WALLPAPER, {});
                    } catch (error) {
                        void error;
                    }
                    for (const dispose of customRegistration.values()) {
                        try {
                            dispose();
                        } catch (error) {
                            void error;
                        }
                    }
                    customRegistration.clear();
                    registeredIds.clear();
                };
            }, 'selfskin: theme sync');

            // 3) The host's own Appearance row can take the theme back at any
            //    time; mirror that into our state so the picker never lies.
            ctx.on('theme/change', () => {
                const preference = ctx.theme.getTheme().preference;
                if (preference !== store.getSnapshot().skinId) store.patch({ skinId: preference });
            });

            // 4) Ripple delegation. Capture phase, so a handler that stops
            //    propagation on the control cannot hide the feedback.
            ctx.effect(() => {
                const onPointerDown = (event) => {
                    if (store.getSnapshot().buttons.ripple !== true) return;
                    if (typeof event.button === 'number' && event.button !== 0) return;
                    spawnRipple(event);
                };
                document.addEventListener('pointerdown', onPointerDown, true);
                return () => document.removeEventListener('pointerdown', onPointerDown, true);
            }, 'selfskin: ripple delegation');

            // 5) A sidebar entry, and the panel that entry opens.
            //
            //    One registration split across two slots. `sidebar.panellist`
            //    contributes the row the user clicks; `main` is the layout's
            //    keyed slot, rendered when the active panel id equals its `key`.
            //    Both carry `PANEL_ID`, which is the whole contract — and the
            //    reason the label is a function: the sidebar resolves it through
            //    the same helper it uses for its own rows.
            ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 20,
                label: () => PANEL_LABEL
            }, SkinPanelIcon));

            ctx.slots.inject('main', () => ctx.slots.register({
                name: 'main',
                key: PANEL_ID
            }, SkinPanel));

            // 6) Overlay layer: ambient motes and the ripple surface.
            ctx.slots.inject('shell.overlay', () => ctx.slots.register({
                name: 'shell.overlay',
                id: 'selfskin.particles',
                order: 60
            }, ParticleField));

            ctx.slots.inject('shell.overlay', () => ctx.slots.register({
                name: 'shell.overlay',
                id: 'selfskin.ripples',
                order: 61
            }, RippleLayer));
        }
    };
}
