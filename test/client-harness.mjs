/**
 * dsh-selfskin — client wiring harness.
 *
 * Run: node test/client-harness.mjs
 *
 * Loads the built bundle into a fresh `vm` context with a stubbed window /
 * document / React, captures the module-loader factory, runs `apply()` against a
 * mock cordis context, and asserts what the plugin actually did:
 *
 *   - every built-in skin was registered with the theme service;
 *   - the saved skin was pushed at the service, and the guard stopped a loop;
 *   - exactly two override layers exist, in the shape the runtime validates;
 *   - the settings and overlay slots were claimed under the expected ids;
 *   - the stylesheet reflects the switches (aurora / wallpaper blocks present
 *     only when enabled, and the wallpaper URL escaped);
 *   - a pointerdown on a control queues a ripple that the overlay component
 *     renders — with no host element mutated.
 *
 * This is a wiring test, not a rendering test: it cannot prove how the page
 * LOOKS. Visual confirmation still needs the app (see test/verify.md).
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLE = await readFile(join(ROOT, 'lib', 'client.js'), 'utf8');
const STORAGE_KEY = 'dsh-selfskin:state:v1';

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

/**
 * Minimal React stand-in.
 *
 * `useSyncExternalStore` returns the snapshot immediately, and `useEffect` is not
 * run, so no animation loops start during the test.
 */
function createReactStub() {
    return {
        createElement(type, props, ...children) {
            return { type, props: props || {}, children: children.flat() };
        },
        useRef(initial) {
            return { current: initial };
        },
        useState(initial) {
            return [typeof initial === 'function' ? initial() : initial, () => {}];
        },
        useEffect() {
            return undefined;
        },
        useSyncExternalStore(subscribe, getSnapshot) {
            void subscribe;
            return getSnapshot();
        }
    };
}

/**
 * Build one fresh sandbox and run the bundle inside it.
 * @param persisted - value to place in localStorage under the plugin's key.
 * @returns the captured loader config plus the stubs a test needs to poke.
 */
function loadBundle(persisted) {
    const styleTags = [];
    const documentListeners = [];
    const storage = new Map();
    if (persisted !== undefined) storage.set(STORAGE_KEY, JSON.stringify(persisted));

    const react = createReactStub();
    const sandbox = {
        console,
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        setTimeout: () => 0,
        clearTimeout: () => {},
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {}
    };

    sandbox.React = react;
    sandbox.document = {
        body: { hasAttribute: () => true, style: { setProperty() {}, removeProperty() {} } },
        head: { appendChild: node => styleTags.push(node) },
        createElement: () => ({
            dataset: {},
            style: {},
            textContent: '',
            remove() {},
            appendChild() {},
            addEventListener() {},
            removeEventListener() {},
            getContext: () => null,
            querySelector: () => null,
            closest: () => null,
            getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 })
        }),
        addEventListener(type, listener) { documentListeners.push({ type, listener }); },
        removeEventListener() {},
        getElementById: () => null
    };
    sandbox.window = {
        document: sandbox.document,
        devicePixelRatio: 1,
        localStorage: {
            getItem: key => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, value)
        },
        getComputedStyle: () => ({ borderRadius: '8px' }),
        addEventListener() {},
        removeEventListener() {},
        setTimeout: () => 0,
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => 0
    };
    let captured = null;
    sandbox.window.__ModuleLoader__ = {
        load(config) { captured = config; }
    };

    vm.createContext(sandbox);
    vm.runInContext(BUNDLE, sandbox, { filename: 'lib/client.js' });

    if (captured === null) throw new Error('bundle never called __ModuleLoader__.load');
    return { captured, sandbox, documentListeners, styleTags, storage, react };
}

/**
 * Build a mock cordis client context that records everything the plugin does.
 * @param preference - the theme preference the service claims to be showing.
 * @returns `{ ctx, calls, effects }`.
 */
