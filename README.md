# nostr-business-manifest

An open, host-agnostic library for **any Nostr platform where an `npub` represents a
business entity** — build its manifest, bind identity and receiving keys, sign it, and
verify it anywhere. Not tied to any one product: the library defines *what* the manifest
is and keeps every decision about *how* (which domain, which registry) in the caller's
hands, so each adopting platform supplies its own host.

Part of the `nostr-*` utilities set: `nostr-agentic-identity` (identity),
`nostr-zpub-utilities` (BTC/LTC receiving keys), and this — the business manifest.

> **`bpub` is the format name, not a bech32 prefix.** The manifest is versioned
> `bpub-business/0.1`; it is not an encoding like `npub`/`nsec`. The npm package and repo are
> named `nostr-business-manifest` for exactly that reason — only the *format* keeps the `bpub-` name.

> The file an agent reads instead of emailing a business: its identity and its
> verb-typed, transactable **channels** (`book / pay / support / ask`), typically served
> at `/.well-known/info.json` — and, optionally, signed by the business's own key so any
> party can verify it without trusting the host that serves it.

## Two layers

**1 — the manifest (data, safe anywhere).** `buildBusinessManifest` / `validateBusinessManifest`
/ `linksToChannels` produce and validate the `bpub-business/0.1` manifest.

**2 — the signature (verifiable, enclave-side to sign).** `bindEntity` attaches an `npub`
and, optionally, a pre-derived receiving **address** for the pay channel; `signManifest`
schnorr-signs the manifest as a Nostr event; `verifyManifest` checks the signature and
that the manifest claims the same identity that signed it.

## Install

```sh
npm i nostr-business-manifest
```

## Use

```js
import { buildBusinessManifest, validateBusinessManifest } from 'nostr-business-manifest';

const manifest = buildBusinessManifest({
  slug: 'joes', name: "Joe's Plumbing", category: 'plumber', geo: 'toronto',
  languages: ['en', 'fr'],
  hostBase: 'example.com', // YOUR platform's host — the page becomes https://joes.example.com
  links: [
    { kind: 'website', url: 'https://joes.example.com' },
    { kind: 'booking', url: 'https://book.example.com/joes' },
    { kind: 'other',   url: 'mailto:hi@joes.example.com' }, // → channels.support
  ],
});

const { valid, errors } = validateBusinessManifest(manifest);
```

The library never fabricates a domain. Supply your own host with `hostBase` (a bare host
like `"acme.example"`) and a `page` is derived from the `slug` as `https://${slug}.${hostBase}`;
`resilience.registry` defaults to `https://${hostBase}`. Pass an explicit `page` and/or
`registry` to set them directly. With none of these, `page` is `null` and `registry` is
omitted — no host is invented.

Sign it (enclave/client-side — the `nsec` is used and discarded):

```js
import { bindEntity, signManifest, verifyManifest } from 'nostr-business-manifest';

// Pass a pre-derived receiving ADDRESS (recommended). Never a raw zpub — bindEntity
// refuses to embed one, since a zpub exposes the whole receive-address chain.
const bound = bindEntity(manifest, { npub, payAddress, payAsset: 'BTC' });
const event = signManifest(bound, nsec);                 // schnorr-signed Nostr event
// ...publish `event` to relays...

const { valid, npub: signer, manifest: m } = verifyManifest(event); // anyone, no host
```

To turn a `zpub` into a single address first (needs the optional `nostr-zpub-utilities`
peer), use `deriveZpubAddress`:

```js
import { deriveZpubAddress, bindEntity } from 'nostr-business-manifest';
const payAddress = await deriveZpubAddress(zpubBTC, 'BTC'); // throws if the peer is absent
const bound = bindEntity(manifest, { npub, payAddress, payAsset: 'BTC' });
```

## API

- `buildBusinessManifest(input)` → a `bpub-business/0.1` manifest. Accepts identity fields
  plus either `links:[{kind,url}]` (auto-mapped to channels) or explicit `channels:{}`.
  Host is caller-supplied via `hostBase` (or an explicit `page`/`registry`); no domain is
  ever hardcoded.
- `linksToChannels(links, { pageUrl })` → the verb-typed channels map.
- `validateBusinessManifest(m)` → `{ valid, errors }` (structural).
- `bindEntity(manifest, { npub, payAddress?, payAsset?, payVia? })` → manifest with
  identity set and, if a pre-derived `payAddress` is given, a pay channel. A raw
  extended key (`zpub`/`xpub`) is refused, never embedded.
- `deriveZpubAddress(zpub, asset?)` → a single receiving address for use as `payAddress`
  (needs the optional `nostr-zpub-utilities` peer; throws if it is absent).
- `signManifest(manifest, nsec)` → a schnorr-signed Nostr event. **Enclave/client-only.**
- `verifyManifest(event)` → `{ valid, npub, manifest }`.
- JSON Schema for external validators: `schema/bpub-business-0.1.json`.

## The shape (abridged)

```jsonc
{
  "schema": "bpub-business/0.1", "llm_friendly": true,
  "identity": { "name", "category", "geo", "page", "nostr": { "npub", "nip05" } },
  "channels": {
    "book":    { "via": "voice|web|mcp", "endpoint": "…" },
    "pay":     { "via": "web|onchain",   "endpoint": "…" },
    "support": { "via": "email",         "endpoint": "…" },
    "ask":     { "via": "web|mcp",       "endpoint": "…" }
  }
}
```

## The key boundary

`signManifest` is the only function that touches a private key. It runs enclave/client-side
only and outputs only public, signed material — the `nsec` is never stored, logged,
transmitted, or returned. Everything else is pure data and safe on a server.

## License

Two parts, licensed separately (see [`LICENSE`](./LICENSE)):

- **The schema / format** (`schema/bpub-business-0.1.json` and the manifest structure it
  defines) — **CC BY 4.0**. Use, share, and adapt freely with attribution.
- **The software / generation methods** — fair-code: free for organizations with less
  than **USD $1M** annual gross revenue; organizations at or above $1M may use it provided
  they credit **Humanjava Enterprises Inc.** and reference this repository
  (`nostr-business-manifest`) as the source of the methods.
