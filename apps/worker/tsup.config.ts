import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'scripts/bundle-site': 'src/scripts/bundle-site.ts',
    'scripts/generate-builtin-assets': 'src/scripts/generate-builtin-assets.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  splitting: true,
  // Workspace packages ship TypeScript source, so they are compiled into the bundle.
  // Remotion stays external: the bundler and renderer load their own files at runtime.
  noExternal: [/^@adforge\/core/],
});