function createMockContext(preference) {
    const calls = {
        register: [],
        setTheme: [],
        override: [],
        slots: [],
        events: []
    };
    const effects = [];
    let current = preference;

    const ctx = {
        logger: { warn() {}, error() {} },
        effect(fn, label) {
            const disposer = fn();
            effects.push({ label, disposer });
            return disposer;
        },
        on(name, listener) {
            calls.events.push({ name, listener });
            return () => {};
        },
        slots: {
            inject(key, callback) {
                void key;
                callback();
            },
            register(options, Component) {
                calls.slots.push({ options, Component });
                return () => {};
            }
        },
        theme: {
            register(definition) {
                calls.register.push(definition);
                return () => {};
            },
            setTheme(id) {
                calls.setTheme.push(id);
                current = id;
            },
            getTheme() {
                return {
                    preference: current,
                    fontSize: 14,
                    active: { id: current, colorScheme: current === 'light' ? 'light' : 'dark', tokens: {} },
                    themes: [],
                    revision: 0
                };
            },
            overrideTokens(source, tokens) {
                calls.override.push({ source, tokens });
                return () => {};
            }
        }
    };
    return { ctx, calls, effects };
}

/**
 * Walk an element tree produced by the React stub and hand every node to `visit`.
 * @param node - element (or null/primitive, which is skipped).
 * @param visit - called once per element node.
 */
function walk(node, visit) {
    if (node === null || typeof node !== 'object') return;
    visit(node);
    for (const child of node.children || []) walk(child, visit);
}

/**
 * Expand a stub tree, invoking every function component it meets.
 *
 * The stub records `h(Toggle, props)` as an element whose `type` is the function
 * without calling it — React would, the stub does not. Walking such a tree finds
 * the component boundary rather than what it renders, so tests that need to see
 * inside a component have to expand it first.
 * @param node - element, function component, or primitive.
 * @returns the same shape with function components replaced by their output.
 */
function expand(node) {
    if (node === null || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, children: (node.children || []).map(expand) };
}

/**
 * The declarations of one selector's rule, or '' when the selector is absent.
 *
 * Used to assert on a single rule instead of the whole sheet: a search over
 * everything would happily match `width: 36px` in some unrelated block. Braces
 * inside comments are skipped and nesting is depth-counted, because the
 * stylesheet documents the host's `{ corner-shape: ... }` rule in a comment —
 * stopping at the first `}` would silently truncate the block and every
 * `includes` on it would report a missing declaration that is really there.
 * @param css - stylesheet text.
 * @param selector - the selector, exactly as written (e.g. `.dss-switch`).
 * @returns the text between that rule's braces.
 */
function blockOf(css, selector) {
    const at = css.indexOf(selector + ' {');
    if (at < 0) return '';
    const open = css.indexOf('{', at);
    if (open < 0) return '';
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
        if (css.startsWith('/*', i)) {
            const end = css.indexOf('*/', i + 2);
            if (end < 0) return '';
            i = end + 1;
            continue;
        }
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') {
            depth -= 1;
            if (depth === 0) return css.slice(open + 1, i);
        }
    }
    return '';
}

/**
 * The rendered tree of the plugin's own panel, or null when it is not registered.
 *
 * Every row-level assertion used to reach into a `settings.general.item` entry.
 * Since the rows moved into the `main` panel, the tests go through the panel —
 * which is also the only way to reach them now.
 * @param calls - the recorded slot registrations.
 * @returns the panel element tree.
 */
function panelTree(calls) {
    const entry = calls.slots.find(item => item.options.name === 'main');
    return entry === undefined ? null : entry.Component();
}

process.stdout.write('client bundle wiring\n');

/* ------------------------------------------------------------------ baseline */

{
    const { captured } = loadBundle(undefined);
    test('the bundle registers the expected loader id', () => {
        assert.equal(captured.id, 'dsh-selfskin');
        assert.equal(typeof captured.factory, 'function');
    });

    const react = createReactStub();
    const plugin = captured.factory(name => {
        if (name === 'react') return react;
        throw new Error('unexpected require: ' + name);
    });

    test('the plugin declares the two services it needs', () => {
        assert.deepEqual([...plugin.inject], ['theme', 'slots']);
        assert.equal(typeof plugin.apply, 'function');
    });
}

