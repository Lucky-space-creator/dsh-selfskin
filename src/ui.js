/* dsh-selfskin — browser half: React surfaces.
 *
 * NOTE ON FORM: this file is concatenated into the client bundle's factory scope
 * by build.mjs, so it is a plain script, not an ES module. It deliberately has no
 * import/export: `React`, the `h` alias, `SKINS`, `DEFAULT_SKIN_ID` and the
 * `store` singleton all arrive from that surrounding scope, and the bundle
 * closes over them. Do not add `import`/`export` here — the inserted statements
 * would land inside a function body and fail to parse.
 *
 * Which service this exposes: the rows are mounted into the plugin's own panel
 * (`main`, opened from the `sidebar.panellist` entry) and the ambient canvas into
 * `shell.overlay`. Both are registered from src/client.js. Nothing here appends to
 * document.body, replaces the app root, or reads another plugin's DOM.
 */

/**
 * Subscribe to the whole preference store.
 *
 * `useSyncExternalStore` needs a snapshot that is referentially stable between
 * changes; `store.getSnapshot` returns the same frozen object until a write, so
 * this does not loop.
 * @returns the current preference state.
 */
function useStore() {
    return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * A labelled switch, built exactly like the host's own.
 *
 * The markup mirrors `dsh-client-ui-primitives`' `Switch` one-for-one: the
 * `<button role="switch" aria-checked>` IS the capsule — it carries the 2px
 * padding and holds nothing but the thumb — and the accessible name arrives as
 * `aria-label`. A plugin switch is therefore the same object as a host switch
 * rather than something that merely resembles one.
 *
 * The visible caption sits OUTSIDE the button on purpose. Inside it, the text
 * would widen the pill and the capsule would stretch; the host solves the same
 * problem by keeping its label invisible and letting the settings row supply
 * the words. It is `aria-hidden` because `aria-label` already names the control
 * — without it a screen reader would announce the caption twice.
 *
 * @param props.label - caption text; also the accessible name.
 * @param props.checked - current state.
 * @param props.onChange - called with the next state.
 * @returns the switch field (capsule + caption).
 */
function Toggle(props) {
    return h('span', { className: 'dss-switchField' },
        h('button', {
            type: 'button',
            className: 'dss-switch',
            role: 'switch',
            'aria-checked': props.checked ? 'true' : 'false',
            'aria-label': props.label,
            title: props.label,
            onClick: () => props.onChange(!props.checked),
        }, h('span', { className: 'dss-switchThumb' })),
        h('span', { className: 'dss-switchText', 'aria-hidden': 'true' }, props.label));
}

/**
 * The sidebar glyph for this plugin's own panel.
 *
 * `sidebar.panellist` renders every entry's component with `{ size, active }`,
 * where `size` is 16 or 18 depending on whether the sidebar is expanded — so the
 * glyph must take its edge length from props instead of fixing one. Drawn here
 * rather than borrowed from the host's icon set: practices.md bars reaching into
 * host UI packages, and `currentColor` inherits whatever the row paints.
 *
 * @param props.size - the edge length in px the sidebar asked for.
 * @param props.active - whether this panel is the one currently on screen.
 * @returns the icon element.
 */
function SkinPanelIcon(props) {
    // `props` itself is guarded, not just `props.size`: the sidebar always passes
    // `{ size, active }`, but an icon that throws when rendered without them is a
    // crash in the sidebar's panel row rather than a missing size.
    const size = props && typeof props.size === 'number' ? props.size : 18;
    return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        'aria-hidden': true,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinejoin: 'round'
    },
        h('circle', { cx: 12, cy: 12, r: 8.4, fill: props && props.active === true ? 'currentColor' : 'none' }),
        h('circle', { cx: 9.2, cy: 9.8, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 14.6, cy: 9.2, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 11.4, cy: 14.6, r: 1.15, fill: 'currentColor', stroke: 'none' }));
}

/**
 * Three-colour preview chip for a skin.
 * @param props.colors - up to three hex colours; missing entries reuse the last.
 * @returns the chip element.
 */
