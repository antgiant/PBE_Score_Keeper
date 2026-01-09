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

## Multi-Doc Yjs Architecture (v3.0+)

### Architecture Overview

The application is a multi-doc architecture where:
- **Global metadata Y.Doc** (`pbe-score-keeper-global`): Stores only session list metadata and current session tracking
- **Per-session Y.Docs**: Each session is a separate Y.Doc for conflict-free import/export and session isolation

### DocManager Abstraction

All Y.Doc access goes through the `DocManager` object in `app-yjs.js`:
- `getGlobalDoc()` - Returns global metadata doc
- `getActiveSessionDoc()` - Returns current session's doc
- `getSessionDoc(sessionId)` - Returns specific session doc by ID
- `getGlobalUndoManager()` - Undo/redo for global changes
- `getActiveSessionUndoManager()` - Undo/redo for session data

### Session Management Functions

Available in `app-state.js`:
- `generateSessionId()` - Creates UUID for new session
- `createNewSession(name)` - Creates session with copied settings
- `switchSession(sessionId)` - Changes active session
- `deleteSession(sessionId)` - Removes session with safeguards
- `getAllSessions()` - Returns array of all sessions
- `updateSessionLastModified(sessionId)` - Updates timestamp (future use)

### Export/Import Functions

Available in `app-import-export.js`:
- `exportSession(sessionNum)` - Binary export of single session
- `exportAllSessions()` - Binary export of all sessions
- `downloadBinaryExport(binary, filename)` - Trigger download
- `importSessionData(data)` - Universal import (all formats)

Also in `app-state.js`:
- `detectImportFormat(data)` - Auto-detect format (binary/JSON/legacy)

### Loading and Error Handling

Available in `app-display.js`:
- `showLoading(message)` - Show loading indicator with message
- `hideLoading()` - Hide loading indicator
- `showError(message, recoveryOptions)` - Show error with recovery options
- `disableSessionControls()` - Disable session switching (future)
- `enableSessionControls()` - Enable session switching (future)

### Key Design Decisions

1. **Session IDs**: Generated as UUIDs via `generateSessionId()`
2. **Session List Ordering**: New sessions inserted at end of array
3. **Undo/Redo**: Per-session isolation, global changes tracked separately
4. **Export Format**: Binary by default (compact), JSON supported on import
5. **Import Behavior**: Always creates new sessions (no merge ambiguity)
6. **Error Handling**: Skip-and-continue for batch operations with user feedback

### Single-Doc Compatibility

Current code operates in single-doc mode but uses DocManager abstraction. The global Y.Doc is named `pbe-score-keeper` (same as v2.0) for backward compatibility. Multi-doc migration is transparent when Phase 2 implementations are activated.

### Testing

- **Total Tests**: 56
- **Passing**: 54
- **Failed**: 0
- **Skipped**: 2 (Undo/Redo tests - UndoManager not yet available)
- **Test Files**:
  - UI tests: blocks, exports, extra-credit, ignore-question, max-points, reorder, rounding, score-summaries, sessions, teams
  - Unit tests: core, multi-doc

### Notes for Maintainers

- All functions fully documented with JSDoc comments
- No breaking changes to existing API
- Full backward compatibility maintained
- Session data structure unchanged
- IndexedDB naming ready for multi-doc phase
- Tests provide comprehensive coverage of new architecture


