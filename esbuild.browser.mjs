import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  // Do NOT inline the full TS source into the sourcemap — it dominated the tarball.
  sourcesContent: false,
  format: 'iife',
  globalName: 'NostrBpubUtilities',
  outfile: 'dist/browser/nostr-business-manifest.min.js',
  target: ['es2020'],
  platform: 'browser',
  // The optional peer is resolved at runtime via dynamic import(); never bundled.
  external: ['nostr-zpub-utilities'],
  define: {
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis',
  },
  metafile: true,
});

const output = Object.entries(result.metafile.outputs)
  .filter(([k]) => k.endsWith('.js'))
  .map(([k, v]) => `${k}: ${(v.bytes / 1024).toFixed(1)}KB`);
console.log('Browser bundle built:', output.join(', '));
