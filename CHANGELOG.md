# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-28

Initial release — build, validate, sign, and verify the `bpub-business/0.1` business manifest.

### Added

- **Layer 1 — the manifest (pure data, safe anywhere):**
  - `buildBusinessManifest(input)` — build a `bpub-business/0.1` manifest from a normalized record
    (identity, meta, branding, verb-typed `channels`, hours, resilience). TypeScript port of the original
    implementation; for a given input its mapping is **byte-identical** to the original (pinned by the
    parity test). **Host-agnostic:** the builder never hardcodes a domain. A new optional `hostBase` input
    (a bare host like `"acme.example"`) derives `page = https://${slug}.${hostBase}` when a `slug` but no
    explicit `page` is given, and seeds `resilience.registry = https://${hostBase}` when `registry` is
    absent. With neither `page` nor `hostBase`, `page` is `null` and `registry` is omitted — no domain is
    invented. (Intentional change from the original, which hardcoded a product host; adopters pass their own
    host, so it does not affect callers that already supply `page`/`registry`.) The default `generated_by`
    is now `"nostr-bpub-utilities"`.
  - `validateBusinessManifest(manifest)` — a fast, zero-dependency structural guard returning
    `{ valid, errors }`.
  - `linksToChannels(links, { pageUrl })` — map a flat `{ kind, url }` link list to verb-typed channels.
- **Layer 2 — the signature (Nostr / schnorr):**
  - `signManifest(manifest, nsec, opts?)` — wrap the manifest in a NIP-01 parameterized-replaceable Nostr
    event (`kind 30078`, `d`-tag = the business slug) and schnorr-sign (BIP340) it. **ENCLAVE/CLIENT-ONLY:**
    the `nsec` is used and dropped — never returned, logged, or echoed in an error; the scalar is zeroed after
    use. Accepts an `nsec…` bech32 or a 64-char hex key; rejects non-private-key input without echoing it.
  - `verifyManifest(event)` — recompute the event id, schnorr-verify against `event.pubkey`, parse the
    manifest, and assert the manifest's claimed `npub` equals the signing key. Pure/public.
  - `bindEntity(manifest, { npub, payAddress?, payAsset?, payVia? })` — set `identity.nostr.npub` and, when a
    pre-derived receiving `payAddress` is given, set `channels.pay`. Pure/public; returns a new manifest (the
    input is not mutated). **A raw extended public key (`zpub`/`xpub`) is never embedded** — it exposes the
    whole receive-address chain — so passing `zpubBTC`/`zpubLTC` throws a `BindingError` and writes nothing.
  - `deriveZpubAddress(zpub, asset?)` — convenience that turns a `zpub` into a single address for `payAddress`.
    Loads the optional `nostr-zpub-utilities` peer via a dynamic `import()`; derives only when the peer is
    installed, and throws (never returns the raw `zpub`) when it is absent.
  - `npubOf(hexPubkey)` / `pubkeyOfNpub(npub)` — bech32 `npub` encode / decode helpers.
- **Tests (vitest):** builder parity (byte-identical to the original over a fixture set), sign→verify
  round-trip, tamper detection, binding integrity (npub ≠ pubkey rejected), no-leak (no private key in any
  return value or error), and schnorr correctness against a known BIP340 test vector. Plus a built-artifact
  smoke test over ESM + CJS.
- Dual ESM + CommonJS build with `.d.ts` and a browser IIFE bundle. Runtime deps pinned exact to the audited
  stack: `@noble/curves` 2.3.0, `@noble/hashes` 2.3.0, `@scure/base` 2.3.0. `nostr-zpub-utilities` is an
  optional peer used only by `bindEntity`.

### Notes

- `signManifest` is the only function that touches a private key; it never stores, logs, transmits, or echoes
  it. Every other function operates on PUBLIC material only. See [SECURITY.md](SECURITY.md).
