/**
 * A zero-dependency structural check for `bpub-business/0.1`.
 *
 * Not a full JSON-Schema engine (the JSON Schema lives in
 * `schema/bpub-business-0.1.json` for external validators); this is the fast,
 * bundle-friendly runtime guard emitters run before serving, so a malformed
 * manifest never ships. Behavior is a byte-for-byte port of the original.
 *
 * @packageDocumentation
 */

import { BPUB_BUSINESS, VERSION, CHANNEL_VIA } from './schema.js';
import type { ValidationResult } from './types.js';

/**
 * Structurally validate a manifest.
 *
 * @param m - the manifest to check
 * @returns `{ valid, errors }` — `errors` is empty when valid
 */
export function validateBusinessManifest(m: unknown): ValidationResult {
  const errors: string[] = [];
  if (!m || typeof m !== 'object') return { valid: false, errors: ['manifest is not an object'] };
  const man = m as Record<string, any>;

  if (man.schema !== BPUB_BUSINESS) errors.push(`schema must be "${BPUB_BUSINESS}"`);
  if (man.llm_friendly !== true) errors.push('llm_friendly must be true');

  if (!man.meta || typeof man.meta !== 'object') errors.push('meta is required');
  else if (man.meta.version !== VERSION) errors.push(`meta.version must be "${VERSION}"`);

  if (!man.identity || typeof man.identity !== 'object') errors.push('identity is required');
  else if (!man.identity.name) errors.push('identity.name is required');

  if (!man.channels || typeof man.channels !== 'object') {
    errors.push('channels is required');
  } else {
    for (const [k, v] of Object.entries(man.channels)) {
      if (v == null) continue; // a null core channel is allowed (absent)
      if (typeof v !== 'object') {
        errors.push(`channels.${k} must be an object or null`);
        continue;
      }
      const ch = v as Record<string, any>;
      if (!CHANNEL_VIA.includes(ch.via))
        errors.push(`channels.${k}.via must be one of ${CHANNEL_VIA.join('|')}`);
      if (!ch.endpoint) errors.push(`channels.${k}.endpoint is required`);
    }
  }

  if (!man.resilience || !man.resilience.canonical)
    errors.push('resilience.canonical is required');

  return { valid: errors.length === 0, errors };
}
