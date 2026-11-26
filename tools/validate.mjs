#!/usr/bin/env node
// Validates a homelab-atlas inventory:
//   1. shape — against schema/inventory.schema.json (types, required fields, id format)
//   2. meaning — src/model.js, the same code the page runs: every reference resolves, ids are unique,
//      one cable per wired port, IPs inside their network, no duplicate IPs, speed sanity.
// Errors fail (exit 1); warnings are printed. Usage: node tools/validate.mjs <inventory.yaml>...
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const Ajv = require('ajv');
const here = dirname(fileURLToPath(import.meta.url));
const model = require(join(here, '..', 'src', 'model.js'));
const schema = JSON.parse(readFileSync(join(here, '..', 'schema', 'inventory.schema.json'), 'utf8'));
const check = new Ajv({ allErrors: true, useDefaults: false }).compile(schema);

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: validate.mjs <inventory.yaml>...'); process.exit(2); }

let failed = false;
for (const file of files) {
  let data;
  try {
    data = yaml.load(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✗ ${file}: ${e.message}`);
    failed = true;
    continue;
  }

  if (!check(data)) {
    for (const e of check.errors) console.error(`✗ ${file}: ${e.instancePath || '/'} ${e.message}`);
    failed = true;
    continue;   // the model assumes the shape is right
  }

  const m = model.build(data);
  for (const e of m.errors) console.error(`✗ ${file}: ${e}`);
  for (const w of m.warnings) console.warn(`! ${file}: ${w}`);
  if (m.errors.length) failed = true;
  else console.log(`✓ ${file}: ${m.nodes.size} nodes, ${m.ports.size} ports, ${m.links.length} links, ${m.networks.size} networks`);
}
process.exit(failed ? 1 : 0);
