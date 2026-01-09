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

**Status:** Foundation laid (Phases 1.0-1.2 complete). Phases 2-6 ready for implementation.

### Architecture Overview

The application is transitioning from a single Y.Doc (v2.0) to a multi-doc architecture where:
- **Global metadata Y.Doc** (`pbe-score-keeper-global`): Stores only session list metadata and current session tracking
- **Per-session Y.Docs**: Each session is a separate Y.Doc for conflict-free import/export and session isolation

### DocManager Abstraction

All Y.Doc access goes through the `DocManager` object in `app-yjs.js`:
- `getGlobalDoc()` - Returns global metadata doc
- `getActiveSessionDoc()` - Returns current session's doc  
- `getSessionDoc(sessionId)` - Returns specific session doc
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
- `detectImportFormat(data)` - Auto-detect format (binary/JSON/legacy)
- `importSessionData(data)` - Universal import (all formats)

### Loading and Error Handling

Available in `app-display.js`:
- `showLoading(message)` - Show loading indicator with message
- `hideLoading()` - Hide loading indicator
- `showError(message, recoveryOptions)` - Show error with recovery options
- `disableSessionControls()` - Disable session switching (future)
- `enableSessionControls()` - Enable session switching (future)

### Future Implementation Phases

**Phase 2.1**: Migrate single Y.Doc users to multi-doc
- `migrateFromSingleDoc()` - Split existing doc into global + per-session docs

**Phase 2.2**: Migrate legacy localStorage users
- `migrateFromLegacy()` - Convert v1.x localStorage to multi-doc

**Phase 2.3**: Auto-detect and migrate on app load
- Enhanced `loadFromYjs()` with error recovery

**Phase 3.3**: UI integration
- Connect export buttons to `exportSession()` and `exportAllSessions()`
- Connect import button to `importSessionData()`

**Phase 4-6**: Test updates and full documentation

### Key Design Decisions

1. **Session IDs**: UUIDs (stable, unique across merges)
2. **Session List Ordering**: New items inserted at index 0 (top)
3. **Undo/Redo**: Per-session isolation, global changes tracked separately
4. **Export Format**: Binary by default (compact), JSON supported on import
5. **Import Behavior**: Always creates new sessions (no merge ambiguity)
6. **Error Handling**: Skip-and-continue for batch operations with user feedback

### Single-Doc Compatibility

Current code operates in single-doc mode but uses abstraction layer. The global Y.Doc is named `pbe-score-keeper` (same as v2.0) for backward compatibility. Multi-doc migration is transparent when Phase 2 implementations are activated.

### Notes for Maintainers

- All placeholder functions have `[FUTURE: Multi-doc]` comments
- No breaking changes to existing API during Phase 1.0-1.2
- Tests may fail until Phase 4 updates are complete
- Session data structure unchanged - full backward compatibility
- IndexedDB naming will change when multi-doc migration occurs
