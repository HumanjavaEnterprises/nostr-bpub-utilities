/**
 * The canonical builder for `bpub-business/0.1`.
 *
 * Every emitter maps its own record to one normalized input and calls this, so the
 * envelope, the channels shape, the meta block, and the defaults are identical
 * everywhere. This is a TypeScript port of the original JavaScript builder and its
 * output is byte-identical to it (pinned by the parity test) — the property set and
 * insertion order are preserved exactly.
 *
 * @packageDocumentation
 */

import { BPUB_BUSINESS, VERSION, LICENSE, ATTRIBUTION_NOTICE } from './schema.js';
import type { BuildInput, BusinessManifest, Channel, Channels, Link, Resilience } from './types.js';

/**
 * Map a flat link list (directory / links style) to verb-typed channels.
 *
 * kinds: `website` | `social` | `booking` | `pay` | `menu` | `support` | `other`(email).
 *
 * @param links - the flat `{ kind, url }` list
 * @param opts - `pageUrl` used to backfill an `ask` channel when none is present
 */
export function linksToChannels(
  links: Link[] = [],
  { pageUrl }: { pageUrl?: string | null } = {},
): Record<string, Channel> {
  const ch: Record<string, Channel> = {};
  for (const l of links) {
    if (!l || !l.url) continue;
    switch (l.kind) {
      case 'booking':
        ch.book = { via: 'web', endpoint: l.url };
        break;
      case 'pay':
        ch.pay = payChannel(l.url);
        break;
      case 'menu':
        ch.menu = { via: 'web', endpoint: l.url };
        break;
      case 'website':
        ch.website = { via: 'web', endpoint: l.url };
        break;
      case 'support':
        ch.support = { via: 'email', endpoint: asMailto(l.url) };
        break;
      case 'other':
        if (/^mailto:|@/.test(l.url)) ch.support = { via: 'email', endpoint: asMailto(l.url) };
        break;
      default:
        break; // social → triangulation, handled below; unknown kinds ignored
    }
  }
  if (!ch.ask && pageUrl) ch.ask = { via: 'web', endpoint: pageUrl };
  return ch;
}

const asMailto = (u: string): string => (u.startsWith('mailto:') ? u : `mailto:${u}`);

// A pay link addressed to an email is an Interac e-Transfer endpoint (you send money
// TO an email address), not a web checkout. Interac endpoints stay bare —
// `payments@x.ca`, not `mailto:payments@x.ca` — so a caller can hand them straight to
// a banking flow. Anything else (a Stripe/Square/checkout URL) remains `via: 'web'`.
const isEmailish = (u: string): boolean =>
  /^mailto:/i.test(u) ||
  (!/^[a-z][a-z0-9+.-]*:/i.test(u) && /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(u));
const payChannel = (url: string): Channel =>
  isEmailish(url)
    ? { via: 'interac', endpoint: url.replace(/^mailto:/i, '') }
    : { via: 'web', endpoint: url };

/**
 * Build a `bpub-business/0.1` manifest from a normalized record.
 *
 * @param input - the normalized record (identity, meta, look, and reach fields)
 * @returns a `bpub-business/0.1` manifest
 */
export function buildBusinessManifest(input: BuildInput = {}): BusinessManifest {
  const {
    slug,
    biz_id = null,
    name = null,
    tagline = null,
    description = null,
    category = null,
    geo = null,
    verified = false,
    lang = 'en',
    languages = ['en'],
    updated = null,
    generated_by = 'nostr-bpub-utilities',
    logo = null,
    colors = null,
    icon = null,
    npub = null,
    nip05 = null,
    page,
    hostBase,
    registry,
    links = [],
    channels: explicit = null,
    hours = null,
    social = null,
    website = null,
  } = input;

  // The library is host-agnostic: it never fabricates a domain. A page is derived
  // from a slug ONLY when the caller supplies its own `hostBase` (a bare host like
  // "acme.example"). With neither an explicit `page` nor a `hostBase`, `page` is null.
  const pageUrl = page || (slug && hostBase ? `https://${slug}.${hostBase}` : null);

  // Registry: use the explicit value; else default to the caller's own host when a
  // `hostBase` is given; else omit it entirely (never emit a hardcoded product domain).
  let registryValue: string | undefined = registry;
  if (registryValue === undefined && hostBase) registryValue = `https://${hostBase}`;
  const ch: Record<string, Channel | null> = explicit || linksToChannels(links, { pageUrl });

  const websiteUrl =
    website ||
    ch.website?.endpoint ||
    (links.find((l) => l.kind === 'website') || ({} as Link)).url ||
    null;
  const socialUrl = social || (links.find((l) => l.kind === 'social') || ({} as Link)).url || null;

  const channels: Channels = {
    book: ch.book || null,
    pay: ch.pay || null,
    support: ch.support || null,
    ask: ch.ask || (pageUrl ? { via: 'web', endpoint: pageUrl } : null),
    website: ch.website || (websiteUrl ? { via: 'web', endpoint: websiteUrl } : null),
  };
  // optional extras only when present
  for (const k of ['menu', 'order', 'quote']) if (ch[k]) channels[k] = ch[k];

  // Build resilience with the canonical → registry → triangulation key order, and
  // include `registry` only when it is defined (omitted entirely otherwise).
  const resilience: Resilience = { canonical: pageUrl } as Resilience;
  if (registryValue !== undefined) resilience.registry = registryValue;
  resilience.triangulation = { page: pageUrl, website: websiteUrl, social: socialUrl };

  return {
    schema: BPUB_BUSINESS,
    llm_friendly: true,
    meta: {
      version: VERSION,
      lang,
      languages,
      updated,
      generated_by,
      forkable: true,
      license: LICENSE,
      attribution: ATTRIBUTION_NOTICE,
    },
    identity: {
      biz_id,
      name,
      tagline,
      description,
      category,
      geo,
      verified: !!verified,
      page: pageUrl,
      nostr: npub || nip05 ? { npub: npub || null, nip05: nip05 || null } : null,
    },
    branding:
      icon || logo || colors
        ? { icon: icon || null, logo: logo || null, colors: colors || null }
        : null,
    channels,
    hours: hours || null,
    agents: { policy: 'read-and-transact', transact_via: 'channels' },
    resilience,
  };
}
