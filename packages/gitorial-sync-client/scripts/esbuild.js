const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Clean dist directory before build
function cleanDist() {
  const distDir = path.join(__dirname, '../dist');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log('✅ Cleaned dist directory');
  }
}

// Post-build function to copy package.json metadata
function postBuild() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  
  // Create a minimal package.json for the dist
  const distPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    main: 'index.js',
    module: 'index.esm.js',
    types: 'index.d.ts',
    exports: packageJson.exports,
    keywords: packageJson.keywords,
    author: packageJson.author,
    license: packageJson.license,
    repository: packageJson.repository,
    bugs: packageJson.bugs,
    homepage: packageJson.homepage,
    engines: packageJson.engines,
    publishConfig: packageJson.publishConfig,
    dependencies: packageJson.dependencies
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../dist/package.json'),
    JSON.stringify(distPackageJson, null, 2)
  );
  
  console.log('✅ Created dist/package.json');
}

async function main() {
  cleanDist();
  
  // Build configurations for different output formats
  const configs = [
    // CommonJS build (main)
    {
      entryPoints: ['src/index.ts'],
      bundle: true,
      format: 'cjs',
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: 'node',
      target: 'node16',
      outfile: 'dist/index.js',
      external: ['ws', '@gitorial/shared-types'],
      logLevel: 'info',
      metafile: true
    },
    // ESM build
    {
      entryPoints: ['src/index.ts'],
      bundle: true,
      format: 'esm',
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: 'node',
      target: 'node16',
      outfile: 'dist/index.esm.js',
      external: ['ws', '@gitorial/shared-types'],
      logLevel: 'info',
      metafile: production
    }
  ];

  // TypeScript declaration files
  console.log('🔨 Building TypeScript declarations...');
  const { exec } = require('child_process');
  
  await new Promise((resolve, reject) => {
    exec('tsc --emitDeclarationOnly --outDir dist', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ TypeScript declaration build failed:', error);
        reject(error);
      } else {
        console.log('✅ TypeScript declarations built');
        resolve();
      }
    });
  });

  // Build all configurations
  for (const config of configs) {
    console.log(`🔨 Building ${config.format} bundle...`);
    
    if (watch) {
      const ctx = await esbuild.context({
        ...config,
        plugins: [esbuildProblemMatcherPlugin]
      });
      console.log(`👀 Watching ${config.format} bundle...`);
      await ctx.watch();
    } else {
      const result = await esbuild.build(config);
      
      if (result.metafile) {
        // Show bundle analysis
        const analysis = await esbuild.analyzeMetafile(result.metafile);
        console.log(`📊 Bundle analysis for ${config.outfile}:\n${analysis}`);
      }
    }
  }

  if (!watch) {
    postBuild();
    console.log('🎉 Build completed successfully!');
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
      
      if (result.errors.length === 0) {
        postBuild();
      }
      
      console.log('[watch] build finished');
    });
  }
};

main().catch(e => {
  console.error('❌ Build failed:', e);
  process.exit(1);
}); 