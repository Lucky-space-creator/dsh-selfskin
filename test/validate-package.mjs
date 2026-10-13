/**
 * dsh-selfskin — package manifest integrity check.
 *
 * Run: node test/validate-package.mjs
 *
 * The plugin manager resolves the bundle through `package.json` alone: it reads
 * `dsh.bundle.patch`, follows the patch's row name to the package, and serves the
 * browser half from the `./client` export. A typo in any of those strings produces
 * an install that either fails outright or mounts a row that resolves to nothing —
 * and neither the build nor the other tests would notice, because both read the
 * source tree rather than the manifest.
 *
 * This checks the manifest against the filesystem before an install is attempted.
 */

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
const failures = [];

/**
 * Run one named assertion block, awaiting it.
 * @param name - test name.
 * @param fn - the block, sync or async.
 */
async function test(name, fn) {
    try {
        await fn();
        passed += 1;
        process.stdout.write('  ok   ' + name + '\n');
    } catch (error) {
        failures.push({ name, error });
        process.stdout.write('  FAIL ' + name + '\n');
    }
}

/**
 * Whether a repo-relative path exists as a file.
 * @param relative - path relative to the package root.
 * @returns true when the entry is a regular file.
 */
async function isFile(relative) {
    try {
        const info = await stat(resolve(ROOT, relative));
        return info.isFile();
    } catch (error) {
        void error;
        return false;
    }
}

const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
process.stdout.write('package manifest\n');

await test('the identity fields are present', () => {
    assert.equal(manifest.name, 'dsh-selfskin');
    assert.equal(manifest.type, 'module');
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(typeof manifest.description, 'string');
    assert.ok(manifest.description.length > 20, 'a description is shown on the plugin card');
});

await test('both halves are declared the way the loader looks for them', () => {
    assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
    assert.equal(manifest.dsh.client.platform, 'web');
    assert.equal(manifest.main, 'lib/index.js');
    assert.equal(manifest.exports['.'], './lib/index.js');
    assert.equal(manifest.exports['./client'], './lib/client.js');
    // The manager reads display metadata out of the package manifest.
    assert.equal(manifest.exports['./package.json'], './package.json');
    assert.equal(manifest.icon, './icon.svg');
});

await test('every path the manifest advertises exists on disk', async () => {
    const referenced = [
        manifest.main,
        manifest.icon,
        manifest.dsh.bundle.patch,
        // Wildcard subpath exports (`./locale/*.json`) name a family, not a file;
        // they are covered by the locale dictionary test below.
        ...Object.values(manifest.exports).filter(value => typeof value === 'string' && !value.includes('*'))
    ];
    for (const relative of referenced) {
        assert.ok(await isFile(relative), 'missing file referenced by package.json: ' + relative);
    }
});

await test('the shipped files list covers both halves and the patch', () => {
    for (const required of ['lib', 'cordis.patch.yml']) {
        assert.ok(manifest.files.includes(required), 'files[] must include ' + required);
    }
});

await test('the patch inserts exactly one row, addressed by package name', async () => {
    const patch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8');
    assert.match(patch, /^-\s*insert:/m, 'the patch must be a top-level insert list');
    const rows = [...patch.matchAll(/^\s{2,}-\s+id:\s*(\S+)\s*$/gm)].map(match => match[1]);
    const names = [...patch.matchAll(/^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map(match => match[1]);
    assert.deepEqual(rows, ['selfskin'], 'expected exactly one row id');
    assert.ok(names.includes(manifest.name), 'the row name must resolve to this package: ' + names.join(', '));
});

await test('the locale dictionaries parse and carry the card fields', async () => {
    for (const language of ['zh', 'en']) {
        const text = await readFile(join(ROOT, 'locale', language + '.json'), 'utf8');
        const dictionary = JSON.parse(text);
        assert.equal(typeof dictionary.title, 'string');
        assert.equal(typeof dictionary.description, 'string');
        assert.ok(dictionary.title.trim() !== '', language + ' title must not be empty');
    }
});

await test('the icon is a small SVG', async () => {
    const text = await readFile(join(ROOT, 'icon.svg'), 'utf8');
    assert.match(text, /^<svg[\s>]/, 'the icon must start with an <svg> element');
    assert.ok(Buffer.byteLength(text, 'utf8') <= 262144, 'the icon must stay under 256 KiB');
});

await test('the built browser half is the loader shape the shell expects', async () => {
    const text = await readFile(join(ROOT, 'lib', 'client.js'), 'utf8');
    assert.ok(text.includes('window.__ModuleLoader__.load('), 'the bundle must call the module loader');
    assert.ok(text.includes(JSON.stringify(manifest.name)), 'the factory id must equal the package name');
    assert.ok(!/^import\s/m.test(text), 'the bundle must not contain bare import statements');
});

process.stdout.write('\n' + passed + ' passed, ' + failures.length + ' failed\n');
for (const failure of failures) {
    process.stdout.write('\n--- ' + failure.name + '\n' + (failure.error && failure.error.stack ? failure.error.stack : String(failure.error)) + '\n');
}
process.exit(failures.length === 0 ? 0 : 1);