function Swatch(props) {
    const colors = props.colors && props.colors.length > 0 ? props.colors : ['#888888'];
    return h('span', { className: 'dss-swatch', 'aria-hidden': true },
        colors.slice(0, 3).map((color, index) => h('span', { key: index, style: { background: color } })));
}

/**
 * Every selectable skin, grouped for the picker.
 *
 * Grouping keeps the three host appearances visually separate from the shipped
 * skins and from the user's own imports, which matters once a few have been
 * imported. Every id produced here is one `ctx.theme.setTheme()` accepts: the
 * runtime treats `system`/`light`/`dark` as preferences and the rest as
 * registered skin ids.
 * @param state - current preference state.
 * @returns groups of `{ id, label, colors }`.
 */
function skinGroups(state) {
    const host = HOST_APPEARANCES.map(item => ({
        id: item.id,
        label: item.name.zh + ' · ' + item.name.en,
        colors: null
    }));
    const builtin = SKINS.map(skin => ({
        id: skin.id,
        label: skin.name.zh + ' · ' + skin.name.en,
        colors: skin.swatch
    }));
    const custom = state.custom.map(skin => ({
        id: skin.id,
        label: skin.name + '（导入）',
        colors: skin.swatch
    }));
    const groups = [
        { label: '宿主外观', items: host },
        { label: '内置皮肤', items: builtin }
    ];
    if (custom.length > 0) groups.push({ label: '已导入', items: custom });
    return groups;
}

/** Flat view of {@link skinGroups}, for resolving the current selection. */
function skinOptions(state) {
    return skinGroups(state).flatMap(group => group.items);
}

/**
 * Settings row 1 — skin picker, the import surface, and the wallpaper.
 *
 * The wallpaper sits here rather than with the ambience effects because it is
 * part of the look, not an animation: it is stacked beneath everything, it
 * survives with every effect switched off, and it reads as a background choice.
 * Its panel renders only while the switch is on, so the row stays one line for
 * users who never open it.
 * @returns the row element.
 */
