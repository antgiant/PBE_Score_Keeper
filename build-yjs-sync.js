// build-yjs-sync.js - Rebuild Yjs bundle with WebRTC support
const esbuild = require('esbuild');
const fs = require('fs');

const yjsEntry = `
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import * as awarenessProtocol from 'y-protocols/awareness.js';

window.Y = Y;
window.IndexeddbPersistence = IndexeddbPersistence;
window.WebrtcProvider = WebrtcProvider;
window.awarenessProtocol = awarenessProtocol;
window.yjsModulesLoaded = true;
window.dispatchEvent(new Event('yjsModulesLoaded'));
`;

fs.writeFileSync('yjs-bundle-entry.js', yjsEntry);

esbuild.build({
  entryPoints: ['yjs-bundle-entry.js'],
  bundle: true,
  format: 'iife',
  outfile: 'scripts/yjs-bundle.min.js',
  minify: true,
  platform: 'browser',
}).then(() => {
  console.log('✓ Yjs bundle with WebRTC created successfully');
  const stats = fs.statSync('scripts/yjs-bundle.min.js');
  console.log('  Bundle size:', Math.round(stats.size / 1024), 'KB');
  fs.unlinkSync('yjs-bundle-entry.js');
}).catch((err) => {
  console.error('Build failed:', err);
  try { fs.unlinkSync('yjs-bundle-entry.js'); } catch(e) {}
  process.exit(1);
});
