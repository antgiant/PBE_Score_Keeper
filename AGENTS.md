# AI Agent Guidelines

These instructions apply to any AI assistant working in this repository.

## Testing
- All tests must always pass.
- Run the full test suite (`node --test`) after any change that could affect behavior.
- If tests cannot be run, state why and provide the closest possible validation.
- Use the summary reporter when you want a compact output (`node --test --test-reporter ./tests/helpers/table-reporter.js`).

## Export Requirements
**ALL EXPORTS MUST BE NATIVE YJS BINARY FORMAT**
- Exports MUST use `Y.encodeStateAsUpdate()` to create native Yjs binary format
- Exported files MUST be importable via `Y.applyUpdate()` for merging into existing documents
- File extension `.yjs` indicates native Yjs binary format that can be merged
- JSON exports are acceptable ONLY as fallback format (use `.json` extension)
- When importing, the system MUST support merging native Yjs exports without data loss

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
- `get_current_session_index()` - Returns 1-based session index (replaces legacy `current_session` global)
- `getGlobalUndoManager()` - Undo/redo for global changes
- `getActiveSessionUndoManager()` - Undo/redo for session data

### Session Management Functions

Available in `app-state.js`:
- `generateSessionId()` - Creates UUID for new session
- `createNewSession(name)` - Creates session with copied settings
- `switchSession(sessionId)` - Changes active session
- `deleteSession(sessionId)` - Removes session with safeguards
- `getAllSessions()` - Returns array of all sessions
- `updateSessionLastModified(sessionId)` - Updates timestamp for session tracking

### Export/Import Functions

Available in `app-import-export.js`:
- `exportSession(sessionNum)` - Exports single session as native Yjs binary (can be merged via Y.applyUpdate)
- `exportAllSessions()` - Exports global Y.Doc and all referenced session docs as native Yjs binary with metadata
- `downloadBinaryExport(binary, filename)` - Triggers browser download of binary file
- `importSessionData(data)` - Universal import supporting native Yjs binary (single/multi-doc) and legacy JSON

Also in `app-state.js`:
- `detectImportFormat(data)` - Auto-detect format (binary-single, binary-full, json-v3, json-legacy)

**CRITICAL: Export/Import Specifications**
- All `.yjs` exports are native Yjs binary format created via `Y.encodeStateAsUpdate()`
- `exportAllSessions()` returns `{ version, exportedAt, global: Uint8Array, sessions: {} }`
  - `global`: Encoded state of global Y.Doc (metadata and session references)
  - `sessions`: Map of individual session doc states keyed by their session UUID
- Exported files can be merged using `Y.applyUpdate(targetDoc, binaryData)` for conflict-free sync
- **Import preserves session UUIDs** for conflict-free merging of the same session across devices
- Import function handles all formats:
  - **binary-full**: Multi-doc exports with global + individual session docs (UUIDs preserved)
  - **binary-single**: Single session exports (UUID preserved if present in session doc)
  - **json-v3/json-legacy**: Legacy JSON save files from previous versions (new UUIDs generated)
- This enables conflict-free synchronization across different sessions and users

### Loading and Error Handling

Available in `app-display.js`:
- `showLoading(message)` - Show loading indicator with message
- `hideLoading()` - Hide loading indicator
- `showError(message, recoveryOptions)` - Show error with recovery options
- `disableSessionControls()` - Disable session switching during operations
- `enableSessionControls()` - Enable session switching when ready

### Key Design Decisions

1. **Session IDs**: Generated as UUIDs via `generateSessionId()`
2. **Session List Ordering**: New sessions inserted at end of array
3. **Undo/Redo**: Per-session isolation, global changes tracked separately
4. **Export Format**: Binary by default (compact), JSON supported on import
5. **Import Behavior**: Always creates new sessions (no merge ambiguity)
6. **Error Handling**: Skip-and-continue for batch operations with user feedback

### Multi-Doc Architecture

The application operates in multi-doc mode with:
- **Global Y.Doc**: Stores metadata (dataVersion, currentSession) and session references
- **Per-session Y.Docs**: Each session has its own Y.Doc for isolation and independent import/export
- **DocManager**: Centralizes access to all docs via getter/setter functions

IndexedDB persistence uses separate keys for each Y.Doc (`pbe-score-keeper-global`, `pbe-score-keeper-session-{id}`).

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


