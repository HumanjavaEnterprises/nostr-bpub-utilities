/**
 * The signing / binding layer.
 *
 * `bindEntity` and `verifyManifest` are pure and safe to run anywhere — they touch
 * only PUBLIC material. `signManifest` is the ONE function that touches a private
 * key: it accepts an `nsec`, uses it to schnorr-sign the event, and lets it go out
 * of scope. The `nsec` is never stored on the returned event, never logged, and
 * never placed in an error message (see SPEC "The boundary" and the no-leak test).
 *
 * @packageDocumentation
 */

import {
  schnorr,
  bytesToHex,
  hexToBytes,
  computeEventId,
  normalizePrivateKey,
  npubOf,
  pubkeyOfNpub,
  InvalidPublicKeyError,
} from './nostr.js';
import type {
  BusinessManifest,
  BindOptions,
  NostrEvent,
  SignOptions,
  VerifyResult,
} from './types.js';

export { npubOf, pubkeyOfNpub } from './nostr.js';
export {
  InvalidPrivateKeyError,
  InvalidPublicKeyError,
} from './nostr.js';

/**
 * The event kind for a signed business manifest — a parameterized-replaceable
 * event (NIP-01 range 30000–39999), so re-signing the same business (same `d`
 * tag) replaces the prior event on a relay. 30078 is the NIP-78 app-specific
 * "arbitrary custom app data" kind.
 */
export const MANIFEST_KIND = 30078;

/** Derive the business slug (the `d` tag) from a manifest's page/canonical URL. */
function slugOf(manifest: BusinessManifest): string {
  const url = manifest?.identity?.page || manifest?.resilience?.canonical || '';
  const sub = /^https?:\/\/([^./]+)\./i.exec(url);
  if (sub) return sub[1];
  const name = manifest?.identity?.name || 'business';
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'business';
}

/** Thrown when a manifest cannot be safely bound (e.g. a raw extended key was passed). */
export class BindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BindingError';
    Object.setPrototypeOf(this, BindingError.prototype);
  }
}

/** True when a string looks like an extended PUBLIC key (a zpub/xpub/…), not an address. */
function looksExtendedKey(s: string): boolean {
  return /^(zpub|xpub|ypub|vpub|tpub|upub|ltub|mtub)[0-9a-z]/i.test(s);
}

/**
 * Bind an entity's identity and receiving key into a manifest. Pure — no private key.
 *
 * Sets `identity.nostr.npub` to the given npub. For the pay channel, pass a
 * **pre-derived receiving `payAddress`** (recommended) — a single address is what a
 * public, relayed manifest should carry.
 *
 * ⛔ A raw extended public key (`zpub`/`xpub`) is NEVER embedded: it exposes the
 * business's entire receive-address chain. If `zpubBTC`/`zpubLTC` (or a `payAddress`
 * that is itself an extended key) is supplied, `bindEntity` THROWS a {@link BindingError}
 * and writes nothing — derive one address first with {@link deriveZpubAddress} (which
 * only works when the optional `nostr-zpub-utils` peer is installed) and pass it
 * as `{ payAddress }`. Returns a NEW manifest — the input is not mutated.
 *
 * @param manifest - the manifest to bind
 * @param opts - `{ npub, payAddress?, payAsset?, payVia? }`
 * @returns a new, bound manifest
 */