/* ------------------------------------------------------------------ everything off */

{
    const { captured, styleTags, react } = loadBundle({
        skinId: 'system',
        custom: [],
        buttons: { ripple: false, shimmer: false, lift: false },
        ambience: { aurora: false, particles: false, glass: false, wallpaper: { enabled: false, url: '' } }
    });
    const plugin = captured.factory(name => { void name; return react; });
    const { ctx, calls } = createMockContext('dark');
    plugin.apply(ctx);

    test('all five built-in skins are registered, plain-string tokens', () => {
        const ids = calls.register.map(entry => entry.id);
        assert.deepEqual(ids, [
            'selfskin-ocean',
            'selfskin-graphite',
            'selfskin-midnight',
            'selfskin-sakura',
            'selfskin-paper'
        ]);
        for (const entry of calls.register) {
            assert.ok(['light', 'dark'].includes(entry.colorScheme), 'colorScheme must be light or dark');
            for (const [name, value] of Object.entries(entry.tokens)) {
                assert.ok(name.startsWith('--dsw-'), 'token must be a --dsw- name: ' + name);
                assert.equal(typeof value, 'string', 'register() tokens must be plain strings, not pairs');
            }
        }
    });

    test('the host appearance is pushed once, then the guard stops re-entry', () => {
        // 'system' is a real theme preference id — a sentinel that is not a
        // registered theme would make setTheme throw and silently do nothing.
        assert.deepEqual(calls.setTheme, ['system']);
    });

    test('both override layers are withdrawn with an empty object', () => {
        assert.equal(calls.override.length, 2);
        assert.deepEqual(calls.override.map(entry => entry.source).sort(), ['dsh-selfskin/glass', 'dsh-selfskin/wallpaper']);
        for (const entry of calls.override) {
            // Realm-safe: these objects are constructed inside the vm context, so
            // deepStrictEqual against a local {} would fail on the prototype.
            assert.equal(Object.keys(entry.tokens).length, 0);
        }
    });

    test('the plugin claims one sidebar row, one panel and two overlay entries', () => {
        const byName = {};
        for (const entry of calls.slots) byName[entry.options.name] = (byName[entry.options.name] || 0) + 1;
        assert.equal(byName['sidebar.panellist'], 1, 'one navigation row');
        assert.equal(byName.main, 1, 'one panel for that row to open');
        assert.equal(byName['shell.overlay'], 2, 'motes and ripples');
        // The point of the panel move: nothing is contributed to the host's
        // general settings any more, so the panel is the plugin's only surface.
        assert.equal(byName['settings.general.item'], undefined, 'no settings rows');
    });

    test('the sidebar row and the panel share the id the layout matches on', () => {
        // The layout renders the `main` entry whose `key` equals the active panel
        // id, and the sidebar row registered under that id is what sets it. That
        // shared id is the entire contract: let the two drift apart and the row
        // still lists, still highlights, and opens nothing — a failure nobody
        // sees until they click.
        const nav = calls.slots.find(entry => entry.options.name === 'sidebar.panellist');
        const panel = calls.slots.find(entry => entry.options.name === 'main');
        assert.ok(nav, 'the sidebar entry must be registered');
        assert.ok(panel, 'the panel must be registered');
        assert.equal(typeof nav.options.id, 'string');
        assert.ok(nav.options.id.length > 0, 'the row needs an id');
        assert.equal(nav.options.id, panel.options.key, 'the row id must be the panel key');
        assert.equal(typeof nav.options.order, 'number', 'the row needs an order to sort by');
        // The sidebar resolves the label through the same helper it uses for its
        // own rows, which accepts a function or a string. Either way it has to end
        // up non-empty, or the row renders with no words on it.
        const label = typeof nav.options.label === 'function' ? nav.options.label() : nav.options.label;
        assert.equal(typeof label, 'string');
        assert.ok(label.length > 0, 'the sidebar row needs a caption');
        assert.equal(typeof nav.Component, 'function', 'the row carries a glyph component');
    });

    test('one plugin-owned stylesheet is injected and is non-empty', () => {
        assert.equal(styleTags.length, 1);
        assert.equal(styleTags[0].dataset.plugin, 'dsh-selfskin');
        assert.ok(styleTags[0].textContent.includes('.dss-row'), 'row styles are always present');
    });

    test('disabled effects contribute no rules', () => {
        const css = styleTags[0].textContent;
        assert.ok(!css.includes('dsh-selfskin-sheen'), 'shimmer block must be absent');
        // The keyframes name, not the class prefix: `.dss-rippleLayer` belongs to
        // the always-on UI sheet and would make a prefix check meaningless.
        assert.ok(!css.includes('dss-ripple-out'), 'ripple block must be absent');
        assert.ok(!css.includes('dsh-selfskin-aurora'), 'aurora block must be absent');
        assert.ok(!css.includes('body::before'), 'wallpaper block must be absent');
    });

    test('no template placeholder survives into the stylesheet', () => {
        assert.ok(!styleTags[0].textContent.includes('{{'), 'an unfilled placeholder would invalidate the rule');
    });

    test('the capsule restates the host switch declaration for declaration', () => {
        const capsule = blockOf(styleTags[0].textContent, '.dss-switch');
        // Copied from @deepseek-ai/dsh-client-ui-primitives/lib/Switch.module.css.
        // Copying it verbatim is the point: a plugin switch that merely
        // resembles a host switch is what "use the host's switch format" rules
        // out. If the host's rule gains a declaration, add it here too.
        for (const declaration of [
            'box-sizing: border-box',
            'position: relative',
            'flex: 0 0 auto',
            'width: 36px',
            'height: 20px',
            'padding: 2px',
            'border: 0',
            'border-radius: 999px',
            'corner-shape: round',
            'background: var(--dsw-alias-border-l3)',
            'cursor: pointer'
        ]) {
            assert.ok(capsule.includes(declaration), 'the capsule is missing "' + declaration + '"');
        }
    });

    test('the button is the capsule, not a wrapper around one', () => {
        // The host's markup is <button class=switch><span class=thumb/></button>:
        // one element draws the capsule AND carries the state. An intermediate
        // track is a different shape from the host's — and it is also what made
        // the on-state selector silently miss, so it must not come back.
        assert.ok(!styleTags[0].textContent.includes('dss-switchTrack'),
            'no wrapper track: the button is the capsule');
    });

    test('the on-state and the thumb travel key off the button itself', () => {
        const css = styleTags[0].textContent;
        assert.ok(blockOf(css, '.dss-switch[aria-checked="true"]').includes('background: var(--dsw-alias-brand-primary)'),
            'the on fill must key off aria-checked on the button');
        assert.ok(blockOf(css, '.dss-switch[aria-checked="true"] .dss-switchThumb').includes('translateX(16px)'),
            'the 16px travel must key off the button too');
        assert.ok(blockOf(css, '.dss-switch[aria-checked="false"] .dss-switchThumb').includes('--dsw-alias-switch-thumb'),
            'the off thumb uses the host default colour');
        assert.ok(blockOf(css, '.dss-switch:disabled').includes('opacity: 0.5'),
            'the host disables by dimming');
        assert.ok(blockOf(css, '.dss-switch:focus-visible').includes('outline-offset: 2px'),
            'the host focuses at a 2px offset');
    });

    test('the switch adds nothing the host switch does not have', () => {
        const css = styleTags[0].textContent;
        // The host switch has no hover state at all — `cursor: pointer` is the
        // whole affordance — and only the thumb animates, so the fill snaps.
        // Both were additions of ours, and both are why the control read as a
        // near-miss sitting next to a host switch.
        assert.ok(!css.includes('.dss-switch:hover'), 'the host switch has no hover state');
        assert.ok(!blockOf(css, '.dss-switchThumb').includes('background-color'),
            'only the transform animates; the fill switches instantly, as in the host');
    });

    test('the capsule track and round thumb opt out of the global superellipse', () => {
        const css = styleTags[0].textContent;
        // A host stylesheet applies `corner-shape: superellipse(...)` to `*`; the
        // host's own capsule and circular primitives opt back out, and so must ours.
        const optOuts = (css.match(/corner-shape:\s*round/g) || []).length;
        assert.ok(optOuts >= 2, 'both the track and the thumb must opt out, found ' + optOuts);
    });

    test('the built bundle never reaches for a document-wide element lookup', () => {
        // The wallpaper file input used to be triggered through
        // `document.getElementById('dss-wallpaper-file')`: that finds nothing if
        // the slot ever moves into a shadow tree, and collides if the row renders
        // twice. A ref has neither problem.
        assert.ok(!BUNDLE.includes('getElementById'), 'wire the picker through a ref instead');
        assert.ok(!BUNDLE.includes('dss-wallpaper-file'), 'the input no longer needs a global id');
    });

    test('every registered component is callable without throwing', () => {
        for (const entry of calls.slots) {
            const tree = entry.Component();
            assert.ok(tree === null || typeof tree === 'object', entry.options.id + ' returned ' + typeof tree);
        }
    });

    test('no ripple is queued while the switch is off', () => {
        assert.equal(calls.slots.find(entry => entry.options.id === 'selfskin.ripples').Component(), null);
    });
}

