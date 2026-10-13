/**
 * dsh-selfskin — Host half.
 *
 * This half exists for exactly one reason: a bundle's `cordis.patch.yml` inserts
 * a loader row, and that row must resolve to a module. The row is mounted from
 * lib/index.js, so this file has to export something the loader accepts.
 *
 * Everything the user sees is owned by the browser half (lib/client.js), which
 * the shell picks up through the package's `dsh.client` declaration — the same
 * split the shipped `ui-*` packages use. There is deliberately no `Config`
 * schema and no HTTP route here:
 *
 *   * `Config` would add a hard dependency on `@deepseek-ai/schemastery`
 *     resolving at module-evaluation time. If it does not, the whole module
 *     fails and the plugin disappears. A decoration does not need that risk.
 *   * No route is registered because the plugin ships no assets of its own:
 *     skins are token tables, effects are CSS, and the wallpaper is a URL the
 *     user pastes. Nothing needs serving.
 *
 * User preferences (active skin, effect switches, imported skins, wallpaper)
 * live in the browser's localStorage, keyed under `dsh-selfskin:state:v1`. That
 * is the documented boundary for a third-party visual preference: the Host
 * settings wire exposes only an allowlisted set of namespaces, so a plugin-owned
 * namespace would answer `settings-not-exposed`.
 */

/**
 * Host plugin entry. Intentionally a no-op: the bundle's only Host contribution
 * is the loader row itself, which `cordis.patch.yml` inserts.
 *
 * Kept as a named export of type `function apply(ctx, config)` because that is
 * one of the two accepted Host export forms (`references/host-plugin.md`).
 */
export function apply() {}
