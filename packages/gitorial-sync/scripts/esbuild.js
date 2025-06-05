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
  
  // Filter out workspace dependencies (they should be bundled, not external)
  const filteredDependencies = {};
  if (packageJson.dependencies) {
    for (const [name, version] of Object.entries(packageJson.dependencies)) {
      if (!version.startsWith('workspace:')) {
        filteredDependencies[name] = version;
      }
    }
  }
  
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
    dependencies: filteredDependencies
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../dist/package.json'),
    JSON.stringify(distPackageJson, null, 2)
  );
  
  console.log('✅ Created dist/package.json');
}

async function main() {
  cleanDist();
  
  // Build configurations for the universal RelayClient
  const configs = [
    // CommonJS build - for VS Code extensions and older Node.js applications
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
      external: ['ws'],
      logLevel: 'info',
      metafile: true
    },
    // ESM build - for modern applications (both Node.js and bundlers)
    {
      entryPoints: ['src/index.ts'],
      bundle: true,
      format: 'esm',
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: 'node',
      target: 'es2020',
      outfile: 'dist/index.esm.js',
      external: ['ws', 'http', 'url'],
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
    const buildType = config.format === 'cjs' ? 'CommonJS' : 'ESM';
    console.log(`🔨 Building Universal RelayClient (${buildType}) bundle...`);
    
    if (watch) {
      const ctx = await esbuild.context({
        ...config,
        plugins: [esbuildProblemMatcherPlugin]
      });
      console.log(`👀 Watching Universal RelayClient (${buildType}) bundle...`);
      await ctx.watch();
    } else {
      const result = await esbuild.build(config);
      
      if (result.metafile) {
        // Show bundle analysis
        const analysis = await esbuild.analyzeMetafile(result.metafile);
        console.log(`📊 Universal RelayClient (${buildType}) Bundle Analysis:\n${analysis}`);
      }
    }
  }

  if (!watch) {
    postBuild();
    console.log('🎉 Universal Website-Extension Sync Package Built Successfully!');
    console.log('📦 Ready for:');
    console.log('   • VS Code Extensions: dist/index.js (CommonJS)');
    console.log('   • Modern Applications: dist/index.esm.js (ESM)');
    console.log('   • Both work in Node.js and Browser environments!');
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