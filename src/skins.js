/**
 * dsh-selfskin — built-in skin catalog.
 *
 * WHAT A SKIN IS HERE
 * A skin is a token table, not a stylesheet. `ctx.theme.register()` accepts
 * `{ id, colorScheme, tokens }` and `ThemePresenter.apply()` writes every entry
 * of `tokens` onto `<body>` with `style.setProperty(name, value)`. Two
 * consequences shape this file:
 *
 *   1. Values are PLAIN STRINGS, already resolved for this skin's own
 *      `colorScheme`. This is the opposite of `overrideTokens()`, which takes
 *      `{ light, dark }` pairs — `ThemeRuntime.composeActive()` resolves those
 *      with `modes[active.colorScheme]` before applying. Mixing the two shapes
 *      is the single easiest way to break a skin: a pair handed to `register()`
 *      survives into `body.style` as `[object Object]` and the surface goes
 *      blank. See the shape table in docs/dsh-skin-方案-v1.0.md §4.4.
 *
 *   2. Only `--dsw-*` tokens are overridden. Literal colours belong to artwork;
 *      a token renamed by a future DSH degrades the look of one surface instead
 *      of breaking rendering, which is why `practices.md` mandates tokens.
 *
 * `colorScheme` is load-bearing: it drives `body[data-ds-dark-theme]` and
 * `document.documentElement.style.colorScheme`, so a dark skin must declare
 * `dark` or the host's own dark stylesheet will not activate under it.
 *
 * Ids are namespaced `selfskin-*` so they can never collide with a shipped
 * theme id (`light`, `dark`, `sakura`, `graphite`, ...).
 */

/** Default selection: the host's own "follow the system" appearance. */
export const DEFAULT_SKIN_ID = 'system';

/**
 * The host's own appearance preferences, offered as first-class picker entries.
 *
 * They are listed here rather than synthesised in the UI because every value the
 * picker can produce must be an id `ctx.theme.setTheme()` accepts. An earlier
 * revision used a `default` sentinel meaning "follow the host"; that id is not a
 * registered theme, so `setTheme('default')` threw, the error was swallowed by
 * the recovery path, and picking it silently left the previous skin in place.
 * `system`, `light` and `dark` are the three ids the theme runtime treats as
 * preferences.
 */
export const HOST_APPEARANCES = [
    { id: 'system', name: { zh: '跟随系统', en: 'System' } },
    { id: 'light', name: { zh: '亮色（宿主）', en: 'Light (host)' } },
    { id: 'dark', name: { zh: '暗色（宿主）', en: 'Dark (host)' } }
];

/**
 * Built-in catalog.
 *
 * Each entry: `{ id, name: { zh, en }, colorScheme, swatch, tokens }`.
 * `swatch` is UI-only (three hex colours used to paint the picker chip) and is
 * never handed to the theme runtime.
 */
