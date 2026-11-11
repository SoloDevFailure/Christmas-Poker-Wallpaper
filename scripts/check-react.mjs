import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const react = require('react/package.json').version;
const renderer = require('react-dom/package.json').version;
if (react !== renderer) {
  throw new Error('Cannot build: react (' + react + ') and react-dom (' + renderer + ') must match exactly. Run npm ci with the committed lockfile.');
}
console.log('React runtime versions match: ' + react);