export function bindEntity(manifest: BusinessManifest, opts: BindOptions): BusinessManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new TypeError('bindEntity: manifest must be an object');
  }
  if (!opts || typeof opts.npub !== 'string' || !opts.npub.startsWith('npub1')) {
    throw new InvalidPublicKeyError('bindEntity: opts.npub must be a bech32 npub');
  }
  // Validate the npub decodes (throws on a malformed value).
  pubkeyOfNpub(opts.npub);

  // Hard invariant: a raw extended public key must NEVER reach a public manifest.
  if (opts.zpubBTC || opts.zpubLTC) {
    throw new BindingError(
      'bindEntity will not embed a raw extended public key (zpub/xpub) — it exposes the ' +
        'entire receive-address chain in a public, relayed manifest. Derive a single ' +
        'receiving address first (e.g. `await deriveZpubAddress(zpub, asset)`, which needs ' +
        'the optional nostr-zpub-utils peer) and pass it as { payAddress }. Nothing was written.',
    );
  }

  const next: BusinessManifest = structuredClone(manifest);

  const prevNip05 = next.identity?.nostr?.nip05 ?? null;
  next.identity.nostr = { npub: opts.npub, nip05: prevNip05 };

  if (opts.payAddress != null) {
    if (typeof opts.payAddress !== 'string' || opts.payAddress.length === 0) {
      throw new BindingError('bindEntity: payAddress must be a non-empty string');
    }
    if (looksExtendedKey(opts.payAddress)) {
      throw new BindingError(
        'bindEntity: payAddress looks like an extended public key (zpub/xpub). Pass a ' +
          'single derived receiving ADDRESS, not an extended key. Nothing was written.',
      );
    }
    // `payAsset` is REQUIRED with a payAddress. A silent default would let a BTC address
    // be labelled LTC (or vice versa) in a public, machine-read manifest — a paying agent
    // could then send funds on the wrong chain. Make the caller state the chain.
    if (opts.payAsset !== 'BTC' && opts.payAsset !== 'LTC') {
      throw new BindingError(
        "bindEntity: payAsset is required with payAddress — pass { payAsset: 'BTC' | 'LTC' }. " +
          'Nothing was written.',
      );
    }
    const prevPay = next.channels.pay ?? {};
    next.channels.pay = {
      ...prevPay,
      via: opts.payVia ?? 'onchain',
      endpoint: opts.payAddress,
      asset: opts.payAsset,
    };
  }

  return next;
}

/**
 * Derive a single receiving ADDRESS from an extended public key (`zpub`) — the safe
 * input for {@link bindEntity}'s `payAddress`.
 *
 * This is a convenience over the OPTIONAL `nostr-zpub-utils` peer, loaded via a
 * dynamic `import()` so it works in ESM and CJS and is absent-tolerant. If the peer
 * is not installed, it throws a clear {@link BindingError} — it NEVER returns the raw
 * `zpub`. Pure/public: no seed, no private key.
 *
 * @param zpub - an extended PUBLIC key
 * @param asset - `'BTC'` or `'LTC'` — REQUIRED; the chain is never guessed
 * @param opts - optional `{ index, change }` (defaults `0` / `0`)
 * @returns the first (or requested) receiving address
 */
export async function deriveZpubAddress(
  zpub: string,
  asset: 'BTC' | 'LTC',
  opts: { index?: number; change?: 0 | 1 } = {},
): Promise<string> {
  if (asset !== 'BTC' && asset !== 'LTC') {
    throw new BindingError("deriveZpubAddress: asset is required — pass 'BTC' or 'LTC'. The chain is never guessed.");
  }
  let peer: any;
  try {
    // Indirect specifier: resolved only at runtime (the peer is optional and may be
    // absent), so neither tsc nor the bundler tries to hard-link it at build time.
    const spec = 'nostr-zpub-utils';
    peer = await import(/* @vite-ignore */ /* webpackIgnore: true */ spec);
  } catch {
    throw new BindingError(
      'deriveZpubAddress requires the optional peer "nostr-zpub-utils". Install it ' +
        '(npm install nostr-zpub-utils), or pass an already-derived address to ' +
        'bindEntity({ payAddress }).',
    );
  }
  const fn = peer?.zpubToAddress ?? peer?.default?.zpubToAddress;
  if (typeof fn !== 'function') {
    throw new BindingError('nostr-zpub-utils did not export zpubToAddress');
  }
  return fn(zpub, { asset, index: opts.index ?? 0, change: opts.change ?? 0 });
}