export const BUILTIN_SKINS = [
  {
    id: 'selfskin-ocean',
    name: { zh: '深海蓝', en: 'Deep Ocean' },
    colorScheme: 'dark',
    swatch: ['#0a1020', '#3b82f6', '#e6edf8'],
    tokens: {
      '--dsw-alias-bg-base': '#0a1020',
      '--dsw-alias-bg-layer-1': '#111a2e',
      '--dsw-alias-bg-layer-2': '#16213a',
      '--dsw-alias-bg-layer-3': '#1c2a48',
      '--dsw-alias-bg-layer-4': '#233355',
      '--dsw-alias-bg-mask-1': 'rgba(4, 8, 18, 0.62)',
      '--dsw-alias-brand-primary': '#3b82f6',
      '--dsw-alias-label-primary': '#e6edf8',
      '--dsw-alias-label-secondary': '#a9b8d0',
      '--dsw-alias-label-tertiary': '#7c8ca6',
      '--dsw-alias-label-caption': '#64738c',
      '--dsw-alias-border-l1': '#1f2b45',
      '--dsw-alias-border-l2': '#253352',
      '--dsw-alias-border-l3': '#2d3d61',
      '--dsw-alias-border-l4': '#3a4d77',
      '--dsw-alias-link': '#6aa6ff',
      '--dsw-alias-button-primary-fill': 'linear-gradient(135deg, #1e5fd0, #3b82f6)',
      '--dsw-alias-button-primary-hover': 'linear-gradient(135deg, #2b6fe0, #4f92ff)',
      '--dsw-alias-button-ghost-active-fill': 'rgba(59, 130, 246, 0.14)',
      '--dsw-alias-button-ghost-active-border': 'rgba(59, 130, 246, 0.5)',
      '--dsw-alias-button-tool-bar-fill': 'rgba(255, 255, 255, 0.04)',
      '--dsw-alias-button-tool-bar-hover': 'rgba(255, 255, 255, 0.09)',
      '--dsw-alias-interactive-bg-hover': 'rgba(255, 255, 255, 0.06)',
      '--dsw-alias-interactive-bg-active': 'rgba(255, 255, 255, 0.1)',
      '--dsw-alias-state-business-primary': '#3b82f6',
      '--dsw-alias-markdown-inline-code': 'rgba(59, 130, 246, 0.14)',
      '--dsw-alias-markdown-code-block': '#0c1424',
      '--dsw-alias-scrollbar-bg-l2': 'rgba(255, 255, 255, 0.1)',
      '--dsw-alias-scrollbar-hover-l2': 'rgba(255, 255, 255, 0.18)',
      '--dsw-specific-sidebar-fill': '#0d1526',
      '--dsw-specific-input-major': '#0f1830',
      '--dsw-specific-menu': '#141f36'
    }
  },
  {
    id: 'selfskin-graphite',
    name: { zh: '石墨', en: 'Graphite' },
    colorScheme: 'dark',
    swatch: ['#131313', '#a0a4ab', '#ececec'],
    tokens: {
      '--dsw-alias-bg-base': '#131313',
      '--dsw-alias-bg-layer-1': '#1a1a1a',
      '--dsw-alias-bg-layer-2': '#212121',
      '--dsw-alias-bg-layer-3': '#282828',
      '--dsw-alias-bg-layer-4': '#303030',
      '--dsw-alias-bg-mask-1': 'rgba(0, 0, 0, 0.6)',
      '--dsw-alias-brand-primary': '#a0a4ab',
      '--dsw-alias-label-primary': '#ececec',
      '--dsw-alias-label-secondary': '#b3b3b3',
      '--dsw-alias-label-tertiary': '#8a8a8a',
      '--dsw-alias-label-caption': '#6e6e6e',
      '--dsw-alias-border-l1': '#2a2a2a',
      '--dsw-alias-border-l2': '#333333',
      '--dsw-alias-border-l3': '#3d3d3d',
      '--dsw-alias-border-l4': '#4a4a4a',
      '--dsw-alias-link': '#c9ccd1',
      '--dsw-alias-button-primary-fill': 'linear-gradient(135deg, #4a4d52, #6e7278)',
      '--dsw-alias-button-primary-hover': 'linear-gradient(135deg, #585c62, #7f838a)',
      '--dsw-alias-button-ghost-active-fill': 'rgba(255, 255, 255, 0.09)',
      '--dsw-alias-button-ghost-active-border': 'rgba(255, 255, 255, 0.26)',
      '--dsw-alias-button-tool-bar-fill': 'rgba(255, 255, 255, 0.04)',
      '--dsw-alias-button-tool-bar-hover': 'rgba(255, 255, 255, 0.1)',
      '--dsw-alias-interactive-bg-hover': 'rgba(255, 255, 255, 0.07)',
      '--dsw-alias-interactive-bg-active': 'rgba(255, 255, 255, 0.12)',
      '--dsw-alias-state-business-primary': '#a0a4ab',
      '--dsw-alias-markdown-inline-code': 'rgba(255, 255, 255, 0.1)',
      '--dsw-alias-markdown-code-block': '#0f0f0f',
      '--dsw-alias-scrollbar-bg-l2': 'rgba(255, 255, 255, 0.12)',
      '--dsw-alias-scrollbar-hover-l2': 'rgba(255, 255, 255, 0.2)',
      '--dsw-specific-sidebar-fill': '#171717',
      '--dsw-specific-input-major': '#1d1d1d',
      '--dsw-specific-menu': '#1f1f1f'
    }
  },
  {
    id: 'selfskin-midnight',
    name: { zh: '子夜（纯黑）', en: 'Midnight OLED' },
    colorScheme: 'dark',
    swatch: ['#000000', '#7c5cff', '#f2f2f2'],
    tokens: {
      '--dsw-alias-bg-base': '#000000',
      '--dsw-alias-bg-layer-1': '#070707',
      '--dsw-alias-bg-layer-2': '#0d0d0d',
      '--dsw-alias-bg-layer-3': '#121212',
      '--dsw-alias-bg-layer-4': '#181818',
      '--dsw-alias-bg-mask-1': 'rgba(0, 0, 0, 0.72)',
      '--dsw-alias-brand-primary': '#7c5cff',
      '--dsw-alias-label-primary': '#f2f2f2',
      '--dsw-alias-label-secondary': '#a0a0a0',
      '--dsw-alias-label-tertiary': '#7a7a7a',
      '--dsw-alias-label-caption': '#5c5c5c',
      '--dsw-alias-border-l1': '#171717',
      '--dsw-alias-border-l2': '#1f1f1f',
      '--dsw-alias-border-l3': '#282828',
      '--dsw-alias-border-l4': '#333333',
      '--dsw-alias-link': '#9d86ff',
      '--dsw-alias-button-primary-fill': 'linear-gradient(135deg, #5b3df0, #8b6cff)',
      '--dsw-alias-button-primary-hover': 'linear-gradient(135deg, #6a4dff, #9d82ff)',
      '--dsw-alias-button-ghost-active-fill': 'rgba(124, 92, 255, 0.16)',
      '--dsw-alias-button-ghost-active-border': 'rgba(124, 92, 255, 0.55)',
      '--dsw-alias-button-tool-bar-fill': 'rgba(255, 255, 255, 0.03)',
      '--dsw-alias-button-tool-bar-hover': 'rgba(255, 255, 255, 0.08)',
      '--dsw-alias-interactive-bg-hover': 'rgba(255, 255, 255, 0.06)',
      '--dsw-alias-interactive-bg-active': 'rgba(255, 255, 255, 0.1)',
      '--dsw-alias-state-business-primary': '#7c5cff',
      '--dsw-alias-markdown-inline-code': 'rgba(124, 92, 255, 0.16)',
      '--dsw-alias-markdown-code-block': '#050505',
      '--dsw-alias-scrollbar-bg-l2': 'rgba(255, 255, 255, 0.1)',
      '--dsw-alias-scrollbar-hover-l2': 'rgba(255, 255, 255, 0.18)',
      '--dsw-specific-sidebar-fill': '#000000',
      '--dsw-specific-input-major': '#0a0a0a',
      '--dsw-specific-menu': '#0d0d0d'
    }
  },
  {
    id: 'selfskin-sakura',
    name: { zh: '樱花', en: 'Sakura' },
    colorScheme: 'light',
    swatch: ['#fff7fa', '#e0568a', '#3a2b33'],
    tokens: {
      '--dsw-alias-bg-base': '#fff7fa',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-bg-layer-2': '#fff2f7',
      '--dsw-alias-bg-layer-3': '#ffe9f1',
      '--dsw-alias-bg-layer-4': '#ffdde9',
      '--dsw-alias-bg-mask-1': 'rgba(58, 43, 51, 0.28)',
      '--dsw-alias-brand-primary': '#e0568a',
      '--dsw-alias-label-primary': '#3a2b33',
      '--dsw-alias-label-secondary': '#6b5763',
      '--dsw-alias-label-tertiary': '#907a88',
      '--dsw-alias-label-caption': '#ab96a3',
      '--dsw-alias-border-l1': '#ffe0ec',
      '--dsw-alias-border-l2': '#fbd2e2',
      '--dsw-alias-border-l3': '#f6c0d5',
      '--dsw-alias-border-l4': '#efabc6',
      '--dsw-alias-link': '#d24a80',
      '--dsw-alias-button-primary-fill': 'linear-gradient(135deg, #e0568a, #ff8fb4)',
      '--dsw-alias-button-primary-hover': 'linear-gradient(135deg, #e96797, #ff9dbf)',
      '--dsw-alias-button-ghost-active-fill': 'rgba(224, 86, 138, 0.1)',
      '--dsw-alias-button-ghost-active-border': 'rgba(224, 86, 138, 0.42)',
      '--dsw-alias-button-tool-bar-fill': 'rgba(224, 86, 138, 0.05)',
      '--dsw-alias-button-tool-bar-hover': 'rgba(224, 86, 138, 0.12)',
      '--dsw-alias-interactive-bg-hover': 'rgba(224, 86, 138, 0.08)',
      '--dsw-alias-interactive-bg-active': 'rgba(224, 86, 138, 0.14)',
      '--dsw-alias-state-business-primary': '#e0568a',
      '--dsw-alias-markdown-inline-code': 'rgba(224, 86, 138, 0.1)',
      '--dsw-alias-markdown-code-block': '#fff4f8',
      '--dsw-alias-scrollbar-bg-l2': 'rgba(224, 86, 138, 0.18)',
      '--dsw-alias-scrollbar-hover-l2': 'rgba(224, 86, 138, 0.3)',
      '--dsw-specific-sidebar-fill': '#fffafc',
      '--dsw-specific-input-major': '#ffffff',
      '--dsw-specific-menu': '#fffdfe'
    }
  },
  {
    id: 'selfskin-paper',
    name: { zh: '暖纸', en: 'Warm Paper' },
    colorScheme: 'light',
    swatch: ['#f7f2e8', '#b07d3b', '#3b3226'],
    tokens: {
      '--dsw-alias-bg-base': '#f7f2e8',
      '--dsw-alias-bg-layer-1': '#fffdf7',
      '--dsw-alias-bg-layer-2': '#f9f4ea',
      '--dsw-alias-bg-layer-3': '#f2ebdd',
      '--dsw-alias-bg-layer-4': '#eae0cd',
      '--dsw-alias-bg-mask-1': 'rgba(59, 50, 38, 0.28)',
      '--dsw-alias-brand-primary': '#b07d3b',
      '--dsw-alias-label-primary': '#3b3226',
      '--dsw-alias-label-secondary': '#6b5d4a',
      '--dsw-alias-label-tertiary': '#8d7c66',
      '--dsw-alias-label-caption': '#a5967f',
      '--dsw-alias-border-l1': '#e8dfcd',
      '--dsw-alias-border-l2': '#ded2ba',
      '--dsw-alias-border-l3': '#d2c3a6',
      '--dsw-alias-border-l4': '#c4b291',
      '--dsw-alias-link': '#96702f',
      '--dsw-alias-button-primary-fill': 'linear-gradient(135deg, #a97434, #c99a55)',
      '--dsw-alias-button-primary-hover': 'linear-gradient(135deg, #b8823e, #d5a866)',
      '--dsw-alias-button-ghost-active-fill': 'rgba(176, 125, 59, 0.12)',
      '--dsw-alias-button-ghost-active-border': 'rgba(176, 125, 59, 0.42)',
      '--dsw-alias-button-tool-bar-fill': 'rgba(176, 125, 59, 0.06)',
      '--dsw-alias-button-tool-bar-hover': 'rgba(176, 125, 59, 0.14)',
      '--dsw-alias-interactive-bg-hover': 'rgba(176, 125, 59, 0.1)',
      '--dsw-alias-interactive-bg-active': 'rgba(176, 125, 59, 0.16)',
      '--dsw-alias-state-business-primary': '#b07d3b',
      '--dsw-alias-markdown-inline-code': 'rgba(176, 125, 59, 0.12)',
      '--dsw-alias-markdown-code-block': '#fbf7ee',
      '--dsw-alias-scrollbar-bg-l2': 'rgba(176, 125, 59, 0.2)',
      '--dsw-alias-scrollbar-hover-l2': 'rgba(176, 125, 59, 0.34)',
      '--dsw-specific-sidebar-fill': '#fbf7ee',
      '--dsw-specific-input-major': '#fffdf7',
      '--dsw-specific-menu': '#fffdf9'
    }
  }
];
