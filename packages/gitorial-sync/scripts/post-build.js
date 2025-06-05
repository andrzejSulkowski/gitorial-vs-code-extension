const fs = require('fs');
const path = require('path');

function createDistPackageJson() {
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
    exports: {
      ".": {
        "types": "./index.d.ts",
        "require": "./index.js",
        "import": "./index.esm.js"
      },
      "./package.json": "./package.json"
    },
    keywords: packageJson.keywords,
    author: packageJson.author,
    license: packageJson.license,
    repository: packageJson.repository,
    bugs: packageJson.bugs,
    homepage: packageJson.homepage,
    engines: packageJson.engines,
    publishConfig: packageJson.publishConfig,
    dependencies: filteredDependencies,
    // Add files field to ensure only necessary files are published
    files: [
      "index.js",
      "index.esm.js", 
      "index.d.ts",
      "*.map",
      "README.md",
      "LICENSE"
    ]
  };
  
  const distDir = path.join(__dirname, '../dist');
  
  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify(distPackageJson, null, 2)
  );
  
  console.log('✅ Created dist/package.json');
  
  // Copy README and LICENSE to dist for npm publishing
  try {
    const readmePath = path.join(__dirname, '../README.md');
    const licensePath = path.join(__dirname, '../LICENSE');
    
    if (fs.existsSync(readmePath)) {
      fs.copyFileSync(readmePath, path.join(distDir, 'README.md'));
      console.log('✅ Copied README.md to dist/');
    }
    
    if (fs.existsSync(licensePath)) {
      fs.copyFileSync(licensePath, path.join(distDir, 'LICENSE'));
      console.log('✅ Copied LICENSE to dist/');
    }
  } catch (error) {
    console.warn('⚠️  Could not copy README.md or LICENSE:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  createDistPackageJson();
}

module.exports = { createDistPackageJson }; 