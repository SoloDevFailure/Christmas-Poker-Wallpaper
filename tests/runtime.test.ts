import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);

test('installed React renderer loads and matches the pinned manifest and lockfile', async () => {
  const react = require('react/package.json').version;
  const dom = require('react-dom/package.json').version;
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(react, dom);
  for (const name of ['react', 'react-dom']) {
    assert.equal(manifest.dependencies[name], react, 'React dependencies must be exact versions');
    assert.equal(lock.packages['node_modules/' + name].version, react);
  }
  assert.equal(typeof (await import('react-dom/client')).createRoot, 'function');
});

test('production build preflight rejects a mismatched React installation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'poker-react-check-'));
  await copyFile(new URL('../scripts/check-react.mjs', import.meta.url), join(dir, 'check-react.mjs'));
  for (const [name, version] of [['react', '19.3.1'], ['react-dom', '19.2.8']]) {
    const packageDir = join(dir, 'node_modules', name);
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name, version }));
  }
  const result = spawnSync(process.execPath, [join(dir, 'check-react.mjs')], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must match exactly/);
});
