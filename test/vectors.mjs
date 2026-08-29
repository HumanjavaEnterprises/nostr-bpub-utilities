/**
 * Shared test fixtures — the single source of truth for both the vitest suites and
 * the built-artifact smoke test, so the two can never drift.
 *
 * The signer keypair below is a well-known throwaway (secp256k1 secret `0xB7E1…`,
 * the BIP340 test-vector #3 secret key) used ONLY for tests. It is public knowledge
 * and guards nothing.
 */

/** Throwaway signer keypair (BIP340 vector #3 secret). */
export const SIGNER = {
  skHex: 'b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef',
  pubkey: 'dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659',
  npub: 'npub1mlcawle2vuw97dscxundkg6phev0atsa5t0vakzrys8hk5pt5evssm7a0a',
  nsec: 'nsec1kls4zc52a54x40m3tzqfea8nca3ww9s08z6d5448snvsg5vselhsjv8uxn',
};

/** A second, unrelated npub — for the binding-integrity (npub ≠ pubkey) test. */
export const OTHER_NPUB = 'npub1lycg5qvjtrp3qjf5f7zl382j9x6nrjz9sdhenvyxq8c3808qxmus6gq266';

/**
 * BIP340 official test vector #3 — a known (pubkey, message, signature) triple that
 * MUST verify, independent of any signing randomness.
 */
export const BIP340_VECTOR = {
  pubkey: 'dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659',
  message: '243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89',
  signature:
    '6896bd60eeae296db48a229ff71dfe071bde413e6d43f917dc8dcf8c78de3341' +
    '8906d11ac976abccb20b091292bff4ea897efcb639ea871cfa95f6de339e4b0a',
};
