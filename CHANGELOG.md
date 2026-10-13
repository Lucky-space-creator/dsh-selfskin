# Changelog

All notable changes to `dsh-selfskin` are recorded here.
This project follows [Semantic Versioning](https://semver.org/).

## 1.1.0

The plugin stops living inside the host's general settings and gets a surface of
its own: a sidebar entry labelled 「皮肤管理」 that opens a panel. The wallpaper
moves to the skin row with it.

### Added
- A sidebar entry and the panel it opens. `sidebar.panellist` contributes the row
  (`id: 'selfskin'`, `order: 20`, so it sorts after the host's own plugin and task
  rows), and `main` — the layout's keyed slot — contributes the page under the same
  id as its `key`. The layout renders whichever `main` entry matches the active
  panel id, so the shared id is the whole contract between the two halves.
- The panel brings its own page chrome: heading, width and padding, in a
  plugin-owned container. The host's `main` slot is a bare column — the official
  plugin and task panels each supply their own — so this is ours to write.
- `SkinPanelIcon`, a palette glyph drawn in-file rather than borrowed from the
  host's icon set. It takes its size from props because the sidebar asks for 16 or
  18 depending on whether it is expanded, and it fills while the panel is active.

### Changed
- The wallpaper moves from 「氛围特效」 to 「皮肤」. It is a background choice, not
  an animating overlay: it is stacked beneath everything, survives with every
  effect off, and belongs with the look. Its switch and panel now sit under the
  skin picker, and the ambience row keeps exactly its three effects.
- The three settings rows are no longer registered under
  `settings.general.item`. Their content is unchanged; they simply have a page to
  live on now, and the host's general settings stay the host's.

### Engineering
- 67 assertions (was 65). The two new ones guard the panel contract: the sidebar
  row's id must equal the panel's `key`, and nothing may be contributed to
  `settings.general.item` again. Both were falsification-tested — drifting the key
  or resurrecting a settings row each fails exactly one assertion.
- `SkinPanelIcon` guards `props` itself, not just `props.size`. The sidebar always
  passes `{ size, active }`, but an icon that throws when rendered without them
  would take the sidebar's panel row down rather than lose a size.
- 29 + 30 + 8 (pure / client-harness / validate-package).

## 1.0.3

The switch is now the host's switch, not a lookalike: same markup shape, same
declarations, same affordances. 1.0.2 made the control work and brought its
geometry close; this release removes the remaining structural difference, which
was the reason it still read as a near-miss sitting next to a host switch.

### Changed
- The button IS the capsule. `Toggle` used to render
  `<button class="dss-switch"><span class="dss-switchTrack"><span class="dss-switchThumb"/></span><span class="dss-switchLabel">…</span></button>`,
  so the capsule was a child of the element carrying `aria-checked`. The host's
  `Switch` is `<button class="switch" role="switch" aria-checked><span class="thumb"/></button>`
  — one element draws the shape and holds the state — and the plugin now matches
  it exactly. The intermediate `.dss-switchTrack` layer is gone, which also
  removes the shape of selector that silently missed in 1.0.2.
- `src/effects/ui.css`'s switch block is now a declaration-for-declaration copy
  of `dsh-client-ui-primitives/lib/Switch.module.css`, with the source noted in
  a comment so the two can be diffed. Anything the host's switch does not have
  was dropped: a `color` hover state, `background-color` transitions on both the
  capsule and the thumb (the host's fill snaps and only the thumb animates),
  and a `border-radius` on the focus ring.
- Added what the host *did* have and we lacked: `:disabled` (cursor default,
  `opacity: .5`) and the explicit `[aria-checked="false"]` thumb colour rather
  than relying on a default.

### Note
- The visible caption moved outside the `<button>`. The host's button holds
  nothing but the thumb — it is exactly 36x20 with 2px padding — so words inside
  it would widen the pill and stretch the capsule. The host solves this by
  keeping its own label invisible (`aria-label` only) and letting the settings
  row supply the words; here the caption sits beside the capsule as a sibling
  and is `aria-hidden`, because `aria-label` already names the control and a
  screen reader would otherwise announce it twice. The four per-row switches
  (lift / shimmer / ripple, aurora / dust / glass / wallpaper) cannot follow the
  host all the way to unlabelled — with no visible words they would be
  indistinguishable — so this is the one deliberate departure, and it is
  confined to layout rather than to the control.

### Engineering
- 65 assertions (was 61). The four new ones guard this permanently: the capsule
  is checked declaration by declaration against the host's, an intermediate
  track layer is refused, the on-state and 16px travel must key off the button,
  and no declaration the host switch lacks may be present. Each was
  falsification-tested — injecting the host-absent hover rule, a 34px capsule, or
  a returning track layer each fails exactly one assertion.
- `test/client-harness.mjs` grew a `blockOf(css, selector)` helper that skips
  braces inside comments and depth-counts nesting. The first version stopped at
  the first `}`, which truncated the rule at the `{ corner-shape: … }` inside the
  block's own comment and reported a declaration as missing when it was present.

## 1.0.2

Two defects in the switch control, reported after running the plugin in the
desktop app. The plugin worked — the store updated, the wallpaper panel opened —
but the control never changed appearance, and it did not match the host's own
switches.

### Fixed
- The switch's on-state was invisible. `src/effects/ui.css` styled
  `.dss-switchTrack[aria-checked="true"]`, but `aria-checked` is rendered on the
  root `<button class="dss-switch">` — the track never receives the attribute, so
  both the track fill and the thumb travel were dead rules. Clicking a switch
  updated the preference and left the control looking frozen. The selectors now
  key off the root (`.dss-switch[aria-checked="true"] …`), which is also what the
  host's own `Switch.module.css` does, so the visual state cannot disagree with
  what assistive technology reads.
- The switch did not look like the host's. A global stylesheet
  (`dsh-client-ui-theme`, `@supports (corner-shape:superellipse(1.5))` with
  `*,:before,:after { corner-shape: … }`) draws every rounded box as a squircle.
  The host's capsule and circular primitives opt back out with
  `corner-shape: round`; ours did not, so the track read as a squashed rounded
  rectangle and the circular thumb as a blob. Geometry and colours were also
  retuned to the host's switch: 36x20 track, 2px inset, 16x16 thumb,
  `--dsw-alias-border-l3` off / `--dsw-alias-brand-primary` on, 16px travel,
  `--dsw-alias-label-primary-foreground` thumb while on, and the host's 2px
  focus-ring offset.

### Changed
- The wallpaper file input is held by a React ref instead of being triggered
  through `document.getElementById('dss-wallpaper-file')`. A document-wide lookup
  finds nothing if the slot ever moves into a shadow tree, and collides when the
  row renders more than once; the ref has neither problem.

### Engineering
- 61 assertions (was 56). The new ones assert the on-state selector keys off the
  root, that no selector on the track survives, that the capsule and thumb carry
  `corner-shape: round`, that `aria-checked` and the track land on the same
  element, and that the bundle contains no document-wide lookup. Both switch
  assertions were confirmed to fail against the injected old stylesheet.
- The harness can now expand function components (`expand()`), because the React
  stub records `h(Toggle, …)` without invoking it the way React would.

## 1.0.1

Installer and documentation fixes found by performing the local install for real
on Windows. No bundle code changed.

### Fixed
- `test/install.ps1` crashed before doing anything: it resolved its default
  package root with `Split-Path -Parent $PSScriptRoot` inside the `param()` block,
  and Windows PowerShell 5.1 still has `$PSScriptRoot` empty while a parameter
  default is evaluated. The root is now resolved in the script body. A syntax
  check cannot catch this — only running the script does.
- A bare local directory path installs nothing on a default Windows setup. pnpm
  resolves it to the `link:` protocol, which means "create a directory symlink";
  creating one across volumes needs privileges Windows does not grant, and pnpm
  does not surface the failure — it prints `+ dsh-selfskin link:...`, writes the
  dependency into `package.json` and `pnpm-lock.yaml`, and leaves `node_modules`
  empty. Bundle composition then dies with `cannot resolve profile bundle`.
  Every documented route now passes an explicit `file:` specifier, which
  hardlinks the package instead and needs no privileges. This is required in the
  plugin manager's install field too.
- The install instructions pointed at `Settings -> Plugins -> Install`; the
  install field lives on the sidebar's Plugins page (the settings list is
  read-only). Both documents and the installer output now say so.

### Added
- `test/install.ps1` locates the CLI by itself. The desktop build ships it at
  `<install>\resources\runtime\cli\bin\dsh.cmd` and does not put it on `PATH`, so
  the script now resolves the Start Menu / Desktop shortcut and derives the CLI
  from the application it points at, falling back to the usual install roots and
  to `-DshPath`.
- `docs/dsh-selfskin-安装实测-v1.2.md` — the install record: root cause with the
  reproduction, the composition facts read out of the shipped implementation,
  end-to-end composition evidence, and rollback.

## 1.0.0

First release. Built against DeepSeek Harness desktop `0.2.0-rc.2` with the
`desktop` profile.

### Skins
- Five built-in token skins: 深海蓝 / 石墨 / 子夜（纯黑） / 樱花 / 暖纸, each
  declaring its own `colorScheme` so the host's light and dark stylesheets follow.
- The host's own appearances (跟随系统 / 亮色 / 暗色) are first-class picker
  entries, so returning to the built-in look is a normal selection.
- Custom skins are imported from a pasted JSON document and stored in the browser;
  validation rejects any token key outside `--dsw-*` and reports which key failed.
- Skin choice, effect switches and wallpaper live in `localStorage` under
  `dsh-selfskin:state:v1` and are re-applied on boot, because a third-party theme
  id is an in-process extension the host does not persist.

### Button effects
- Base layer: token-driven transitions plus a `:focus-visible` ring, isolated with
  `:where()` so host declarations always win.
- 抬升与辉光 — hover lift, brand-tinted glow, and a press rebound.
- 流光 — a gradient sweep on hover, driven by widening the paint area so it is a
  no-op on flat-coloured buttons instead of a defect.
- 涟漪 — a click ripple, switchable, drawn in the plugin's own overlay layer and
  clipped to the button with `clip-path`. No host element is mutated.

### Ambience effects
- 极光 — an animated aurora, tinted from the active skin's accent.
- 光尘 — a low-opacity drifting particle field.
- 毛玻璃 — a deeper translucency layer over the canvas, sidebar and first two surface
  levels, leaving text surfaces opaque.
- 壁纸 — a local image or pasted URL, with opacity, blur and four fit modes. The
  URL is escaped before interpolation into `url("...")`.

### Engineering
- Zero-dependency build (`node build.mjs`) emitting the `__ModuleLoader__` bundle
  shape the shell expects; `src/` is the single editable source of truth.
- 48 assertions across a pure-helper unit suite and a client wiring harness that
  loads the real bundle in a `vm` sandbox.
