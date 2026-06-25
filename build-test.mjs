import esbuild from 'esbuild';
await esbuild.build({
  entryPoints: ['src/analyzer.ts'],
  bundle: true,
  outfile: 'dist/analyzer-test.cjs',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: false,
  minify: false,
  logLevel: 'silent',
});
