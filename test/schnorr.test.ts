/**
 * Schnorr correctness gate — a signature verifies (and a tampered one fails) under a
 * known BIP340 / NIP-01 test vector, independent of any signing randomness.
 */
import { describe, it, expect } from 'vitest';
import { schnorr, hexToBytes, npubOf, pubkeyOfNpub } from '../src/nostr.js';
// @ts-expect-error — plain JS fixtures.
import { BIP340_VECTOR, SIGNER } from './vectors.mjs';

describe('schnorr (BIP340) known-vector correctness', () => {
  it('verifies the official BIP340 vector #3', () => {
    const ok = schnorr.verify(
      hexToBytes(BIP340_VECTOR.signature),
      hexToBytes(BIP340_VECTOR.message),
      hexToBytes(BIP340_VECTOR.pubkey),
    );
    expect(ok).toBe(true);
  });

  it('rejects the vector with one signature byte flipped', () => {
    const bad = BIP340_VECTOR.signature.slice(0, -2) + '00';
    const ok = schnorr.verify(
      hexToBytes(bad),
      hexToBytes(BIP340_VECTOR.message),
      hexToBytes(BIP340_VECTOR.pubkey),
    );
    expect(ok).toBe(false);
  });

  it('rejects the vector under a different message', () => {
    const otherMsg = '0000000000000000000000000000000000000000000000000000000000000000';
    const ok = schnorr.verify(
      hexToBytes(BIP340_VECTOR.signature),
      hexToBytes(otherMsg),
      hexToBytes(BIP340_VECTOR.pubkey),
    );
    expect(ok).toBe(false);
  });

  it('npub encode/decode round-trips the vector pubkey', () => {
    const npub = npubOf(BIP340_VECTOR.pubkey);
    expect(npub).toBe(SIGNER.npub);
    expect(pubkeyOfNpub(npub)).toBe(BIP340_VECTOR.pubkey);
  });
});
