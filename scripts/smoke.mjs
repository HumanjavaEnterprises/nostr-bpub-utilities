/**
 * Smoke test — proves the SHIPPED artifact (dist), not the source, is correct.
 *
 * Loads BOTH built entry points and asserts, over each:
 *   - the builder output is byte-identical to the preserved legacy JS,
 *   - bindEntity → signManifest → verifyManifest round-trips to valid,
 *   - tampering the signed content makes verify fail,
 *   - the manifest npub must match the signing key (binding integrity),
 *   - no private-key material appears in the signed event.
 *
 * Targets:
 *   - `dist/cjs/index.js`  loaded via `require(...)`  (the CommonJS artifact)
 *   - `dist/index.js`      loaded via `import(...)`    (the ESM artifact)
 *
 * Fixtures come from `test/` — the same source the vitest suites consume — so tests
 * and smoke can never drift. Dev-only; `test/` never ships. Non-zero exit on any
 * mismatch.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(new URL('..', import.meta.url).pathname);

const cjs = require(resolve(root, 'dist/cjs/index.js'));
const esm = await import(pathToFileURL(resolve(root, 'dist/index.js')).href);

const legacy = await import(pathToFileURL(resolve(root, 'test/legacy/index.js')).href);
const { SIGNER, OTHER_NPUB } = await import(
  pathToFileURL(resolve(root, 'test/vectors.mjs')).href
);

// Explicit page + registry + generated_by (as an adopting platform supplies them) keep
// the TS output byte-identical to the legacy oracle, whose defaults changed this release.
const INPUT = {
  slug: 'joes',
  name: 'Joe’s Plumbing',
  verified: true,
  generated_by: 'test-emitter',
  page: 'https://joes.example.com',
  registry: 'https://registry.example.com',
  links: [
    { kind: 'website', url: 'https://joes.example.com' },
    { kind: 'pay', url: 'mailto:pay@joes.example.com' },
  ],
};

const targets = [
  { label: 'cjs (require dist/cjs/index.js)', api: cjs },
  { label: 'esm (import dist/index.js)', api: esm },
];

let passed = 0;
let failed = 0;
const failures = [];

function check(label, description, actual, expected) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    failures.push(`  ✗ [${label}] ${description}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('nostr-bpub-utilities — smoke test over the BUILT dist');
console.log(`  targets: ${targets.map((t) => t.label.split(' ')[0]).join(', ')}`);
console.log('');

for (const { label, api } of targets) {
  const { buildBusinessManifest, bindEntity, signManifest, verifyManifest, npubOf } = api;
  for (const fn of ['buildBusinessManifest', 'bindEntity', 'signManifest', 'verifyManifest', 'npubOf']) {
    check(label, `exports ${fn}`, typeof api[fn], 'function');
  }

  // Builder parity vs the preserved legacy JS — byte-identical.
  const ours = buildBusinessManifest(INPUT);
  const theirs = legacy.buildBusinessManifest(INPUT);
  check(label, 'builder byte-identical to legacy', JSON.stringify(ours), JSON.stringify(theirs));
  check(label, 'emits attribution notice', 'attribution' in ours.meta, true);

  // Bind → sign → verify round-trip.
  const bound = bindEntity(ours, { npub: SIGNER.npub });
  const event = signManifest(bound, SIGNER.skHex);
  check(label, 'event pubkey matches signer', event.pubkey, SIGNER.pubkey);
  const res = verifyManifest(event);
  check(label, 'verify valid', res.valid, true);
  check(label, 'verify returns signer npub', res.npub, SIGNER.npub);
  check(label, 'npubOf(pubkey) === signer npub', npubOf(event.pubkey), SIGNER.npub);

  // Tamper.
  const tampered = { ...event, content: event.content.replace('Joe', 'Moe') };
  check(label, 'tampered content → invalid', verifyManifest(tampered).valid, false);

  // Binding integrity: signed by SIGNER but claims OTHER_NPUB → invalid.
  const misbound = bindEntity(ours, { npub: OTHER_NPUB });
  const misEvent = signManifest(misbound, SIGNER.skHex);
  check(label, 'npub ≠ pubkey → invalid', verifyManifest(misEvent).valid, false);

  // No-leak.
  const evJson = JSON.stringify(event);
  check(label, 'no skHex in event', evJson.includes(SIGNER.skHex), false);
  check(label, 'no nsec in event', evJson.toLowerCase().includes('nsec1'), false);
}

console.log(`Checks: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('');
  console.log('FAIL — the built artifact did not match expectations:');
  console.log(failures.join('\n'));
  console.log('');
  console.log('SMOKE: FAIL');
  process.exit(1);
}

console.log('');
console.log('SMOKE: PASS — the shipped package builds byte-identically and signs/verifies over ESM + CJS.');
process.exit(0);
