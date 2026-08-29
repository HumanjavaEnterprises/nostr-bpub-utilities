/**
 * Low-level Nostr primitives, built directly on the audited stack
 * (`@noble/curves` schnorr, `@noble/hashes` sha256, `@scure/base` bech32/hex) —
 * no `nostr-tools` dependency.
 *
 * This module provides: bech32 `npub` encode/decode, private-key ingestion
 * (`nsec`-bech32 or 64-char hex) for the signer, and the NIP-01 event-id
 * serialization. It is the only place a private key is decoded, and it never
 * returns, logs, or stores that key — the decoded bytes are handed straight to the
 * caller (`signManifest`), which uses them and lets them go out of scope.
 *
 * @packageDocumentation
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { bech32 } from '@scure/base';
import type { NostrEvent } from './types.js';

export { schnorr, sha256, bytesToHex, hexToBytes };

/**
 * Thrown when an input that is supposed to be a private key is not one.
 *
 * The message NEVER contains the offending key material — only a description of
 * the shape problem — so a bad `nsec` cannot leak through an error string or log.
 */
export class InvalidPrivateKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPrivateKeyError';
    Object.setPrototypeOf(this, InvalidPrivateKeyError.prototype);
  }
}

/** Thrown when a public key / npub is malformed. Public material — safe to echo. */
export class InvalidPublicKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPublicKeyError';
    Object.setPrototypeOf(this, InvalidPublicKeyError.prototype);
  }
}

const HEX32 = /^[0-9a-f]{64}$/i;
const BECH32_LIMIT = 1000;

/** secp256k1 group order (n). A valid private scalar d satisfies 0 < d < n. */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** Big-endian bytes → bigint. */
function bytesToBigIntBE(b: Uint8Array): bigint {
  let x = 0n;
  for (let i = 0; i < b.length; i++) x = (x << 8n) | BigInt(b[i]);
  return x;
}

/**
 * Decode a 64-char hex string to 32 bytes WITHOUT allocating a lowercased copy of
 * the string (JS strings are immutable and cannot be wiped) — the private scalar
 * never lands in a second, un-zeroable string.
 */
function hexToScalarBytes(hexStr: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Assert 0 < d < n for a candidate scalar; zero the buffer and throw if not. */
function assertScalarInRange(bytes: Uint8Array): void {
  const d = bytesToBigIntBE(bytes);
  if (d <= 0n || d >= SECP256K1_N) {
    bytes.fill(0);
    throw new InvalidPrivateKeyError('private key is out of range (must satisfy 0 < d < n)');
  }
}

/**
 * Encode a 32-byte x-only public key (hex) as a bech32 `npub`.
 *
 * @param hexPubkey - 64-char hex x-only public key
 * @returns the `npub…` bech32 string
 */
export function npubOf(hexPubkey: string): string {
  if (typeof hexPubkey !== 'string' || !HEX32.test(hexPubkey)) {
    throw new InvalidPublicKeyError('pubkey must be a 32-byte (64 hex char) x-only key');
  }
  const words = bech32.toWords(hexToBytes(hexPubkey.toLowerCase()));
  return bech32.encode('npub', words, BECH32_LIMIT);
}

/**
 * Decode a bech32 `npub` to its 32-byte x-only public key (hex).
 *
 * @param npub - an `npub…` bech32 string
 * @returns 64-char hex x-only public key
 */
export function pubkeyOfNpub(npub: string): string {
  if (typeof npub !== 'string' || !npub.startsWith('npub1')) {
    throw new InvalidPublicKeyError('not an npub (expected an npub1… bech32 string)');
  }
  const { prefix, words } = bech32.decode(npub as `npub1${string}`, BECH32_LIMIT);
  if (prefix !== 'npub') throw new InvalidPublicKeyError('bech32 prefix is not "npub"');
  const bytes = bech32.fromWords(words);
  if (bytes.length !== 32) throw new InvalidPublicKeyError('npub does not decode to 32 bytes');
  return bytesToHex(Uint8Array.from(bytes));
}

/**
 * Normalize a private key input to 32 raw bytes.
 *
 * Accepts a 64-char hex string or a bech32 `nsec…`. Rejects anything else —
 * a `zpub`/`npub`, a wrong-length value, a mnemonic — with an error that never
 * contains the input. The returned bytes are the caller's to use and drop; this
 * function keeps no reference to them.
 *
 * @param nsec - the private key, hex or `nsec…` bech32
 * @returns the 32-byte private key
 * @throws {@link InvalidPrivateKeyError} on any non-private-key input
 */
export function normalizePrivateKey(nsec: string): Uint8Array {
  if (typeof nsec !== 'string' || nsec.length === 0) {
    throw new InvalidPrivateKeyError('private key must be a non-empty string');
  }
  const s = nsec.trim();

  if (s.startsWith('nsec1')) {
    let words: number[];
    try {
      const decoded = bech32.decode(s as `nsec1${string}`, BECH32_LIMIT);
      if (decoded.prefix !== 'nsec') {
        throw new InvalidPrivateKeyError('bech32 prefix is not "nsec"');
      }
      words = decoded.words;
    } catch (e) {
      if (e instanceof InvalidPrivateKeyError) throw e;
      // Never surface the decode error verbatim — it can echo the input.
      throw new InvalidPrivateKeyError('malformed nsec (bech32 decode failed)');
    }
    let raw: Uint8Array;
    try {
      raw = bech32.fromWords(words);
    } catch {
      words.fill(0);
      throw new InvalidPrivateKeyError('malformed nsec (5-bit unpack failed)');
    }
    try {
      if (raw.length !== 32) {
        throw new InvalidPrivateKeyError('nsec does not decode to 32 bytes');
      }
      assertScalarInRange(raw); // wraps range failure as InvalidPrivateKeyError
      return Uint8Array.from(raw); // the caller's copy to use and drop
    } finally {
      // Wipe EVERY intermediate that held the private scalar: the unpacked bytes
      // and the 5-bit word array (the returned copy above is separate).
      raw.fill(0);
      words.fill(0);
    }
  }

  if (HEX32.test(s)) {
    const out = hexToScalarBytes(s);
    try {
      assertScalarInRange(out); // zeros `out` itself on failure, then throws
      return out;
    } catch (e) {
      // Guard against any non-range error leaving a populated buffer behind.
      out.fill(0);
      throw e;
    }
  }

  // Reject everything else WITHOUT echoing it (could be a real key on the wrong path).
  if (s.startsWith('npub1') || s.startsWith('nprofile') || /^(xpub|zpub|ypub|ltub)/i.test(s)) {
    throw new InvalidPrivateKeyError('input is a PUBLIC key, not a private key');
  }
  throw new InvalidPrivateKeyError(
    'private key must be an nsec (bech32) or a 32-byte hex string',
  );
}

/**
 * Serialize an event for id computation, per NIP-01:
 * `sha256(JSON([0, pubkey, created_at, kind, tags, content]))`.
 *
 * @returns the 32-byte event id as hex
 */
export function computeEventId(
  ev: Pick<NostrEvent, 'pubkey' | 'created_at' | 'kind' | 'tags' | 'content'>,
): string {
  const serialized = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}