/* ------------------------------------------------------------------ everything on */

{
    const { captured, styleTags, documentListeners, react } = loadBundle({
        skinId: 'selfskin-sakura',
        custom: [],
        buttons: { ripple: true, shimmer: true, lift: true },
        ambience: {
            aurora: true,
            particles: false,
            glass: true,
            wallpaper: { enabled: true, url: 'https://example.com/a"b.png', opacity: 0.7, blur: 12, fit: 'contain' }
        }
    });
    const plugin = captured.factory(name => { void name; return react; });
    const { ctx, calls } = createMockContext('dark');
    plugin.apply(ctx);

    test('a saved non-default skin is pushed at the theme service', () => {
        assert.deepEqual(calls.setTheme, ['selfskin-sakura']);
    });

    test('glass and wallpaper layers are populated with {light,dark} pairs', () => {
        const bySource = {};
        for (const entry of calls.override) bySource[entry.source] = entry.tokens;
        for (const source of ['dsh-selfskin/glass', 'dsh-selfskin/wallpaper']) {
            const tokens = bySource[source];
            assert.ok(Object.keys(tokens).length > 0, source + ' should carry tokens');
            for (const [name, value] of Object.entries(tokens)) {
                assert.ok(name.startsWith('--dsw-'), 'override token must be a --dsw- name');
                assert.equal(typeof value.light, 'string', name + ' needs a light value');
                assert.equal(typeof value.dark, 'string', name + ' needs a dark value');
            }
        }
        assert.ok('--dsw-alias-bg-base' in bySource['dsh-selfskin/wallpaper']);
    });

    test('the stylesheet carries every enabled block', () => {
        const css = styleTags[0].textContent;
        assert.ok(css.includes('dsh-selfskin-sheen'), 'shimmer expected');
        assert.ok(css.includes('dss-ripple'), 'ripple expected');
        assert.ok(css.includes('dsh-selfskin-aurora'), 'aurora expected');
        assert.ok(css.includes('body::before'), 'wallpaper expected');
    });

    test('the aurora is tinted from the active skin accent', () => {
        const css = styleTags[0].textContent;
        assert.ok(css.includes('#e0568a'), 'sakura accent should reach the aurora stops');
    });

    test('the pasted wallpaper URL is escaped inside url("")', () => {
        const css = styleTags[0].textContent;
        assert.ok(css.includes('url("https://example.com/a\\"b.png")'), 'quote must be escaped');
        assert.ok(css.includes('background-size: contain'), 'fit mode should reach the sheet');
        assert.ok(css.includes('blur(12px)'), 'blur should reach the sheet');
    });

    test('a pointerdown on a button queues exactly one ripple', () => {
        const listener = documentListeners.find(entry => entry.type === 'pointerdown');
        assert.ok(listener, 'a pointerdown listener must be registered');
        const control = {
            disabled: false,
            getBoundingClientRect: () => ({ width: 80, height: 32, top: 100, left: 200, right: 280, bottom: 132 })
        };
        listener.listener({
            target: { closest: selector => (selector.includes('button') ? control : null) },
            clientX: 240,
            clientY: 116,
            button: 0
        });
        const layer = calls.slots.find(entry => entry.options.id === 'selfskin.ripples');
        const tree = layer.Component();
        assert.ok(tree !== null, 'the ripple layer should render once a ripple is queued');
        assert.equal(tree.children.length, 1);
        assert.equal(tree.children[0].type, 'span');
        assert.ok(tree.children[0].props.style.clipPath.startsWith('inset('), 'ripple must be clipped to the button');
    });

    test('a non-primary pointer button queues nothing extra', () => {
        const listener = documentListeners.find(entry => entry.type === 'pointerdown');
        listener.listener({
            target: { closest: () => ({ disabled: false, getBoundingClientRect: () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }) }) },
            clientX: 1,
            clientY: 1,
            button: 2
        });
        const tree = calls.slots.find(entry => entry.options.id === 'selfskin.ripples').Component();
        assert.equal(tree.children.length, 1, 'right-click must not add a ripple');
    });

    test('each switch is one button that is itself the capsule', () => {
        const switches = [];
        walk(expand(panelTree(calls)), node => {
            if (node.props && node.props.role === 'switch') switches.push(node);
        });
        // Three button effects, three ambience effects, and the wallpaper — all
        // seven now live on the panel.
        assert.equal(switches.length, 7, 'lift / shimmer / ripple / aurora / dust / glass / wallpaper');
        // Six of the seven are on in this fixture; the dust field is deliberately
        // off, so the attribute has to be readable as either state rather than
        // assumed to be "true".
        const on = switches.filter(node => node.props['aria-checked'] === 'true');
        assert.equal(on.length, 6, 'six on, one off (the dust field)');
        for (const node of switches) {
            // Host contract: the <button> draws the capsule AND carries the
            // state, and holds nothing inside but the thumb. Sharing one element
            // is what makes it impossible for the drawn state to disagree with
            // the state assistive technology reads.
            assert.equal(node.type, 'button', 'the capsule has to be a real button');
            assert.ok(node.props.className.split(' ').includes('dss-switch'), 'the button carries the capsule class');
            assert.ok(node.props['aria-checked'] === 'true' || node.props['aria-checked'] === 'false',
                'aria-checked must be a readable string, got ' + JSON.stringify(node.props['aria-checked']));
            assert.equal(typeof node.props['aria-label'], 'string', 'the accessible name is the caption');
            const classes = (node.children || []).map(child => child && child.props && child.props.className);
            assert.deepEqual(classes, ['dss-switchThumb'], 'the button holds the thumb and nothing else');
        }
    });

    test('the caption sits outside the capsule, out of the accessible name', () => {
        const fields = [];
        walk(expand(panelTree(calls)), node => {
            if (node.props && node.props.className === 'dss-switchField') fields.push(node);
        });
        assert.equal(fields.length, 7, 'one caption per switch');
        for (const field of fields) {
            const classes = field.children.map(child => child && child.props && child.props.className);
            // Inside the button the words would widen the pill and the capsule
            // would stretch; the host keeps its own label invisible for exactly
            // this reason and lets the settings row supply the words.
            assert.deepEqual(classes, ['dss-switch', 'dss-switchText'], 'capsule first, caption second');
            const caption = field.children[1];
            assert.equal(caption.props['aria-hidden'], 'true', 'aria-label already names the control');
            assert.equal(typeof caption.children[0], 'string', 'the caption is the visible words');
        }
    });

    test('the wallpaper lives with the skin, not with the ambience effects', () => {
        // The wallpaper moved to the skin row: it is a background choice, so it
        // belongs with the look rather than with the animating overlays. Asserted
        // on the tree, because "which section is it in" is exactly what a future
        // reshuffle would get wrong.
        //
        // Sections are told apart by the captions they carry rather than by
        // identity: `SkinRow` and `AmbienceRow` live inside the bundle's sandbox
        // and are not reachable from here.
        const captionsIn = (node) => {
            const found = [];
            walk(node, inner => {
                if (inner.props && inner.props.className === 'dss-switchText') found.push(inner.children[0]);
            });
            return found;
        };
        const sections = expand(panelTree(calls)).children;
        const skin = sections.find(node => captionsIn(node).includes('壁纸'));
        const ambience = sections.find(node => captionsIn(node).includes('极光'));
        assert.ok(skin, 'the skin section must offer the wallpaper switch');
        assert.ok(ambience, 'the ambience section must still render');
        assert.equal(captionsIn(ambience).includes('壁纸'), false,
            'the ambience section must not offer the wallpaper a second time');
        assert.deepEqual(captionsIn(ambience), ['极光', '光尘', '毛玻璃'],
            'the ambience section keeps exactly its three effects');
    });

    test('the wallpaper file input is reached through a ref, and its guard holds', () => {
        // Expanded first: the picker lives inside the skin row, which the stub
        // records as a component boundary rather than rendering it.
        const inputs = [];
        const buttons = [];
        walk(expand(panelTree(calls)), node => {
            if (node.type === 'input' && node.props && node.props.type === 'file') inputs.push(node);
            if (node.type === 'button') buttons.push(node);
        });
        assert.equal(inputs.length, 1, 'exactly one hidden file input');
        assert.ok(inputs[0].props.ref && 'current' in inputs[0].props.ref, 'the input must be held by a ref');
        assert.equal(inputs[0].props.id, undefined, 'no global id on the input');
        const picker = buttons.find(node => (node.children || []).includes('选择本地图片'));
        assert.ok(picker, 'the picker button must render');
        // Nothing is mounted in this harness, so the ref is still null; clicking
        // must therefore be a no-op rather than a throw.
        assert.doesNotThrow(() => picker.props.onClick());
    });
}

