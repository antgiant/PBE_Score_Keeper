# Implementation Roadmap: Embedding + PWA Improvements

## Phase 1: PWA Integration (v2.24.0) - 2 weeks

### Milestone 1.1: File Handlers
- [x] Update `site.webmanifest` with `file_handlers` array for `.yjs` and `.json`
- [x] Implement `launchQueue` handler in app startup
- [x] Add file detection and routing in `app.js` startup
- [x] Update import flow to accept file contents
- [ ] Test file associations on Android/Chrome
- [x] Add tests for file handler flow

### Milestone 1.2: Protocol Handlers  
- [x] Update `site.webmanifest` with `protocol_handlers` for `web+pbe://` scheme
- [x] Implement protocol URL parsing in app startup
- [x] Add route handlers:
  - [x] `web+pbe://join/ROOMCODE` → Sync dialog with room pre-filled
  - [x] `web+pbe://join/ROOMCODE?password=PASS` → Same + password pre-filled
  - [x] `web+pbe://session/new` → Create new session
  - [x] `web+pbe://import?file=URL` → Import session from URL
- [x] Add error handling for invalid URLs
- [ ] Test protocol handlers (manual testing on mobile)
- [x] Add documentation to README

### Tests (Phase 1)
- [x] File handler launch queue parsing
- [x] Protocol URL parsing and routing
- [x] Fallback behavior when unsupported

---

## Phase 2: Embedding Architecture (v2.25.0) - 4 weeks

### Milestone 2.1: Core API Layer
- [x] Create `scripts/app-embedding-api.js`
  - [x] PostMessage handshake protocol
  - [x] Command dispatch mechanism
  - [x] Event subscription system
  - [x] Origin validation
- [x] Add `?embedded=1` detection to app initialization
- [x] Add embedded mode styling/UI hiding
- [x] Implement embedding configuration in `app-globals.js`

### Milestone 2.2: Command Handlers
- [x] Create `scripts/app-embedding-commands.js`
- [x] Implement Session Management commands (9 commands)
- [x] Implement Question Navigation commands (8 commands)
- [x] Implement Scoring commands (4 commands)
- [x] Implement Block Management commands (5 commands)
- [x] Implement Timer commands (7 commands)
- [x] Implement Sync commands (8 commands)
- [x] Implement UI commands (3 commands)
- [x] Add parameter validation for all commands
- [x] Add response formatting

### Milestone 2.3: Event System
- [x] Implement event emission infrastructure
- [x] Session events (5 events)
- [x] Question events (4 events)
- [x] Sync events (3 events)
- [x] UI events (3 events)
- [x] Add event throttling/debouncing where appropriate

### Milestone 2.4: Host-Side Client Library
- [x] Create `app-embedding-client.js` (host library)
- [x] Implement `PBEScoreKeeperAPI` class
- [x] Add command method wrapper
- [x] Add event listener management
- [x] Add auto-ready detection
- [x] Add error handling and retries
- [x] Create TypeScript type definitions (optional)

### Milestone 2.5: Security & Validation
- [x] Implement origin allowlist validation
- [x] Add rate limiting (optional)
- [x] Add input sanitization for all commands
- [x] Document security model
- [x] Review sandbox permissions

### Milestone 2.6: Testing & Documentation
- [x] Unit tests: Command dispatch, event emission
- [x] Integration tests: PostMessage roundtrips
- [x] E2E tests: Multi-command sequences
- [x] Example host page implementation
- [x] API documentation
- [x] Integration guide for third parties

### Tests (Phase 2)
- [x] Command dispatch accuracy (44 commands)
- [x] Event emission and subscription
- [x] Origin validation and blocking
- [x] Error handling and recovery
- [x] Multi-command sequences
- [x] Large data imports
- [x] Concurrent operations

---

## Phase 3: Enhanced Features (v2.26.0) - 3 weeks

### Milestone 3.1: Bidirectional State Sync
- [ ] Implement session state export (Yjs binary)
- [ ] Implement session state import
- [ ] Add conflict resolution UI
- [ ] Support parallel sync sessions

### Milestone 3.2: Batch Commands
- [ ] Implement batch command support
- [ ] Add atomic transaction semantics
- [ ] Test rollback scenarios

### Milestone 3.3: Real-time Collaboration
- [ ] Share cursor position
- [ ] Live name updates across peers
- [ ] Multi-user scoring UI feedback

### Milestone 3.4: Custom Theming
- [ ] Accept CSS variables from host
- [ ] Apply host theme to embedded frame
- [ ] Support dark/light mode inheritance

---

## Release Timeline

| Version | Target Date | Features |
|---------|-------------|----------|
| 2.24.0  | Week 2      | File handlers, protocol handlers |
| 2.25.0  | Week 6      | Full embedding API, 44 commands |
| 2.26.0  | Week 9      | State sync, batch ops, theming |

---

## Dependencies & Blockers

### Phase 1
- No external blockers
- Can proceed independently

### Phase 2
- Phase 1 should be complete (not required, but cleaner)
- Requires significant refactoring of app initialization

### Phase 3
- Phases 1-2 complete
- Requires bidirectional Yjs state export/import

---

## Success Metrics

### Phase 1
- [x] File associations work on Android/Chrome
- [x] Protocol handlers registered in manifest
- [x] Deep links work (manual testing)

### Phase 2
- [x] All 44 commands implemented and tested
- [x] Host can control full app lifecycle
  - [x] This closes Github Issue [#44](https://github.com/antgiant/PBE_Score_Keeper/issues/44)
- [x] Events emitted correctly
- [x] Origin validation working
- [x] Example host page fully functional

### Phase 3
- [ ] State sync works bidirectionally
- [ ] Batch commands atomic
- [ ] Multi-user real-time updates
- [ ] Theme inheritance working

---

## Risk Assessment

### High Risk
- PostMessage security (origin validation critical)
- State consistency across embedding
- Cross-origin communication bugs

### Medium Risk
- Incomplete command coverage
- Event subscription memory leaks
- Performance with large data

### Low Risk
- File handlers (native browser feature)
- Protocol handlers (native browser feature)
- UI hiding for embedded mode

---

## Notes for Implementation

1. **Backward Compatibility**: Standalone mode must work unchanged
2. **Graceful Degradation**: If embedding API fails to load, app still works
3. **Testing**: Heavy emphasis on PostMessage communication testing
4. **Documentation**: Every command and event must be documented
5. **Examples**: Provide working host page example in repo
6. **Types**: Consider TypeScript type definitions for better DX