function SkinRow() {
    const state = useStore();
    const wallpaper = state.ambience.wallpaper;
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState('');
    const [error, setError] = React.useState('');
    const fileRef = React.useRef(null);
    const options = skinOptions(state);
    const active = options.find(option => option.id === state.skinId) || options[0];
    const activeIsCustom = state.custom.some(skin => skin.id === state.skinId);

    /** Parse the pasted draft and register it as an importable skin. */
    function commitImport() {
        const parsed = parseImportedSkin(draft);
        if (parsed.ok !== true) {
            setError(parsed.error);
            return;
        }
        const added = store.addCustomSkin(parsed.value);
        if (added.ok !== true) {
            setError(added.error);
            return;
        }
        setError('');
        setDraft('');
        setOpen(false);
        store.patch({ skinId: added.value.id });
    }

    /**
     * Read a chosen local image as a data URL, refusing oversized files.
     *
     * A data URL rather than a path: the renderer has no filesystem access, and
     * 2.5 MB is where a base64 payload starts to cost more in localStorage than
     * the convenience is worth.
     */
    function pickFile(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > 2621440) {
            store.patchWallpaper({ error: '图片超过 2.5 MB，请换一张或改用图片网址。' });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => store.patchWallpaper({ url: String(reader.result), error: '' });
        reader.onerror = () => store.patchWallpaper({ error: '读取图片失败。' });
        reader.readAsDataURL(file);
    }

    return h('div', { className: 'dss-row dss-rowWrap' },
        h('div', { className: 'dss-row', style: { borderBottom: 'none', paddingBottom: 0 } },
            h('div', { className: 'dss-rowMain' },
                h('div', { className: 'dss-title' }, '皮肤'),
                h('div', { className: 'dss-desc' },
                    '选择内置皮肤，或导入你自己的令牌皮肤。皮肤存放在本机浏览器，卸载插件后不再生效。')),
            h('div', { className: 'dss-end' },
                active.colors ? h(Swatch, { colors: active.colors }) : null,
                h('select', {
                    className: 'dss-select',
                    value: state.skinId,
                    'aria-label': '皮肤',
                    onChange: event => store.patch({ skinId: event.target.value }),
                }, skinGroups(state).map(group => h('optgroup', { key: group.label, label: group.label },
                    group.items.map(option => h('option', { key: option.id, value: option.id }, option.label))))),
                activeIsCustom
                    ? h('button', {
                        type: 'button',
                        className: 'dss-btn dss-btnDanger',
                        onClick: () => store.removeCustomSkin(state.skinId),
                    }, '删除')
                    : null,
                h('button', {
                    type: 'button',
                    className: 'dss-btn',
                    onClick: () => { setOpen(!open); setError(''); },
                }, open ? '收起' : '导入…'))),
        open
            ? h('div', { className: 'dss-panel' },
                h('p', { className: 'dss-hint' },
                    '粘贴皮肤 JSON：{ "name": "我的皮肤", "colorScheme": "dark", "tokens": { "--dsw-alias-brand-primary": "#ff6b6b" } }'),
                h('div', { className: 'dss-field' },
                    h('textarea', {
                        className: 'dss-textarea',
                        value: draft,
                        spellCheck: false,
                        placeholder: '{ "name": "我的皮肤", "colorScheme": "dark", "tokens": {} }',
                        onChange: event => { setDraft(event.target.value); setError(''); },
                    })),
                error ? h('p', { className: 'dss-error' }, error) : null,
                h('div', { className: 'dss-actions' },
                    h('button', { type: 'button', className: 'dss-btn', onClick: commitImport }, '导入'),
                    h('button', {
                        type: 'button',
                        className: 'dss-btn',
                        onClick: () => { setDraft(SKIN_TEMPLATE); setError(''); },
                    }, '填入模板')))
            : null,
        h('div', { className: 'dss-row dss-subRow', style: { borderBottom: 'none' } },
            h('div', { className: 'dss-rowMain' },
                h('div', { className: 'dss-title dss-subTitle' }, '壁纸'),
                h('div', { className: 'dss-desc' }, '铺在皮肤之下的一张图片，可来自网址或本机文件。')),
            h('div', { className: 'dss-end' },
                h(Toggle, {
                    label: '壁纸',
                    checked: wallpaper.enabled,
                    onChange: value => store.patchWallpaper({ enabled: value }),
                }))),
        wallpaper.enabled
            ? h('div', { className: 'dss-panel' },
                h('div', { className: 'dss-field' },
                    h('span', { className: 'dss-label' }, '图片网址（http/https/data，留空则使用本地文件）'),
                    h('input', {
                        className: 'dss-input',
                        type: 'text',
                        spellCheck: false,
                        value: wallpaper.url.startsWith('data:') ? '' : wallpaper.url,
                        placeholder: 'https://example.com/wallpaper.jpg',
                        onChange: event => store.patchWallpaper({ url: event.target.value, error: '' }),
                    })),
                h('div', { className: 'dss-actions' },
                    h('input', {
                        ref: fileRef,
                        type: 'file',
                        accept: 'image/*',
                        style: { display: 'none' },
                        onChange: pickFile,
                    }),
                    h('button', {
                        type: 'button',
                        className: 'dss-btn',
                        onClick: () => {
                            // Held by a ref rather than looked up globally by id:
                            // the row may render more than once, and a document-wide
                            // lookup silently finds nothing if the slot ever moves
                            // into a shadow tree.
                            if (fileRef.current !== null) fileRef.current.click();
                        },
                    }, '选择本地图片'),
                    h('button', {
                        type: 'button',
                        className: 'dss-btn',
                        onClick: () => store.patchWallpaper({ url: '', error: '' }),
                    }, '清除图片')),
                wallpaper.error ? h('p', { className: 'dss-error' }, wallpaper.error) : null,
                h('div', { className: 'dss-field' },
                    h('span', { className: 'dss-label' }, '不透明度 ' + Math.round(wallpaper.opacity * 100) + '%'),
                    h('input', {
                        className: 'dss-range',
                        type: 'range',
                        min: 5,
                        max: 100,
                        value: Math.round(wallpaper.opacity * 100),
                        onChange: event => store.patchWallpaper({ opacity: Number(event.target.value) / 100 }),
                    })),
                h('div', { className: 'dss-field' },
                    h('span', { className: 'dss-label' }, '模糊 ' + wallpaper.blur + 'px'),
                    h('input', {
                        className: 'dss-range',
                        type: 'range',
                        min: 0,
                        max: 40,
                        value: wallpaper.blur,
                        onChange: event => store.patchWallpaper({ blur: Number(event.target.value) }),
                    })),
                h('div', { className: 'dss-field' },
                    h('span', { className: 'dss-label' }, '显示方式'),
                    h('select', {
                        className: 'dss-select',
                        value: wallpaper.fit,
                        onChange: event => store.patchWallpaper({ fit: event.target.value }),
                    },
                        h('option', { value: 'cover' }, '填充（cover）'),
                        h('option', { value: 'contain' }, '适应（contain）'),
                        h('option', { value: 'stretch' }, '拉伸（stretch）'),
                        h('option', { value: 'tile' }, '平铺（tile）'))))
            : null);
}

