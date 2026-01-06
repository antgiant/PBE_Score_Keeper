# AI Agent Guidelines

These instructions apply to any AI assistant working in this repository.

## Testing
- All tests must always pass.
- Run the full test suite (`node --test`) after any change that could affect behavior.
- If tests cannot be run, state why and provide the closest possible validation.
- Use the summary reporter when you want a compact output (`node --test --test-reporter ./tests/helpers/table-reporter.js`).

## Test Structure
- Place pure logic tests under `tests/unit/`.
- Place UI/DOM interaction tests under `tests/ui/`.
- Shared utilities belong in `tests/helpers/`.

## JavaScript Structure
- Keep browser logic split across the focused scripts in `scripts/` and only bootstrap in `app.js`.
- Update `index.html` script order when adding/removing script files.

## Yjs Library Bundle

The application uses Yjs for CRDT-based data synchronization. The Yjs libraries are bundled into a single browser-ready file at `scripts/yjs-bundle.min.js`.

### Rebuilding the Yjs Bundle

If you need to update the Yjs libraries or rebuild the bundle:

1. **Install dependencies** (if not already installed):
   ```bash
   npm install --save-dev esbuild yjs y-indexeddb
   ```

2. **Create a temporary build script** (`build-yjs.js`):
   ```javascript
   const esbuild = require('esbuild');
   const fs = require('fs');

   const yjsEntry = `
   import * as Y from 'yjs';
   import { IndexeddbPersistence } from 'y-indexeddb';

   window.Y = Y;
   window.IndexeddbPersistence = IndexeddbPersistence;
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
     console.log('✓ Yjs bundle created successfully');
     fs.unlinkSync('yjs-bundle-entry.js');
   }).catch((err) => {
     console.error('Build failed:', err);
     process.exit(1);
   });
   ```

3. **Run the build**:
   ```bash
   node build-yjs.js
   ```

4. **Clean up**:
   ```bash
   rm build-yjs.js
   ```

The bundle exposes `window.Y` and `window.IndexeddbPersistence` globally and dispatches a `yjsModulesLoaded` event when ready.