/**
 * Sign a manifest as a NIP-01 Nostr event with schnorr (BIP340).
 *
 * ⛔ ENCLAVE / CLIENT ONLY. This is the only function that touches a private key.
 * The `nsec` (bech32 or 64-char hex) is decoded, used to derive the pubkey and
 * produce the signature, and then dropped — it is never stored on the returned
 * event, logged, or included in any error. The returned {@link NostrEvent} is
 * PUBLIC and publishable to relays.
 *
 * @param manifest - the manifest to sign (its JSON becomes the event content)
 * @param nsec - the signer's private key (`nsec…` bech32 or 32-byte hex)
 * @param opts - optional `created_at` / `dTag` overrides
 * @returns the signed, public Nostr event
 */
export function signManifest(
  manifest: BusinessManifest,
  nsec: string,
  opts: SignOptions = {},
): NostrEvent {
  if (!manifest || typeof manifest !== 'object') {
    throw new TypeError('signManifest: manifest must be an object');
  }

  // Decode the private key. `sk` is the ONLY private value in this function and is
  // never returned or logged. normalizePrivateKey throws WITHOUT echoing the input.
  const sk = normalizePrivateKey(nsec);
  try {
    const pubkey = bytesToHex(schnorr.getPublicKey(sk));
    const created_at = opts.created_at ?? Math.floor(Date.now() / 1000);
    const dTag = opts.dTag ?? slugOf(manifest);
    const tags: string[][] = [['d', dTag]];
    const content = JSON.stringify(manifest);

    const id = computeEventId({ pubkey, created_at, kind: MANIFEST_KIND, tags, content });
    const sig = bytesToHex(schnorr.sign(hexToBytes(id), sk));

    return { id, pubkey, created_at, kind: MANIFEST_KIND, tags, content, sig };
  } finally {
    // Zero the scalar bytes so no copy lingers in the buffer after the call.
    sk.fill(0);
  }
}

/**
 * Verify a signed manifest event. Pure — no private key.
 *
 * Recomputes the event id from the event fields, schnorr-verifies the signature
 * against `event.pubkey`, parses the manifest from `content`, and asserts the
 * manifest's `identity.nostr.npub` equals `npubOf(event.pubkey)` — i.e. the card
 * claims the same identity that signed it.
 *
 * @param event - the signed Nostr event
 * @returns `{ valid, npub, manifest, reason? }`
 */
export function verifyManifest(event: NostrEvent): VerifyResult {
  if (!event || typeof event !== 'object') {
    return { valid: false, npub: null, manifest: null, reason: 'event is not an object' };
  }

  // 1. Recompute the id and check it matches the claimed id (tamper on any field).
  let recomputedId: string;
  try {
    recomputedId = computeEventId(event);
  } catch {
    return { valid: false, npub: null, manifest: null, reason: 'event fields are malformed' };
  }
  if (recomputedId !== event.id) {
    return { valid: false, npub: null, manifest: null, reason: 'event id does not match content' };
  }

  // 2. Schnorr-verify the signature over the id against the event pubkey.
  let sigOk: boolean;
  try {
    sigOk = schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey));
  } catch {
    sigOk = false;
  }
  if (!sigOk) {
    return { valid: false, npub: null, manifest: null, reason: 'schnorr signature is invalid' };
  }

  // 3. Parse the manifest from content.
  let manifest: BusinessManifest;
  try {
    manifest = JSON.parse(event.content) as BusinessManifest;
  } catch {
    return { valid: false, npub: null, manifest: null, reason: 'content is not valid JSON' };
  }

  // 4. Binding integrity: the manifest must claim the npub that signed it.
  const signerNpub = npubOf(event.pubkey);
  const claimedNpub = manifest?.identity?.nostr?.npub ?? null;
  if (claimedNpub !== signerNpub) {
    return {
      valid: false,
      npub: signerNpub,
      manifest,
      reason: 'manifest npub does not match the signing pubkey',
    };
  }

  return { valid: true, npub: signerNpub, manifest };
}
