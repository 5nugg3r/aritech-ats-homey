'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('dependabot declares a real package ecosystem', () => {
  const yaml = fs.readFileSync(path.join(root, '.github/dependabot.yml'), 'utf8');
  const ecosystems = [...yaml.matchAll(/^\s*-?\s*package-ecosystem:\s*"?([^"\n#]*)"?/gm)]
    .map((m) => m[1].trim());

  assert.ok(ecosystems.length > 0, 'no package-ecosystem entry found');
  for (const value of ecosystems) {
    assert.notStrictEqual(value, '', 'package-ecosystem is still the empty template placeholder');
  }
});

test('the vendored library records its local modifications', () => {
  const notice = fs.readFileSync(path.join(root, 'lib/aritech/NOTICE'), 'utf8');

  assert.doesNotMatch(
    notice,
    /copied files are \*\*verbatim\*\*, unmodified/,
    'NOTICE still claims the vendored copy is unmodified',
  );
  assert.match(notice, /## Modifications/);
  // Every locally changed file must be named, or a future update silently drops the change.
  for (const file of ['aritech-client.js', 'message-helpers.js']) {
    assert.ok(notice.includes(file), `NOTICE does not mention ${file}`);
  }
});
