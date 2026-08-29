# nostr-business-manifest — a signed business manifest

An open, host-agnostic standard and toolkit for **any Nostr platform where an `npub`
represents a business entity**: build a machine-readable business manifest, bind it to a
Nostr identity and receiving keys, and sign it so anyone can verify it without trusting
the host that serves it. The standard says *what* the manifest is; the builder leaves
every *how* — which domain, which registry — to the adopting platform, which supplies its
own host (see `hostBase`). No product is privileged; nothing is estate-specific.

> Status: **DRAFT 0.1** · Schema license: **CC BY 4.0** · Composes: `nostr-agentic-identity`
> (the `npub`), `nostr-zpub-utilities` (the receiving `zpub`), `@noble/curves` schnorr
> (Nostr event signing per NIP-01 / BIP-340).

## Two layers, one package

### Layer 1 — the manifest (data; safe anywhere)
`buildBusinessManifest` / `validateBusinessManifest` / `linksToChannels` produce and
check the `bpub-business/0.1` manifest: identity, branding, hours, and verb-typed
`channels` (`book / pay / support / ask`). Pure data transforms, no keys.

**Host-agnostic by design.** The builder never fabricates or hardcodes a domain. The
adopting platform supplies its own host via `hostBase` (a bare host like `"acme.example"`):
when a `slug` is given but no explicit `page`, the page is derived as
`https://${slug}.${hostBase}`, and `resilience.registry` defaults to `https://${hostBase}`.
An explicit `page`/`registry` overrides. With neither `page` nor `hostBase`, `page` is
`null` and `registry` is omitted — the library invents nothing.

### Layer 2 — the signature (makes the manifest verifiable)
- `bindEntity(manifest, { npub, payAddress?, payAsset?, payVia? })` — sets
  `identity.nostr.npub` and, when a **pre-derived receiving `payAddress`** is given,
  sets `channels.pay`. A raw extended public key (`zpub`/`xpub`) is **never** embedded —
  it exposes the whole receive-address chain — so passing `zpubBTC`/`zpubLTC` (or an
  extended key as `payAddress`) throws and writes nothing. Pure data.
- `deriveZpubAddress(zpub, asset?) → Promise<address>` — a convenience that turns a
  `zpub` into a single address for `payAddress`. It loads the optional
  `nostr-zpub-utilities` peer via a dynamic `import()` and only derives when the peer is
  actually installed; if it is absent it throws (it never returns the raw `zpub`).
- `signManifest(manifest, nsec) → NostrEvent` — wraps the manifest in a NIP-01
  parameterized-replaceable event (`d`-tag = the business slug) and schnorr-signs it.
  **Enclave/client-only:** the `nsec` is used and discarded — never stored, logged,
  transmitted, or returned.
- `verifyManifest(event) → { valid, npub, manifest }` — recomputes the event id,
  schnorr-verifies against `event.pubkey`, parses the manifest, and asserts that
  `manifest.identity.nostr.npub === npubOf(event.pubkey)` (the claimed npub is compared
  against the bech32 npub of the signing key, not the raw hex pubkey). A manifest with no
  `identity.nostr.npub` (an unbound manifest) therefore fails verification — bind it
  before signing. Pure/public.

Flow: `build → bindEntity → signManifest` (in the enclave) → publish the event → anyone
`verifyManifest`s it. Verification needs no host — only the event and the signature.

## The key boundary
Signing touches a private key, so `signManifest` runs **enclave/client-side only** and
outputs only public, signed material. Everything else (`build`, `validate`, `bind`,
`verify`) is pure data and safe on a server. The `nsec` never persists, logs, transmits,
or appears in any return value or error.

## Correctness gates (in the test suite)
- **Builder parity** — `buildBusinessManifest` output is byte-identical to the prior
  implementation over a fixture set (consumers cannot drift).
- **Sign → verify round-trip** — returns `valid: true`, the original manifest, and the
  signer's `npub`.
- **Tamper detection** — any mutation of a signed event's content or signature →
  `valid: false`.
- **Binding integrity** — an event whose `identity.nostr.npub` ≠ `event.pubkey` is
  rejected.
- **No-leak** — no `nsec` or private byte in any return value, error, or log.
- **Schnorr correctness** — signatures verify against a known NIP-01 / BIP-340 vector.

## Conventions
Unscoped package `nostr-business-manifest` · TypeScript dual ESM/CJS + browser build · vitest ·
eslint / prettier · typedoc. Runtime deps: `@noble/hashes`, `@noble/curves`, `@scure/base`
(schnorr + bech32). `nostr-zpub-utilities` is an optional peer used only by `bindEntity`.

## Non-goals
Not a relay client (it produces and verifies events; publishing them is the caller's job),
not a key manager (the seed lives in the enclave), not a re-implementation of the schema.
