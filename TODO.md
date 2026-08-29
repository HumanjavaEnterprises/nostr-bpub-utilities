# TODO — nostr-business-manifest

## Before first npm publish

- [ ] Confirm the npm package name `nostr-business-manifest` is available / reserved.
- [ ] Verify the `HumanjavaEnterprises/nostr-business-manifest` GitHub repo, CI badge slug (`ci.yml`), and
      security-advisory link are correct.
- [ ] Publish `nostr-zpub-utilities` (the optional peer) so `bindEntity`'s zpub → address derivation resolves
      when installed; until then `bindEntity` carries the zpub through unchanged.
- [ ] Decide whether to commit generated `docs/` or leave to CI.

## Later

- [ ] Consider exporting a NIP-19 `nprofile`/`naddr` helper if a consumer needs the addressable coordinate
      (`kind:pubkey:d-tag`) for the replaceable event.
- [ ] Evaluate an optional `relays` hint on the signed event's tags for discovery.
- [ ] Add a documented, dedicated business-manifest kind if one is registered, alongside the current `30078`.