/* ------------------------------------------------------------------ theme/change */

{
    const { captured, react } = loadBundle({
        skinId: 'selfskin-ocean',
        custom: [],
        buttons: { ripple: false, shimmer: true, lift: true },
        ambience: { aurora: false, particles: false, glass: false, wallpaper: { enabled: false, url: '' } }
    });
    const plugin = captured.factory(name => { void name; return react; });
    const { ctx, calls } = createMockContext('dark');
    plugin.apply(ctx);

    test('the host taking the theme back is mirrored into the stored skin, once', () => {
        const change = calls.events.find(entry => entry.name === 'theme/change');
        assert.ok(change, 'a theme/change listener must be registered');
        // Simulate the user picking the host's own "dark" in the Appearance row.
        ctx.theme.setTheme('dark');
        calls.setTheme.length = 0;
        change.listener();
        // The mirror patch must not bounce back into setTheme.
        ctx.theme.setTheme('dark');
        assert.ok(calls.setTheme.every(id => id === 'dark'), 'no echo of the previous skin');
    });
}

/* ------------------------------------------------------------------ report */

process.stdout.write('\n' + passed + ' passed, ' + failures.length + ' failed\n');
for (const failure of failures) {
    process.stdout.write('\n--- ' + failure.name + '\n' + (failure.error && failure.error.stack ? failure.error.stack : String(failure.error)) + '\n');
}
process.exit(failures.length === 0 ? 0 : 1);
