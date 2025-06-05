const resolve = require('@rollup/plugin-node-resolve').default;
const commonjs = require('@rollup/plugin-commonjs').default;
const typescript = require('@rollup/plugin-typescript').default;
const alias = require('@rollup/plugin-alias').default;
const dts = require('rollup-plugin-dts').default;
const del = require('rollup-plugin-delete').default;
const path = require('path');

const packageJson = require('./package.json');

// Check if this is production build
const isProduction = process.env.NODE_ENV === 'production';

// External dependencies (don't bundle these)
const external = [
  'ws',
  'http', 
  'https',
  'url',
  'events',
  'util',
  'crypto',
  // Node.js built-ins
  ...Object.keys(packageJson.dependencies || {}),
];

// Common plugins for both builds
const commonPlugins = [
  // Clean dist directory before build
  del({ targets: 'dist/*', runOnce: true }),
  
  // Alias workspace dependencies to their source directories
  alias({
    entries: [
      {
        find: '@gitorial/shared-types',
        replacement: path.resolve(__dirname, '../shared-types/src'),
      },
    ],
  }),
  
  // Resolve node modules and external packages
  resolve({
    browser: false,
    preferBuiltins: true,
    exportConditions: ['node'],
  }),
  
  // Convert CommonJS modules to ES modules
  commonjs(),
  
  // TypeScript compilation
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false, // We'll generate declarations separately
    declarationMap: false,
    sourceMap: !isProduction,
    inlineSources: false,
    exclude: ['**/*.test.ts', '**/test/**/*', '**/examples/**/*'],
    outputToFilesystem: false, // Don't output individual files
    compilerOptions: {
      module: 'esnext', // Override for Rollup
    },
  }),
];

module.exports = [
  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: !isProduction,
      exports: 'named',
    },
    external: (id) => {
      // Only treat real external dependencies as external, not our internal modules
      return external.includes(id) || id.startsWith('node:');
    },
    plugins: commonPlugins,
    onwarn: (warning, warn) => {
      // Suppress certain warnings
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      if (warning.code === 'UNRESOLVED_IMPORT') return;
      warn(warning);
    },
  },
  
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: !isProduction,
    },
    external: (id) => {
      // Only treat real external dependencies as external, not our internal modules
      return external.includes(id) || id.startsWith('node:');
    },
    plugins: commonPlugins,
    onwarn: (warning, warn) => {
      // Suppress certain warnings
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      if (warning.code === 'UNRESOLVED_IMPORT') return;
      warn(warning);
    },
  },
  
  // TypeScript declarations bundling
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'esm',
    },
    external: (id) => {
      // Don't bundle workspace dependencies in declarations
      if (id.includes('@gitorial/shared-types')) return false;
      return external.includes(id) || id.startsWith('node:');
    },
    plugins: [
      // Alias workspace dependencies for declaration bundling
      alias({
        entries: [
          {
            find: '@gitorial/shared-types',
            replacement: path.resolve(__dirname, '../shared-types/src'),
          },
        ],
      }),
      
      // Bundle TypeScript declarations
      dts({
        tsconfig: './tsconfig.json',
        // Inline all workspace dependency types
        compilerOptions: {
          declarationMap: false,
          removeComments: true,
        },
      }),
    ],
  },
]; 