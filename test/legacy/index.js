// The original JavaScript builder/validator, preserved verbatim as the parity
// oracle for the TypeScript port. Kept only under test/ — never shipped, never
// imported by the library. Do not edit: it exists so the port can be pinned to it.

export { buildBusinessManifest, linksToChannels } from './build.js';
export { validateBusinessManifest } from './validate.js';
export {
  BPUB_BUSINESS, VERSION, LICENSE, ATTRIBUTION_NOTICE,
  CHANNEL_VERBS, CHANNEL_VIA, CORE_CHANNELS, DEFAULT_REGISTRY,
} from './schema.js';
