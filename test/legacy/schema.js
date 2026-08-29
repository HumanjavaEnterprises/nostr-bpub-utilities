// Shared constants for the bpub-business manifest.
// The schema/format is an open standard (CC BY 4.0). See LICENSE for the software terms.

export const BPUB_BUSINESS = 'bpub-business/0.1';
export const VERSION = '0.1';

export const LICENSE =
  'Schema: CC BY 4.0 (open). Methods: free under USD $1M annual revenue; ' +
  'at or above $1M, credit Humanjava Enterprises Inc. and the nostr-bpub-utilities repository.';
export const ATTRIBUTION_NOTICE =
  'The bpub-business schema is open (CC BY 4.0). The generation methods are provided by ' +
  'Humanjava Enterprises Inc.: free for organizations under USD $1M annual gross revenue; ' +
  'organizations at or above $1M attribute Humanjava Enterprises Inc. and the ' +
  'nostr-bpub-utilities repository. See LICENSE.';

// Verb-typed channels (the agentic transaction surface) + their transports.
// `interac` = Interac e-Transfer (endpoint is an email address or phone number) — a
// first-class Canadian payment transport, and the transport the spec's own flagship
// example uses for `channels.pay`. Keep this list in sync with the `via` enum in
// schema/bpub-business-0.1.json — they are two encodings of the same truth.
export const CHANNEL_VERBS = ['book', 'pay', 'support', 'ask', 'order', 'quote', 'website', 'menu'];
export const CHANNEL_VIA = ['web', 'email', 'sms', 'voice', 'mcp', 'api', 'interac'];

// The core channels every business manifest declares (null when absent) — vs the
// optional extras (menu/order/quote) that only appear when present.
export const CORE_CHANNELS = ['book', 'pay', 'support', 'ask', 'website'];

export const DEFAULT_REGISTRY = 'https://bpub.app';