/**
 * Settings row 2 — button effects, including the ripple switch.
 * @returns the row element.
 */
function ButtonsRow() {
    const state = useStore();
    return h('div', { className: 'dss-row' },
        h('div', { className: 'dss-rowMain' },
            h('div', { className: 'dss-title' }, '按钮特效'),
            h('div', { className: 'dss-desc' }, '悬停抬升与辉光、主按钮流光、点击涟漪。涟漪可随时关闭。')),
        h('div', { className: 'dss-end dss-stack' },
            h(Toggle, {
                label: '抬升与辉光',
                checked: state.buttons.lift,
                onChange: value => store.patchButtons({ lift: value }),
            }),
            h(Toggle, {
                label: '流光',
                checked: state.buttons.shimmer,
                onChange: value => store.patchButtons({ shimmer: value }),
            }),
            h(Toggle, {
                label: '涟漪',
                checked: state.buttons.ripple,
                onChange: value => store.patchButtons({ ripple: value }),
            })));
}

/**
 * Settings row 3 — the ambience effects.
 *
 * Three independent overlays. None of them changes how the surfaces look when
 * idle, which is why the wallpaper is not among them: a wallpaper is a
 * background choice, so it lives with the skin.
 * @returns the row element.
 */
function AmbienceRow() {
    const state = useStore();
    return h('div', { className: 'dss-row' },
        h('div', { className: 'dss-rowMain' },
            h('div', { className: 'dss-title' }, '氛围特效'),
            h('div', { className: 'dss-desc' }, '极光、光尘与毛玻璃，三者独立开关、可叠加。')),
        h('div', { className: 'dss-end dss-stack' },
            h(Toggle, {
                label: '极光',
                checked: state.ambience.aurora,
                onChange: value => store.patchAmbience({ aurora: value }),
            }),
            h(Toggle, {
                label: '光尘',
                checked: state.ambience.particles,
                onChange: value => store.patchAmbience({ particles: value }),
            }),
            h(Toggle, {
                label: '毛玻璃',
                checked: state.ambience.glass,
                onChange: value => store.patchAmbience({ glass: value }),
            })));
}

/**
 * The page the sidebar's 「皮肤管理」 entry opens.
 *
 * `main` is the layout's keyed slot: it renders whichever entry's `key` matches
 * the active panel id, and the sidebar entry registered under that same id is
 * what selects it. So this component and the navigation entry are two halves of
 * one registration, and the shared id is the contract between them — see
 * `PANEL_ID` in src/client.js.
 *
 * The three sections are the rows that used to sit in the host's general
 * settings, unchanged except that they now have a page of their own. Everything
 * renders inside a plugin-owned container: no host class is reached for, and the
 * host's own page chrome (title bar, sidebar state) stays in charge.
 * @returns the page element.
 */
