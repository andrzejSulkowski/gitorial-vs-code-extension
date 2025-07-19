const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Post-build cleanup function (from post-build.js)
function postBuildCleanup() {
  // Paths
  const outDir = path.join(__dirname, '../out');
  const sharedDir = path.join(outDir, 'shared');

  // Remove shared directory from output
  if (fs.existsSync(sharedDir)) {
    fs.rmSync(sharedDir, { recursive: true, force: true });
    console.log('✅ Cleaned up shared directory from output');
  }

  // Move all files from src to root of out
  const srcDir = path.join(outDir, 'src');
  if (fs.existsSync(srcDir)) {
    function moveDirContents(src, dest) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }

      const items = fs.readdirSync(src);

      items.forEach(item => {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);

        const stats = fs.statSync(srcPath);

        if (stats.isDirectory()) {
          moveDirContents(srcPath, destPath);
          fs.rmdirSync(srcPath);
        } else {
          fs.renameSync(srcPath, destPath);
        }
      });
    }

    moveDirContents(srcDir, outDir);

    fs.rmdirSync(srcDir);
    console.log('✅ Moved files from src to output root');
  }
}

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts', 'src/test/extension.test.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    target: 'node18',
    outdir: 'out',
    external: ['vscode'],
    logLevel: 'warning',
    plugins: [esbuildProblemMatcherPlugin, postBuildPlugin],
  });

  if (watch) {
    console.log('👀 Watching for changes...');
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

/**
 * @type {import('esbuild').Plugin}
 */
const postBuildPlugin = {
  name: 'post-build-cleanup',

  setup(build) {
    build.onEnd(result => {
      if (result.errors.length === 0) {
        // Only run post-build cleanup if build was successful
        postBuildCleanup();
      }
    });
  },
};

main().catch(e => {
  console.error('❌ Build failed:', e);
  process.exit(1);
});
