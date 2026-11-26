// Surgical YAML edits must change exactly one line of the example inventory each — that is what
// keeps a save from the editor a clean, reviewable Git diff.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const E = require('../src/yamledit.js');
const YAML = require('yaml');
const t0 = readFileSync(new URL('../config/inventory.yaml', import.meta.url), 'utf8');

const changed = (a, b) => { const A = a.split('\n'), B = b.split('\n'); return B.filter((l, i) => l !== A[i]); };
const cases = {
  'set scalar':    [E.setScalar(t0, ['nodes', 1, 'layout', 'x'], 140), '    layout: { x: 140, y: 160, w: 120, d: 80, h: 24 }'],
  'add key':       [E.setKey(t0, ['nodes', 1, 'ports', 0], 'side', 'south'), '      - { id: wan,  speed: 1G, side: south }'],
  'replace key':   [E.setKey(t0, ['nodes', 3, 'ports', 0], 'side', 'north'), '      - { id: uplink, speed: 1G, side: north, networks: [lan] }'],
  'delete key':    [E.deleteKey(t0, ['nodes', 3, 'ports', 0], 'side'), '      - { id: uplink, speed: 1G, networks: [lan] }'],
};
for (const [name, [text, line]] of Object.entries(cases)) {
  assert.deepEqual(changed(t0, text), [line], name);
  YAML.parse(text);
}
const appended = E.appendItem(t0, ['links'], '{ from: nas:eth0, to: router:lan1 }');
assert.ok(appended.includes('\n  - { from: nas:eth0, to: router:lan1 }'), 'append item');
assert.equal(appended.split('\n').length, t0.split('\n').length + 1, 'append adds one line');
console.log('yamledit: all edits are surgical');