function SkinPanel() {
    return h('div', { className: 'dss-page' },
        h('div', { className: 'dss-pageHead' },
            h('h1', { className: 'dss-pageTitle' }, '皮肤管理'),
            h('p', { className: 'dss-pageDesc' },
                '皮肤、按钮特效与氛围特效。所有设置只保存在本机，卸载插件后不再生效。')),
        h(SkinRow),
        h(ButtonsRow),
        h(AmbienceRow));
}

/**
 * Ambient particle field.
 *
 * Rendered into `shell.overlay`, which is the only full-bleed slot available —
 * and which sits ABOVE the app frame, so this layer is deliberately a thin
 * low-opacity dust pass rather than a backdrop. It is `pointer-events: none` and
 * paints nothing in the reduced-motion case.
 *
 * The animation loop is owned by the component: React unmounts it when the slot
 * collapses, and the effect's cleanup cancels the frame, so switching the effect
 * off leaves no timer behind.
 * @returns the canvas element.
 */
function ParticleField() {
    const state = useStore();
    const canvasRef = React.useRef(null);

    React.useEffect(() => {
        if (state.ambience.particles !== true) return undefined;
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return undefined;
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        let frame = 0;
        let motes = [];
        let width = 0;
        let height = 0;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        function resize() {
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = Math.max(1, Math.floor(width * dpr));
            canvas.height = Math.max(1, Math.floor(height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const count = Math.max(20, Math.min(90, Math.round((width * height) / 26000)));
            motes = new Array(count).fill(0).map(() => ({
                x: Math.random() * width,
                y: Math.random() * height,
                r: 0.6 + Math.random() * 1.6,
                vx: (Math.random() - 0.5) * 0.14,
                vy: -0.05 - Math.random() * 0.16,
                a: 0.08 + Math.random() * 0.22,
                phase: Math.random() * Math.PI * 2,
            }));
        }

        function tint() {
            const raw = getComputedStyle(document.body).getPropertyValue('--dsw-alias-brand-primary').trim();
            return raw || '#7aa7ff';
        }

        function draw(time) {
            const color = tint();
            ctx.clearRect(0, 0, width, height);
            for (const mote of motes) {
                mote.x += mote.vx;
                mote.y += mote.vy;
                if (mote.y < -6) { mote.y = height + 6; mote.x = Math.random() * width; }
                if (mote.x < -6) mote.x = width + 6;
                if (mote.x > width + 6) mote.x = -6;
                const twinkle = 0.65 + 0.35 * Math.sin(time / 900 + mote.phase);
                ctx.globalAlpha = mote.a * twinkle;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            frame = window.requestAnimationFrame(draw);
        }

        resize();
        window.addEventListener('resize', resize);
        frame = window.requestAnimationFrame(draw);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
        };
    }, [state.ambience.particles]);

    if (state.ambience.particles !== true) return null;
    return h('canvas', { ref: canvasRef, className: 'dss-canvas', 'aria-hidden': true });
}

/**
 * Ripple surface.
 *
 * Draws the queued ripples in this plugin's own layer inside `shell.overlay`,
 * each clipped to the pressed button's rect. Because the host element is never
 * mutated, a ripple can be added and dropped at any time without React or the
 * host noticing, and the queue is the only shared state.
 *
 * The layer wrapper carries `pointer-events: none` in CSS, which is required:
 * the host's overlay container makes every direct child interactive by default.
 * @returns the layer element, or null while no ripple is alive.
 */
function RippleLayer() {
    const list = React.useSyncExternalStore(ripples.subscribe, ripples.getSnapshot, ripples.getSnapshot);
    if (list.length === 0) return null;
    return h('div', { className: 'dss-rippleLayer', 'aria-hidden': true },
        list.map(item => h('span', {
            key: item.id,
            className: 'dss-ripple',
            style: {
                left: item.left + 'px',
                top: item.top + 'px',
                width: item.size + 'px',
                height: item.size + 'px',
                clipPath: item.clip
            }
        })));
}
