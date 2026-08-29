// validateBusinessManifest — a zero-dependency structural check for bpub-business/0.1.
// Not a full JSON-Schema engine (the JSON Schema lives in schema/bpub-business-0.1.json
// for external validators); this is the fast, bundle-friendly runtime guard emitters
// run before serving, so a malformed manifest never ships.

import { BPUB_BUSINESS, VERSION, CHANNEL_VIA } from './schema.js';

export function validateBusinessManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return { valid: false, errors: ['manifest is not an object'] };

  if (m.schema !== BPUB_BUSINESS) errors.push(`schema must be "${BPUB_BUSINESS}"`);
  if (m.llm_friendly !== true) errors.push('llm_friendly must be true');

  if (!m.meta || typeof m.meta !== 'object') errors.push('meta is required');
  else if (m.meta.version !== VERSION) errors.push(`meta.version must be "${VERSION}"`);

  if (!m.identity || typeof m.identity !== 'object') errors.push('identity is required');
  else if (!m.identity.name) errors.push('identity.name is required');

  if (!m.channels || typeof m.channels !== 'object') {
    errors.push('channels is required');
  } else {
    for (const [k, v] of Object.entries(m.channels)) {
      if (v == null) continue; // a null core channel is allowed (absent)
      if (typeof v !== 'object') { errors.push(`channels.${k} must be an object or null`); continue; }
      if (!CHANNEL_VIA.includes(v.via)) errors.push(`channels.${k}.via must be one of ${CHANNEL_VIA.join('|')}`);
      if (!v.endpoint) errors.push(`channels.${k}.endpoint is required`);
    }
  }

  if (!m.resilience || !m.resilience.canonical) errors.push('resilience.canonical is required');

  return { valid: errors.length === 0, errors };
}
