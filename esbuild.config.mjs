import esbuild from 'esbuild';

const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  target: 'node18',
};

async function build() {
  try {
    await esbuild.build(config);
    console.log('✅ Extension build complete.');
  } catch (e) {
    console.error('❌ Extension build failed:', e);
    process.exit(1);
  }
}

build(); 