// buildBusinessManifest — THE canonical builder for `bpub-business/0.1`.
// Every emitter maps its own record to this one normalized input and calls this —
// so the envelope, the channels shape, the meta block, and the defaults are
// identical everywhere. Adapters live in the consumers; the standard lives here.

import {
  BPUB_BUSINESS, VERSION, LICENSE, ATTRIBUTION_NOTICE, DEFAULT_REGISTRY,
} from './schema.js';

// Map a flat link list (Business-Bios / directory style) → verb-typed channels.
// kinds: website | social | booking | pay | menu | support | other(email).
export function linksToChannels(links = [], { pageUrl } = {}) {
  const ch = {};
  for (const l of links) {
    if (!l || !l.url) continue;
    switch (l.kind) {
      case 'booking': ch.book = { via: 'web', endpoint: l.url }; break;
      case 'pay': ch.pay = payChannel(l.url); break;
      case 'menu': ch.menu = { via: 'web', endpoint: l.url }; break;
      case 'website': ch.website = { via: 'web', endpoint: l.url }; break;
      case 'support':
        ch.support = { via: 'email', endpoint: asMailto(l.url) }; break;
      case 'other':
        if (/^mailto:|@/.test(l.url)) ch.support = { via: 'email', endpoint: asMailto(l.url) };
        break;
      default: break; // social → triangulation, handled below; unknown kinds ignored
    }
  }
  if (!ch.ask && pageUrl) ch.ask = { via: 'web', endpoint: pageUrl };
  return ch;
}

const asMailto = (u) => (u.startsWith('mailto:') ? u : `mailto:${u}`);

// A pay link addressed to an email is an Interac e-Transfer endpoint (Canadian-first:
// you send money TO an email address), not a web checkout. Interac endpoints stay bare
// — `payments@x.ca`, not `mailto:payments@x.ca` — so an agent can hand them straight to
// a banking flow. Anything else (a Stripe/Square/checkout URL) remains `via: 'web'`.
const isEmailish = (u) => /^mailto:/i.test(u) || (!/^[a-z][a-z0-9+.-]*:/i.test(u) && /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(u));
const payChannel = (url) => (isEmailish(url)
  ? { via: 'interac', endpoint: url.replace(/^mailto:/i, '') }
  : { via: 'web', endpoint: url });

/**
 * @param {object} input — the normalized record:
 *   identity: { slug?, biz_id?, name, tagline?, description?, category?, geo?, verified?, page?, npub?, nip05? }
 *   meta:     { lang?, languages?, updated?, generated_by? }
 *   look:     { logo?, colors?, icon? }   // icon = a DiceBear recipe object
 *   reach:    { links?:[{kind,url}], channels?:{...}, hours?, website?, social?, registry? }
 * @returns {object} a bpub-business/0.1 manifest.
 */
export function buildBusinessManifest(input = {}) {
  const {
    slug, biz_id = null, name = null, tagline = null, description = null,
    category = null, geo = null, verified = false,
    lang = 'en', languages = ['en'], updated = null, generated_by = 'info-json',
    logo = null, colors = null, icon = null,
    npub = null, nip05 = null,
    page, registry = DEFAULT_REGISTRY,
    links = [], channels: explicit = null,
    hours = null, social = null, website = null,
  } = input;

  const pageUrl = page || (slug ? `https://${slug}.bpub.app` : null);
  const ch = explicit || linksToChannels(links, { pageUrl });

  const websiteUrl = website || ch.website?.endpoint
    || (links.find((l) => l.kind === 'website') || {}).url || null;
  const socialUrl = social
    || (links.find((l) => l.kind === 'social') || {}).url || null;

  const channels = {
    book: ch.book || null,
    pay: ch.pay || null,
    support: ch.support || null,
    ask: ch.ask || (pageUrl ? { via: 'web', endpoint: pageUrl } : null),
    website: ch.website || (websiteUrl ? { via: 'web', endpoint: websiteUrl } : null),
  };
  // optional extras only when present
  for (const k of ['menu', 'order', 'quote']) if (ch[k]) channels[k] = ch[k];

  return {
    schema: BPUB_BUSINESS,
    llm_friendly: true,
    meta: {
      version: VERSION, lang, languages, updated,
      generated_by, forkable: true,
      license: LICENSE, attribution: ATTRIBUTION_NOTICE,
    },
    identity: {
      biz_id, name, tagline, description, category, geo,
      verified: !!verified, page: pageUrl,
      nostr: (npub || nip05) ? { npub: npub || null, nip05: nip05 || null } : null,
    },
    branding: (icon || logo || colors)
      ? { icon: icon || null, logo: logo || null, colors: colors || null }
      : null,
    channels,
    hours: hours || null,
    agents: { policy: 'read-and-transact', transact_via: 'channels' },
    resilience: {
      canonical: pageUrl,
      registry,
      triangulation: { page: pageUrl, website: websiteUrl, social: socialUrl },
    },
  };
}
