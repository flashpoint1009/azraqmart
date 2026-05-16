import { Generator, getConfig } from '@tanstack/router-generator';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = process.cwd();

// Try to load tsr config; fall back to defaults if none found.
let config;
try {
  config = await getConfig({}, root);
} catch {
  config = {
    target: 'react',
    routesDirectory: path.join(root, 'src/routes'),
    generatedRouteTree: path.join(root, 'src/routeTree.gen.ts'),
    autoCodeSplitting: false,
  };
}

// Ensure absolute paths.
config.routesDirectory = path.isAbsolute(config.routesDirectory)
  ? config.routesDirectory
  : path.join(root, config.routesDirectory);
config.generatedRouteTree = path.isAbsolute(config.generatedRouteTree)
  ? config.generatedRouteTree
  : path.join(root, config.generatedRouteTree);

const generator = new Generator({ config, root });
await generator.run();
console.log('routeTree.gen.ts regenerated');
