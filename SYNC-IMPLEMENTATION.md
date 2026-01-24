# WebRTC Real-Time Sync Implementation

## Overview

This document details the implementation of peer-to-peer real-time synchronization for PBE Score Keeper using WebRTC and Yjs CRDTs.

### Branch Strategy

**All sync implementation work MUST be done in a separate feature branch.**

```bash
# Create and switch to the feature branch
git checkout -b feature/webrtc-sync

# All work happens on this branch
# Only merge to main after ALL phases complete and tested
```

| Branch | Purpose |
|--------|--------|
| `main` | Stable production code |
| `feature/webrtc-sync` | All sync implementation work |

**Merge Criteria:**
- All 6 phases complete
- All tests pass (`node --test`)
- Manual testing checklist complete
- No regressions in existing functionality
- Code reviewed

### Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                            │
├─────────────────────────────────────────────────────────────────┤
│  Session Y.Doc (active session only)                             │
│  ├── IndexeddbPersistence (local storage)                       │
│  ├── BroadcastChannel (cross-tab sync)                          │
│  └── WebrtcProvider (peer-to-peer sync)                         │
└─────────────────────────────────────────────────────────────────┘
          │
          │ WebRTC Data Channel (encrypted, peer-to-peer)
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Signaling Servers (for peer discovery only) - Minimum 3        │
│  ├── Primary:  wss://y-webrtc-pbe.fly.dev (dedicated)           │
│  ├── Backup 1: wss://signaling.yjs.dev (Yjs community)          │
│  └── Backup 2: wss://y-webrtc-signaling-us.herokuapp.com        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sync scope | One room = one session | Clear mental model, no cross-session confusion |
| Room persistence | Yes, auto-reconnect | Better UX on page refresh |
| Peer roles | All equal | No special host privileges |
| Offline merge | Yjs CRDT auto-merge | Built into Yjs |
| Display names | Required, unique per room | Attribution in history, no confusion |
| Username conflicts | Auto-suffix with number | "Alice" → "Alice (2)" if duplicate |
| Room passwords | Optional (unchecked by default) | Privacy for sensitive competitions |
| Join behavior | Create new session (default) | User can opt to merge into room session |
| Question stability | Match by index AND name | High auto-match rate |
| Name conflicts | Matching dialog | User confirms mappings |

### Room-Session Relationship

**One Room = One Session (always)**

Each room code corresponds to exactly one session's Y.Doc. This provides:
- Clear mental model for users
- No confusion about which session is syncing
- Simple room name format: `pbe-sync-{roomCode}`

**When Joining a Room:**

The user is presented with a choice:
1. **Create new session (default)** - Creates a fresh local session and syncs the room's data into it
2. **Merge into current session** - Merges room data into the user's current session (triggers name matching if needed)

This ensures users don't accidentally overwrite their local data when joining.

### Signaling Server Configuration

**Minimum 3 signaling servers required** for redundancy and reliability.

```javascript
const SIGNALING_SERVERS = [
  'wss://y-webrtc-pbe.fly.dev',           // Primary (dedicated)
  'wss://signaling.yjs.dev',              // Backup 1 (Yjs community)
  'wss://y-webrtc-signaling-us.herokuapp.com'  // Backup 2 (Heroku US)
];
```

**Server Selection Logic:**
1. Try all servers in parallel for fastest connection
2. If primary fails, fall back to backups automatically
3. y-webrtc handles failover internally
4. Minimum 3 servers ensures availability even if one is down

### Password Protection

Room passwords are **optional** (unchecked by default). When enabled:
- Password is passed to y-webrtc as encryption key
- All peers must use the same password to connect
- Password is NOT stored in localStorage (must re-enter on reconnect)
- Incorrect password results in connection failure

---

## Phase 1: Core Infrastructure

### Objective
Set up the foundational files, bundle y-webrtc, and create the basic SyncManager structure.

### Prerequisites

**IMPORTANT: Create feature branch before starting any work.**

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create the feature branch
git checkout -b feature/webrtc-sync

# Verify you're on the correct branch
git branch --show-current
# Should output: feature/webrtc-sync
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/app-sync.js` | CREATE | Main sync module with SyncManager |
| `scripts/yjs-bundle.min.js` | REBUILD | Include y-webrtc and y-protocols |
| `index.html` | MODIFY | Add script tag for app-sync.js |
| `scripts/i18n/en.js` | MODIFY | Add sync-related translation keys |
| `scripts/i18n/es.js` | MODIFY | Add Spanish translations |
| `scripts/i18n/fr.js` | MODIFY | Add French translations |
| `scripts/i18n/pig.js` | MODIFY | Add Pig Latin translations |

### Task 1.0: Create Feature Branch

**Action:** Create and switch to the feature branch

```bash
git checkout -b feature/webrtc-sync
```

**Success Criteria:**
- [ ] Branch `feature/webrtc-sync` exists
- [ ] Currently on `feature/webrtc-sync` branch
- [ ] Branch is based on latest `main`

**Failure Criteria:**
- Working on `main` branch directly
- Branch not created before making changes

### Task 1.1: Create app-sync.js

**File:** `scripts/app-sync.js`

**Requirements:**
- Create `SyncManager` object with state management
- Define all public API functions (stubs initially)
- Include JSDoc documentation for all functions
- Follow existing code style (var for globals, function declarations)

**Implementation:**

```javascript
// WebRTC Sync Module for PBE Score Keeper
// Provides peer-to-peer real-time synchronization using y-webrtc

/**
 * SyncManager - Central controller for WebRTC synchronization
 * 
 * States: 'offline' | 'connecting' | 'connected' | 'error'
 */
var SyncManager = {
  // Connection state
  state: 'offline',
  roomCode: null,
  displayName: null,
  provider: null,
  awareness: null,
  
  // Peers tracking
  peers: new Map(),  // peerId -> { displayName, color, lastSeen }
  
  // Callbacks
  onStateChange: null,
  onPeersChange: null,
  onError: null,
  
  // Configuration
  config: {
    signalingServers: [
      'wss://y-webrtc-pbe.fly.dev',           // Primary (dedicated)
      'wss://signaling.yjs.dev',              // Backup 1 (Yjs community)
      'wss://y-webrtc-signaling-us.herokuapp.com'  // Backup 2 (Heroku)
    ],
    minSignalingServers: 3,  // Minimum required for reliability
    roomPrefix: 'pbe-sync-',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  }
};

/**
 * Initialize the sync manager
 * Call once on app startup
 */
function initSyncManager() {
  // Load persisted room info from localStorage
  const savedRoom = localStorage.getItem('pbe-sync-room');
  const savedName = localStorage.getItem('pbe-sync-displayName');
  
  if (savedRoom && savedName) {
    SyncManager.roomCode = savedRoom;
    SyncManager.displayName = savedName;
    // Will auto-reconnect in Phase 3
  }
  
  console.log('SyncManager initialized');
}

/**
 * Generate a 6-character room code
 * @returns {string} Room code (uppercase alphanumeric)
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: 0,O,1,I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validate room code format
 * @param {string} code - Room code to validate
 * @returns {boolean} True if valid format
 */
function isValidRoomCode(code) {
  if (typeof code !== 'string') return false;
  return /^[A-Z0-9]{6}$/i.test(code.trim());
}

/**
 * Get current sync state
 * @returns {string} Current state: 'offline' | 'connecting' | 'connected' | 'error'
 */
function getSyncState() {
  return SyncManager.state;
}

/**
 * Get current room code
 * @returns {string|null} Room code or null if not in a room
 */
function getSyncRoomCode() {
  return SyncManager.roomCode;
}

/**
 * Get current display name
 * @returns {string|null} Display name or null if not set
 */
function getSyncDisplayName() {
  return SyncManager.displayName;
}

/**
 * Get list of connected peers
 * @returns {Array} Array of { peerId, displayName, color }
 */
function getSyncPeers() {
  return Array.from(SyncManager.peers.values());
}

/**
 * Get count of connected peers (including self)
 * @returns {number} Peer count
 */
function getSyncPeerCount() {
  return SyncManager.peers.size + 1; // +1 for self
}

/**
 * Start sync - connect to or create a room
 * @param {string} displayName - User's display name
 * @param {string} [roomCode] - Room to join, or null to create new
 * @returns {Promise<string>} Room code on success
 */
async function startSync(displayName, roomCode) {
  // Implementation in Phase 3
  throw new Error('Not implemented yet');
}

/**
 * Stop sync - disconnect from current room
 */
function stopSync() {
  // Implementation in Phase 3
  SyncManager.state = 'offline';
  SyncManager.roomCode = null;
  SyncManager.peers.clear();
  
  localStorage.removeItem('pbe-sync-room');
  
  if (SyncManager.onStateChange) {
    SyncManager.onStateChange('offline');
  }
}

/**
 * Show the join/create room dialog
 */
function showSyncDialog() {
  // Implementation in Phase 2
  console.log('Sync dialog not implemented yet');
}

/**
 * Show the name matching dialog
 * @param {Object} remoteData - Remote session data for comparison
 * @returns {Promise<Object>} Mapping configuration
 */
async function showNameMatchingDialog(remoteData) {
  // Implementation in Phase 4
  throw new Error('Not implemented yet');
}

/**
 * Update sync UI elements
 * Called when state or peers change
 */
function updateSyncUI() {
  // Implementation in Phase 2
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SyncManager,
    initSyncManager,
    generateRoomCode,
    isValidRoomCode,
    getSyncState,
    getSyncRoomCode,
    getSyncDisplayName,
    getSyncPeers,
    getSyncPeerCount,
    startSync,
    stopSync,
    showSyncDialog,
    showNameMatchingDialog,
    updateSyncUI
  };
}
```

**Success Criteria:**
- [ ] File exists at `scripts/app-sync.js`
- [ ] `SyncManager` object is defined with all required properties
- [ ] All stub functions are defined with JSDoc comments
- [ ] `generateRoomCode()` returns valid 6-character codes
- [ ] `isValidRoomCode()` correctly validates codes
- [ ] Module exports work for Node.js testing

**Failure Criteria:**
- File has syntax errors
- Missing required functions
- Functions throw unexpected errors

### Task 1.2: Add i18n Translation Keys

**File:** `scripts/i18n/en.js`

**Add to translations object:**

```javascript
"sync": {
  "button": "Sync",
  "button_tooltip": "Collaborate in real-time with others",
  "status_offline": "Offline",
  "status_connecting": "Connecting...",
  "status_connected": "Connected",
  "status_error": "Connection Error",
  "peer_count_one": "{{count}} person editing",
  "peer_count_other": "{{count}} people editing",
  "peers_tooltip": "Connected: {{names}}",
  "dialog_title": "Real-Time Sync",
  "mode_selection": "Choose sync mode",
  "display_name_label": "Your Display Name",
  "display_name_placeholder": "Enter your name",
  "create_room": "Create New Room",
  "join_room": "Join Existing Room",
  "room_code_label": "Room Code",
  "room_code_placeholder": "Enter 6-character code",
  "room_code_hint": "Get this code from the room creator",
  "use_password": "Protect room with password",
  "password_label": "Room Password",
  "password_placeholder": "Enter password",
  "password_hint": "All participants must use the same password",
  "password_required": "This room requires a password",
  "password_incorrect": "Incorrect password. Please try again.",
  "connect_button": "Connect",
  "disconnect_button": "Disconnect",
  "cancel_button": "Cancel",
  "share_instructions": "Share this code with others to let them join:",
  "share_password_note": "This room is password-protected. Share the password separately.",
  "invalid_room_code": "Invalid room code. Please enter 6 characters.",
  "invalid_display_name": "Please enter your display name.",
  "connection_failed": "Failed to connect. Please try again.",
  "disconnected": "Disconnected from sync room.",
  "name_changed": "Your display name was changed to {{name}} to avoid duplicates",
  "peer_joined": "{{name}} joined",
  "peer_left": "{{name}} left",
  "join_choice_title": "Join Session",
  "join_choice_description": "This room has an existing session. What would you like to do?",
  "join_choice_new_session": "Create new local session (recommended)",
  "join_choice_new_session_desc": "Start fresh with the room's data in a new session",
  "join_choice_merge_session": "Merge into current session",
  "join_choice_merge_session_desc": "Combine room data with your current session",
  "matching_title": "Match Teams & Blocks",
  "matching_description": "The room has different names. Please confirm how to match them:",
  "matching_teams_header": "Teams",
  "matching_blocks_header": "Blocks/Groups",
  "matching_questions_header": "Questions",
  "matching_remote": "Remote",
  "matching_local": "Your Local",
  "matching_create_new": "➕ Create New",
  "matching_auto_matched": "Auto-matched",
  "matching_confirm": "Confirm & Sync",
  "matching_skip": "Skip (Don't Sync)",
  "history_local_user": "(local)",
  "history_unknown_user": "(unknown)",
  "aria_sync_status": "Sync status: {{status}}",
  "aria_peer_count": "{{count}} people currently editing",
  "aria_peer_joined": "{{name}} has joined the session",
  "aria_peer_left": "{{name}} has left the session"
}
```

**Success Criteria:**
- [ ] All sync keys added to en.js
- [ ] All sync keys added to es.js (Spanish translations)
- [ ] All sync keys added to fr.js (French translations)
- [ ] All sync keys added to pig.js (Pig Latin translations)
- [ ] No duplicate keys
- [ ] Plural forms use `_one` and `_other` suffixes correctly

### Task 1.3: Update index.html

**File:** `index.html`

**Changes:**
1. Add `<script src="scripts/app-sync.js"></script>` after app-import-export.js
2. Add sync button to header

**Add script tag after line ~31 (after app-import-export.js):**
```html
<script src="scripts/app-sync.js"></script>
```

**Add sync button to header (inside header-row div):**
```html
<button id="sync_button" class="sync-button" onclick="showSyncDialog()" data-i18n-title="sync.button_tooltip">
  <span class="sync-icon">🔄</span>
  <span class="sync-status" data-i18n="sync.button">Sync</span>
</button>
<div id="sync_peers" class="sync-peers" style="display: none;">
  <span class="peer-count"></span>
  <div class="peer-tooltip"></div>
</div>
```

**Success Criteria:**
- [ ] app-sync.js script tag added in correct position
- [ ] Sync button visible in header
- [ ] Peer count indicator element exists (hidden by default)
- [ ] No HTML validation errors

### Task 1.4: Rebuild Yjs Bundle with y-webrtc

**Action:** Rebuild `scripts/yjs-bundle.min.js` to include y-webrtc

**Build script (temporary, run once):**

```javascript
// build-yjs-sync.js
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
  fs.unlinkSync('yjs-bundle-entry.js');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
```

**Success Criteria:**
- [ ] `window.WebrtcProvider` is defined after bundle loads
- [ ] `window.awarenessProtocol` is defined after bundle loads
- [ ] Existing functionality (Y, IndexeddbPersistence) still works
- [ ] Bundle size is reasonable (< 500KB)
- [ ] All existing tests pass

### Task 1.5: Add CSS Styles

**File:** `css/styles.css`

**Add sync-related styles:**

```css
/* Sync Button & Status */
.sync-button {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  background: var(--bg-color, #fff);
  cursor: pointer;
  font-size: 0.875rem;
}

.sync-button:hover {
  background: var(--hover-bg, #f0f0f0);
}

.sync-button.connecting .sync-icon {
  animation: spin 1s linear infinite;
}

.sync-button.connected {
  border-color: #4CAF50;
  background: #E8F5E9;
}

.sync-button.error {
  border-color: #f44336;
  background: #FFEBEE;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Peer Count Indicator */
.sync-peers {
  display: inline-flex;
  align-items: center;
  position: relative;
  margin-left: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: #E8F5E9;
  border: 1px solid #4CAF50;
  border-radius: 4px;
  cursor: default;
}

.sync-peers .peer-count {
  font-weight: bold;
  color: #2E7D32;
}

.sync-peers .peer-tooltip {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  padding: 0.5rem;
  background: var(--bg-color, #fff);
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  white-space: nowrap;
  z-index: 1000;
}

.sync-peers:hover .peer-tooltip {
  display: block;
}

/* Sync Dialog */
.sync-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.sync-dialog {
  background: var(--bg-color, #fff);
  border-radius: 8px;
  padding: 1.5rem;
  max-width: 400px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.sync-dialog h2 {
  margin-top: 0;
}

.sync-dialog .form-group {
  margin-bottom: 1rem;
}

.sync-dialog label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: bold;
}

.sync-dialog input[type="text"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  font-size: 1rem;
}

.sync-dialog .room-code-input {
  font-family: monospace;
  font-size: 1.5rem;
  text-align: center;
  letter-spacing: 0.25em;
  text-transform: uppercase;
}

.sync-dialog .radio-group {
  margin: 1rem 0;
}

.sync-dialog .radio-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: normal;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
}

.sync-dialog .radio-group label:hover {
  background: var(--hover-bg, #f0f0f0);
}

.sync-dialog .button-row {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.sync-dialog .room-code-display {
  font-family: monospace;
  font-size: 2rem;
  text-align: center;
  letter-spacing: 0.25em;
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 4px;
  margin: 1rem 0;
}

/* Name Matching Dialog */
.matching-dialog {
  max-width: 600px;
}

.matching-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.matching-table th,
.matching-table td {
  padding: 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #ccc);
}

.matching-table th {
  background: var(--header-bg, #f5f5f5);
}

.matching-table select {
  width: 100%;
  padding: 0.25rem;
}

.matching-table .auto-matched {
  color: #4CAF50;
  font-size: 0.875rem;
}

/* Accessibility Utilities */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Focus styles for keyboard navigation */
.sync-dialog button:focus,
.sync-dialog input:focus,
.sync-dialog select:focus {
  outline: 2px solid #2196F3;
  outline-offset: 2px;
}

/* Join Choice Dialog */
.choice-group {
  border: none;
  padding: 0;
  margin: 1rem 0;
}

.choice-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  margin-bottom: 0.5rem;
  border: 2px solid var(--border-color, #ccc);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.choice-option:hover {
  background: var(--hover-bg, #f0f0f0);
}

.choice-option:has(input:checked) {
  border-color: #2196F3;
  background: #E3F2FD;
}

.choice-option input[type="radio"] {
  margin-top: 0.25rem;
}

.choice-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.choice-desc {
  font-size: 0.875rem;
  color: var(--text-muted, #666);
}

/* Password field styles */
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.hint-text {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted, #666);
  margin-top: 0.25rem;
}

.password-note {
  color: var(--text-muted, #666);
  font-size: 0.875rem;
  text-align: center;
}

/* Toast notifications */
.sync-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  padding: 0.75rem 1.5rem;
  background: #333;
  color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  opacity: 0;
  transition: transform 0.3s, opacity 0.3s;
  z-index: 10001;
}

.sync-toast.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

/* Error message styling */
#sync-error-message {
  display: none;
  color: #d32f2f;
  background: #FFEBEE;
  padding: 0.5rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
```

**Success Criteria:**
- [ ] Sync button styled correctly
- [ ] Peer count indicator styled with hover tooltip
- [ ] Dialog overlay and content styled
- [ ] Styles work in both light and dark themes
- [ ] No CSS syntax errors

### Phase 1 Tests

**File:** `tests/unit/sync-core.test.js`

```javascript
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock browser globals
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = value; },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

describe('Sync Core', () => {
  let syncModule;
  
  beforeEach(() => {
    global.localStorage.clear();
    // Fresh require to reset module state
    delete require.cache[require.resolve('../../scripts/app-sync.js')];
    syncModule = require('../../scripts/app-sync.js');
  });

  describe('generateRoomCode', () => {
    it('should generate 6-character codes', () => {
      const code = syncModule.generateRoomCode();
      assert.strictEqual(code.length, 6);
    });

    it('should generate uppercase alphanumeric codes', () => {
      const code = syncModule.generateRoomCode();
      assert.match(code, /^[A-Z0-9]{6}$/);
    });

    it('should not contain ambiguous characters (0, O, 1, I)', () => {
      // Generate many codes to ensure no ambiguous chars
      for (let i = 0; i < 100; i++) {
        const code = syncModule.generateRoomCode();
        assert.doesNotMatch(code, /[0O1I]/);
      }
    });

    it('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(syncModule.generateRoomCode());
      }
      // With 6 chars from 32-char alphabet, collisions should be rare
      assert.ok(codes.size >= 95, 'Should generate mostly unique codes');
    });
  });

  describe('isValidRoomCode', () => {
    it('should accept valid 6-character codes', () => {
      assert.strictEqual(syncModule.isValidRoomCode('ABC123'), true);
      assert.strictEqual(syncModule.isValidRoomCode('XYZDEF'), true);
    });

    it('should accept lowercase and convert', () => {
      assert.strictEqual(syncModule.isValidRoomCode('abc123'), true);
    });

    it('should reject codes that are too short', () => {
      assert.strictEqual(syncModule.isValidRoomCode('ABC12'), false);
      assert.strictEqual(syncModule.isValidRoomCode(''), false);
    });

    it('should reject codes that are too long', () => {
      assert.strictEqual(syncModule.isValidRoomCode('ABC1234'), false);
    });

    it('should reject non-string inputs', () => {
      assert.strictEqual(syncModule.isValidRoomCode(null), false);
      assert.strictEqual(syncModule.isValidRoomCode(undefined), false);
      assert.strictEqual(syncModule.isValidRoomCode(123456), false);
    });

    it('should reject codes with special characters', () => {
      assert.strictEqual(syncModule.isValidRoomCode('ABC-12'), false);
      assert.strictEqual(syncModule.isValidRoomCode('ABC 12'), false);
    });

    it('should handle whitespace', () => {
      assert.strictEqual(syncModule.isValidRoomCode(' ABC123 '), true);
    });
  });

  describe('SyncManager state', () => {
    it('should start in offline state', () => {
      assert.strictEqual(syncModule.getSyncState(), 'offline');
    });

    it('should have no room code initially', () => {
      assert.strictEqual(syncModule.getSyncRoomCode(), null);
    });

    it('should have no display name initially', () => {
      assert.strictEqual(syncModule.getSyncDisplayName(), null);
    });

    it('should return empty peer list initially', () => {
      const peers = syncModule.getSyncPeers();
      assert.ok(Array.isArray(peers));
      assert.strictEqual(peers.length, 0);
    });

    it('should count self as 1 peer when offline', () => {
      assert.strictEqual(syncModule.getSyncPeerCount(), 1);
    });
  });

  describe('stopSync', () => {
    it('should reset state to offline', () => {
      syncModule.SyncManager.state = 'connected';
      syncModule.SyncManager.roomCode = 'ABC123';
      
      syncModule.stopSync();
      
      assert.strictEqual(syncModule.getSyncState(), 'offline');
      assert.strictEqual(syncModule.getSyncRoomCode(), null);
    });

    it('should clear localStorage room', () => {
      global.localStorage.setItem('pbe-sync-room', 'ABC123');
      
      syncModule.stopSync();
      
      assert.strictEqual(global.localStorage.getItem('pbe-sync-room'), null);
    });

    it('should clear peers', () => {
      syncModule.SyncManager.peers.set('peer1', { displayName: 'Test' });
      
      syncModule.stopSync();
      
      assert.strictEqual(syncModule.getSyncPeers().length, 0);
    });

    it('should call onStateChange callback', () => {
      let calledWith = null;
      syncModule.SyncManager.onStateChange = (state) => { calledWith = state; };
      
      syncModule.stopSync();
      
      assert.strictEqual(calledWith, 'offline');
    });
  });

  describe('initSyncManager', () => {
    it('should load saved room from localStorage', () => {
      global.localStorage.setItem('pbe-sync-room', 'ABC123');
      global.localStorage.setItem('pbe-sync-displayName', 'Test User');
      
      syncModule.initSyncManager();
      
      assert.strictEqual(syncModule.SyncManager.roomCode, 'ABC123');
      assert.strictEqual(syncModule.SyncManager.displayName, 'Test User');
    });

    it('should not load room if display name missing', () => {
      global.localStorage.setItem('pbe-sync-room', 'ABC123');
      // No display name set
      
      syncModule.initSyncManager();
      
      assert.strictEqual(syncModule.SyncManager.roomCode, null);
    });
  });

  describe('SyncManager config', () => {
    it('should have at least 3 signaling servers configured', () => {
      const servers = syncModule.SyncManager.config.signalingServers;
      assert.ok(Array.isArray(servers), 'signalingServers should be an array');
      assert.ok(servers.length >= 3, `Expected at least 3 signaling servers, got ${servers.length}`);
    });

    it('should have minSignalingServers set to 3', () => {
      assert.strictEqual(syncModule.SyncManager.config.minSignalingServers, 3);
    });

    it('should have primary server as first entry', () => {
      const servers = syncModule.SyncManager.config.signalingServers;
      assert.ok(servers[0].includes('y-webrtc-pbe.fly.dev'), 'Primary server should be first');
    });

    it('should have all servers using wss:// protocol', () => {
      const servers = syncModule.SyncManager.config.signalingServers;
      servers.forEach((server, i) => {
        assert.ok(server.startsWith('wss://'), `Server ${i} should use wss:// protocol`);
      });
    });
  });
});
```

**Success Criteria:**
- [ ] All tests pass with `node --test tests/unit/sync-core.test.js`
- [ ] Test coverage includes all public functions
- [ ] No test file syntax errors

### Phase 1 Completion Checklist

- [ ] **Working on `feature/webrtc-sync` branch (NOT main)**
- [ ] `scripts/app-sync.js` created with all stub functions
- [ ] **SyncManager has at least 3 signaling servers configured**
- [ ] `scripts/yjs-bundle.min.js` rebuilt with y-webrtc
- [ ] `index.html` updated with script tag and sync button
- [ ] `css/styles.css` updated with sync styles
- [ ] `scripts/i18n/en.js` updated with sync translations
- [ ] `scripts/i18n/es.js` updated with sync translations
- [ ] `scripts/i18n/fr.js` updated with sync translations
- [ ] `scripts/i18n/pig.js` updated with sync translations
- [ ] `tests/unit/sync-core.test.js` created and passing
- [ ] **Signaling server count test passes**
- [ ] All existing tests still pass (`node --test`)
- [ ] No JavaScript syntax errors
- [ ] No CSS syntax errors
- [ ] App loads without errors in browser
- [ ] Commit changes to `feature/webrtc-sync` branch

---

## Phase 2: Display Names & Presence UI

### Objective
Implement display name input, Yjs awareness for presence tracking, and UI to show connected peers.

### Dependencies
- Phase 1 complete
- On `feature/webrtc-sync` branch

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/app-sync.js` | MODIFY | Add presence management functions |
| `scripts/app-history.js` | MODIFY | Add user field to history entries |
| `scripts/app-display.js` | MODIFY | Update history display for user column |
| `index.html` | MODIFY | Add sync dialog HTML |
| `css/styles.css` | MODIFY | Add dialog animations |

### Task 2.1: Implement Sync Dialog UI

**Add to `scripts/app-sync.js`:**

```javascript
/**
 * Create and show the sync dialog
 * Handles both create and join flows
 */
function showSyncDialog() {
  // Remove any existing dialog
  const existing = document.getElementById('sync-dialog-overlay');
  if (existing) existing.remove();
  
  const isConnected = SyncManager.state === 'connected';
  
  const overlay = document.createElement('div');
  overlay.id = 'sync-dialog-overlay';
  overlay.className = 'sync-dialog-overlay';
  
  if (isConnected) {
    // Show disconnect dialog
    overlay.innerHTML = createDisconnectDialogHTML();
  } else {
    // Show connect dialog
    overlay.innerHTML = createConnectDialogHTML();
  }
  
  document.body.appendChild(overlay);
  
  // Focus first input
  const firstInput = overlay.querySelector('input[type="text"]');
  if (firstInput) firstInput.focus();
  
  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      closeSyncDialog();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', handleSyncDialogKeydown);
}

/**
 * Create HTML for connect dialog
 */
function createConnectDialogHTML() {
  const savedName = localStorage.getItem('pbe-sync-displayName') || '';
  
  return `
    <div class="sync-dialog" role="dialog" aria-labelledby="sync-dialog-title" aria-modal="true">
      <h2 id="sync-dialog-title">${t('sync.dialog_title')}</h2>
      
      <div class="form-group">
        <label for="sync-display-name">${t('sync.display_name_label')}</label>
        <input type="text" id="sync-display-name" 
               placeholder="${t('sync.display_name_placeholder')}"
               value="${escapeHtml(savedName)}"
               maxlength="30"
               aria-required="true">
      </div>
      
      <fieldset class="radio-group">
        <legend class="visually-hidden">${t('sync.mode_selection')}</legend>
        <label>
          <input type="radio" name="sync-mode" value="create" checked>
          ${t('sync.create_room')}
        </label>
        <label>
          <input type="radio" name="sync-mode" value="join">
          ${t('sync.join_room')}
        </label>
      </fieldset>
      
      <div class="form-group" id="sync-room-code-group" style="display: none;">
        <label for="sync-room-code">${t('sync.room_code_label')}</label>
        <input type="text" id="sync-room-code" 
               class="room-code-input"
               placeholder="${t('sync.room_code_placeholder')}"
               maxlength="6"
               autocomplete="off"
               autocorrect="off"
               autocapitalize="characters"
               aria-describedby="room-code-hint">
        <span id="room-code-hint" class="hint-text">${t('sync.room_code_hint')}</span>
      </div>
      
      <div class="form-group checkbox-group" id="sync-password-toggle">
        <label>
          <input type="checkbox" id="sync-use-password">
          ${t('sync.use_password')}
        </label>
      </div>
      
      <div class="form-group" id="sync-password-group" style="display: none;">
        <label for="sync-password">${t('sync.password_label')}</label>
        <input type="password" id="sync-password" 
               placeholder="${t('sync.password_placeholder')}"
               maxlength="50"
               aria-describedby="password-hint">
        <span id="password-hint" class="hint-text">${t('sync.password_hint')}</span>
      </div>
      
      <div class="button-row">
        <button type="button" onclick="closeSyncDialog()">${t('sync.cancel_button')}</button>
        <button type="button" onclick="handleSyncConnect()" class="primary">${t('sync.connect_button')}</button>
      </div>
    </div>
  `;
}

/**
 * Set up password checkbox toggle
 */
function setupPasswordToggle() {
  const checkbox = document.getElementById('sync-use-password');
  const passwordGroup = document.getElementById('sync-password-group');
  
  if (checkbox && passwordGroup) {
    checkbox.addEventListener('change', function() {
      passwordGroup.style.display = this.checked ? 'block' : 'none';
      if (this.checked) {
        document.getElementById('sync-password').focus();
      }
    });
  }
}

/**
 * Create HTML for disconnect dialog (when already connected)
 */
function createDisconnectDialogHTML() {
  const peers = getSyncPeers();
  const peerNames = peers.map(p => p.displayName).join(', ');
  
  return `
    <div class="sync-dialog">
      <h2>${t('sync.dialog_title')}</h2>
      
      <p>${t('sync.status_connected')}</p>
      
      <div class="room-code-display">${SyncManager.roomCode}</div>
      
      <p>${t('sync.share_instructions')}</p>
      
      <p><strong>${t('sync.peer_count_other', { count: getSyncPeerCount() })}</strong></p>
      ${peerNames ? `<p>${peerNames}</p>` : ''}
      
      <div class="button-row">
        <button type="button" onclick="closeSyncDialog()">${t('sync.cancel_button')}</button>
        <button type="button" onclick="handleSyncDisconnect()" class="danger">${t('sync.disconnect_button')}</button>
      </div>
    </div>
  `;
}

/**
 * Close the sync dialog
 */
function closeSyncDialog() {
  const overlay = document.getElementById('sync-dialog-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', handleSyncDialogKeydown);
}

/**
 * Handle keydown events in sync dialog
 */
function handleSyncDialogKeydown(e) {
  if (e.key === 'Escape') {
    closeSyncDialog();
  }
}

/**
 * Handle mode toggle in connect dialog
 */
function setupSyncDialogListeners() {
  const radios = document.querySelectorAll('input[name="sync-mode"]');
  const roomCodeGroup = document.getElementById('sync-room-code-group');
  
  radios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.value === 'join') {
        roomCodeGroup.style.display = 'block';
        document.getElementById('sync-room-code').focus();
      } else {
        roomCodeGroup.style.display = 'none';
      }
    });
  });
}

/**
 * Handle connect button click
 */
async function handleSyncConnect() {
  const displayName = document.getElementById('sync-display-name').value.trim();
  const mode = document.querySelector('input[name="sync-mode"]:checked').value;
  const roomCodeInput = document.getElementById('sync-room-code');
  const roomCode = mode === 'join' ? roomCodeInput.value.trim().toUpperCase() : null;
  
  // Get password if enabled
  const usePassword = document.getElementById('sync-use-password')?.checked || false;
  const password = usePassword ? document.getElementById('sync-password')?.value : null;
  
  // Validate display name
  if (!displayName) {
    showSyncError(t('sync.invalid_display_name'));
    document.getElementById('sync-display-name').focus();
    return;
  }
  
  // Validate room code for join mode
  if (mode === 'join' && !isValidRoomCode(roomCode)) {
    showSyncError(t('sync.invalid_room_code'));
    roomCodeInput.focus();
    return;
  }
  
  try {
    // For join mode, show session choice dialog first
    if (mode === 'join') {
      closeSyncDialog();
      const joinChoice = await showJoinChoiceDialog();
      if (!joinChoice) return; // User cancelled
      
      await startSync(displayName, roomCode, password, joinChoice);
    } else {
      await startSync(displayName, roomCode, password, 'create');
      closeSyncDialog();
      
      // Show the room code for sharing
      showRoomCodeDialog(SyncManager.roomCode, usePassword);
    }
  } catch (error) {
    console.error('Sync connection failed:', error);
    if (error.message === 'password_required') {
      showSyncError(t('sync.password_required'));
    } else if (error.message === 'password_incorrect') {
      showSyncError(t('sync.password_incorrect'));
    } else {
      showSyncError(t('sync.connection_failed'));
    }
  }
}

/**
 * Show accessible error message in dialog
 */
function showSyncError(message) {
  const errorEl = document.getElementById('sync-error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    errorEl.setAttribute('role', 'alert');
  } else {
    alert(message);
  }
}

/**
 * Handle disconnect button click
 */
function handleSyncDisconnect() {
  stopSync();
  closeSyncDialog();
}

/**
 * Show room code after creating a room
 * @param {string} roomCode - The generated room code
 * @param {boolean} hasPassword - Whether room is password-protected
 */
function showRoomCodeDialog(roomCode, hasPassword) {
  const existing = document.getElementById('sync-dialog-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.id = 'sync-dialog-overlay';
  overlay.className = 'sync-dialog-overlay';
  
  const passwordNote = hasPassword 
    ? `<p class="password-note"><span aria-hidden="true">🔒</span> ${t('sync.share_password_note')}</p>` 
    : '';
  
  overlay.innerHTML = `
    <div class="sync-dialog" role="dialog" aria-labelledby="room-code-title" aria-modal="true">
      <h2 id="room-code-title">${t('sync.dialog_title')}</h2>
      <p>${t('sync.share_instructions')}</p>
      <div class="room-code-display" aria-label="Room code: ${roomCode.split('').join(' ')}">${roomCode}</div>
      ${passwordNote}
      <div class="button-row">
        <button type="button" onclick="copyRoomCode('${roomCode}')" class="secondary">
          <span aria-hidden="true">📋</span> ${t('sync.copy_code')}
        </button>
        <button type="button" onclick="closeSyncDialog()" class="primary">OK</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Announce to screen readers
  announceToScreenReader(t('sync.aria_room_created', { code: roomCode }));
}

/**
 * Copy room code to clipboard
 */
async function copyRoomCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    showToast(t('sync.code_copied'));
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

/**
 * Show join choice dialog when joining an existing room
 * User chooses between creating new session or merging into current
 * @returns {Promise<string|null>} 'new' | 'merge' | null (cancelled)
 */
async function showJoinChoiceDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'sync-dialog-overlay';
    overlay.className = 'sync-dialog-overlay';
    
    overlay.innerHTML = `
      <div class="sync-dialog" role="dialog" aria-labelledby="join-choice-title" aria-modal="true">
        <h2 id="join-choice-title">${t('sync.join_choice_title')}</h2>
        <p>${t('sync.join_choice_description')}</p>
        
        <fieldset class="choice-group">
          <legend class="visually-hidden">${t('sync.join_choice_title')}</legend>
          
          <label class="choice-option">
            <input type="radio" name="join-choice" value="new" checked>
            <div class="choice-content">
              <strong>${t('sync.join_choice_new_session')}</strong>
              <span class="choice-desc">${t('sync.join_choice_new_session_desc')}</span>
            </div>
          </label>
          
          <label class="choice-option">
            <input type="radio" name="join-choice" value="merge">
            <div class="choice-content">
              <strong>${t('sync.join_choice_merge_session')}</strong>
              <span class="choice-desc">${t('sync.join_choice_merge_session_desc')}</span>
            </div>
          </label>
        </fieldset>
        
        <div class="button-row">
          <button type="button" class="cancel-btn">${t('sync.cancel_button')}</button>
          <button type="button" class="confirm-btn primary">${t('sync.connect_button')}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Focus first radio
    overlay.querySelector('input[type="radio"]').focus();
    
    // Handle cancel
    overlay.querySelector('.cancel-btn').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
    
    // Handle confirm
    overlay.querySelector('.confirm-btn').addEventListener('click', () => {
      const choice = overlay.querySelector('input[name="join-choice"]:checked').value;
      overlay.remove();
      resolve(choice);
    });
    
    // Handle Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEscape);
        overlay.remove();
        resolve(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Handle overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    });
  });
}

/**
 * Announce message to screen readers using ARIA live region
 * @param {string} message - Message to announce
 * @param {string} priority - 'polite' or 'assertive'
 */
function announceToScreenReader(message, priority = 'polite') {
  let announcer = document.getElementById('sync-sr-announcer');
  
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'sync-sr-announcer';
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'visually-hidden';
    document.body.appendChild(announcer);
  }
  
  // Clear and set message to trigger announcement
  announcer.textContent = '';
  setTimeout(() => {
    announcer.textContent = message;
  }, 100);
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds
 */
function showToast(message, duration = 3000) {
  let toast = document.getElementById('sync-toast');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sync-toast';
    toast.className = 'sync-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.classList.add('visible');
  
  setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

**Success Criteria:**
- [ ] Sync dialog opens when clicking sync button
- [ ] Dialog shows display name input field
- [ ] Radio buttons toggle between create/join modes
- [ ] Room code input appears only in join mode
- [ ] Dialog closes on Cancel, Escape, or overlay click
- [ ] Validation shows error for empty display name
- [ ] Validation shows error for invalid room code

### Task 2.2: Implement Peer Count Indicator

**Add to `scripts/app-sync.js`:**

```javascript
/**
 * Update the sync UI elements based on current state
 */
function updateSyncUI() {
  const syncButton = document.getElementById('sync_button');
  const syncPeers = document.getElementById('sync_peers');
  const syncStatus = syncButton ? syncButton.querySelector('.sync-status') : null;
  
  if (!syncButton) return;
  
  // Update button state
  syncButton.classList.remove('offline', 'connecting', 'connected', 'error');
  syncButton.classList.add(SyncManager.state);
  
  // Update button text
  if (syncStatus) {
    switch (SyncManager.state) {
      case 'connecting':
        syncStatus.textContent = t('sync.status_connecting');
        break;
      case 'connected':
        syncStatus.textContent = SyncManager.roomCode || t('sync.status_connected');
        break;
      case 'error':
        syncStatus.textContent = t('sync.status_error');
        break;
      default:
        syncStatus.textContent = t('sync.button');
    }
  }
  
  // Update peer count indicator
  if (syncPeers) {
    if (SyncManager.state === 'connected') {
      syncPeers.style.display = 'inline-flex';
      
      const peerCount = getSyncPeerCount();
      const peerCountEl = syncPeers.querySelector('.peer-count');
      const tooltipEl = syncPeers.querySelector('.peer-tooltip');
      
      if (peerCountEl) {
        peerCountEl.textContent = t_plural('sync.peer_count', peerCount, { count: peerCount });
      }
      
      if (tooltipEl) {
        const allNames = [SyncManager.displayName + ' (you)', ...getSyncPeers().map(p => p.displayName)];
        tooltipEl.innerHTML = allNames.map(name => `<div>${escapeHtml(name)}</div>`).join('');
      }
    } else {
      syncPeers.style.display = 'none';
    }
  }
}

/**
 * Set up awareness handlers for presence
 * @param {Object} awareness - Yjs awareness instance
 */
function setupAwareness(awareness) {
  SyncManager.awareness = awareness;
  
  // Set local state
  awareness.setLocalState({
    displayName: SyncManager.displayName,
    color: generateUserColor(SyncManager.displayName),
    lastSeen: Date.now()
  });
  
  // Listen for changes
  awareness.on('change', function() {
    updatePeersFromAwareness();
    updateSyncUI();
    
    if (SyncManager.onPeersChange) {
      SyncManager.onPeersChange(getSyncPeers());
    }
  });
}

/**
 * Update peers map from awareness states
 */
function updatePeersFromAwareness() {
  if (!SyncManager.awareness) return;
  
  SyncManager.peers.clear();
  
  const states = SyncManager.awareness.getStates();
  const localClientId = SyncManager.awareness.clientID;
  
  states.forEach((state, clientId) => {
    if (clientId !== localClientId && state.displayName) {
      SyncManager.peers.set(clientId, {
        displayName: state.displayName,
        color: state.color || '#888',
        lastSeen: state.lastSeen || Date.now()
      });
    }
  });
}

/**
 * Generate a consistent color for a user based on their name
 * @param {string} name - User's display name
 * @returns {string} Hex color
 */
function generateUserColor(name) {
  const colors = [
    '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', 
    '#E91E63', '#00BCD4', '#795548', '#607D8B'
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get a unique display name by appending suffix if needed
 * Checks existing peers and returns modified name if collision detected
 * @param {string} baseName - Desired display name
 * @returns {string} Unique display name (possibly with suffix)
 */
function getUniqueDisplayName(baseName) {
  if (!SyncManager.awareness) return baseName;
  
  const existingNames = new Set();
  const states = SyncManager.awareness.getStates();
  const localClientId = SyncManager.awareness.clientID;
  
  states.forEach((state, clientId) => {
    if (clientId !== localClientId && state.displayName) {
      existingNames.add(state.displayName.toLowerCase());
    }
  });
  
  // Check if base name is available
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }
  
  // Find available suffix
  let counter = 2;
  while (existingNames.has(`${baseName.toLowerCase()} (${counter})`)) {
    counter++;
    if (counter > 99) break; // Safety limit
  }
  
  return `${baseName} (${counter})`;
}

/**
 * Update display name if collision detected after peers change
 * Called when awareness changes to handle late-joining duplicates
 */
function checkDisplayNameCollision() {
  if (!SyncManager.awareness || !SyncManager.displayName) return;
  
  const uniqueName = getUniqueDisplayName(SyncManager.displayName);
  
  if (uniqueName !== SyncManager.displayName) {
    console.log(`Display name collision detected, changing to: ${uniqueName}`);
    SyncManager.displayName = uniqueName;
    
    // Update awareness with new name
    SyncManager.awareness.setLocalState({
      displayName: uniqueName,
      color: generateUserColor(uniqueName),
      lastSeen: Date.now()
    });
    
    // Persist new name
    localStorage.setItem('pbe-sync-displayName', uniqueName);
    
    // Notify user
    showToast(t('sync.name_changed', { name: uniqueName }));
  }
}
```

**Success Criteria:**
- [ ] Duplicate display names get auto-suffixed
- [ ] Late-joining duplicates trigger name change
- [ ] User notified when name is changed
- [ ] Peer count shows when connected
- [ ] Peer count updates when peers join/leave
- [ ] Hovering shows all peer names in tooltip
- [ ] Current user shown as "(you)" in tooltip
- [ ] Button shows room code when connected
- [ ] Button shows "Connecting..." during connection
- [ ] Button shows "Sync" when offline

### Task 2.3: Add User to History Entries

**Modify `scripts/app-history.js`:**

Find the function that creates history entries and add the `user` field:

```javascript
/**
 * Add a history entry with user attribution
 * @param {string} action - Action type
 * @param {string} details - Action details
 * @param {string} [sessionName] - Session name (optional)
 */
function addHistoryEntry(action, details, sessionName) {
  const historyLog = getGlobalDoc().getArray('globalHistory');
  
  // Get user name from SyncManager if connected, otherwise use local indicator
  const userName = (typeof SyncManager !== 'undefined' && SyncManager.state === 'connected') 
    ? SyncManager.displayName 
    : null;
  
  const entry = {
    timestamp: Date.now(),
    sessionName: sessionName || getCurrentSessionName(),
    action: action,
    details: details,
    user: userName  // NEW: User attribution
  };
  
  historyLog.push([entry]);
}
```

**Modify history display to show user column:**

```javascript
/**
 * Format history entry for display
 * @param {Object} entry - History entry
 * @returns {string} HTML for table row
 */
function formatHistoryEntry(entry) {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const user = entry.user || t('sync.history_local_user');
  
  return `
    <tr>
      <td>${time}</td>
      <td>${escapeHtml(user)}</td>
      <td>${escapeHtml(entry.sessionName || '')}</td>
      <td>${escapeHtml(entry.action || '')}</td>
      <td>${escapeHtml(entry.details || '')}</td>
    </tr>
  `;
}
```

**Update history table header in `index.html`:**

```html
<thead>
  <tr>
    <th data-i18n="history.time">Time</th>
    <th data-i18n="history.user">User</th>
    <th data-i18n="history.session">Session</th>
    <th data-i18n="history.action">Action</th>
    <th data-i18n="history.details_header">Details</th>
  </tr>
</thead>
```

**Success Criteria:**
- [ ] History entries include user field
- [ ] Connected users show display name in history
- [ ] Disconnected/local changes show "(local)"
- [ ] History table has User column
- [ ] User column displays correctly

### Task 2.4: Add i18n Key for History User Column

**Add to all i18n files:**

```javascript
"history": {
  // ... existing keys ...
  "user": "User"
}
```

**Success Criteria:**
- [ ] "User" header displays in all languages

### Phase 2 Tests

**File:** `tests/unit/sync-presence.test.js`

```javascript
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

describe('Sync Presence', () => {
  // Test generateUserColor
  describe('generateUserColor', () => {
    it('should return consistent color for same name', () => {
      // Test will be implemented when function is available
    });
    
    it('should return different colors for different names', () => {
      // Test will be implemented when function is available
    });
  });
  
  // Test peer tracking
  describe('peer tracking', () => {
    it('should track peers from awareness', () => {
      // Requires mock awareness object
    });
    
    it('should not include self in peers list', () => {
      // Requires mock awareness object
    });
  });
});
```

**File:** `tests/ui/sync-dialog.test.js`

```javascript
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDOM, cleanupTestDOM } = require('../helpers/dom.js');

describe('Sync Dialog UI', () => {
  beforeEach(() => {
    setupTestDOM();
  });
  
  afterEach(() => {
    cleanupTestDOM();
  });
  
  describe('showSyncDialog', () => {
    it('should create dialog overlay', () => {
      // Test will verify dialog is created
    });
    
    it('should show connect form when offline', () => {
      // Test will verify form fields
    });
    
    it('should show disconnect option when connected', () => {
      // Test will verify disconnect button
    });
  });
  
  describe('dialog interactions', () => {
    it('should close on cancel button', () => {
      // Test cancel functionality
    });
    
    it('should close on Escape key', () => {
      // Test keyboard handling
    });
    
    it('should show room code input when join selected', () => {
      // Test radio toggle
    });
  });
  
  describe('validation', () => {
    it('should reject empty display name', () => {
      // Test validation
    });
    
    it('should reject invalid room code', () => {
      // Test validation
    });
  });
});
```

### Phase 2 Completion Checklist

- [ ] Sync dialog implemented with create/join modes
- [ ] Display name input with localStorage persistence
- [ ] Room code input with validation
- [ ] Peer count indicator in header
- [ ] Peer names tooltip on hover
- [ ] User field added to history entries
- [ ] History table updated with User column
- [ ] All i18n translations added
- [ ] Tests created and passing
- [ ] All existing tests still pass

---

## Phase 3: Connection Management

### Objective
Implement the actual WebRTC connection using y-webrtc, including signaling server communication, room management, and auto-reconnect functionality.

### Dependencies
- Phase 1 complete
- Phase 2 complete
- Yjs bundle rebuilt with y-webrtc

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/app-sync.js` | MODIFY | Implement startSync, WebRTC provider setup |
| `scripts/app-yjs.js` | MODIFY | Add hooks for WebRTC provider |

### Task 3.1: Implement startSync Function

**Modify `scripts/app-sync.js`:**

```javascript
/**
 * Start sync - connect to or create a room
 * @param {string} displayName - User's display name
 * @param {string} [roomCode] - Room to join, or null to create new
 * @param {string} [password] - Optional room password for encryption
 * @param {string} [joinChoice] - 'create' | 'new' | 'merge' (how to handle joining)
 * @returns {Promise<string>} Room code on success
 */
async function startSync(displayName, roomCode, password, joinChoice) {
  if (!displayName || displayName.trim().length === 0) {
    throw new Error('Display name is required');
  }
  
  // Validate room code if joining
  if (roomCode && !isValidRoomCode(roomCode)) {
    throw new Error('Invalid room code');
  }
  
  // Generate room code if creating
  const finalRoomCode = roomCode ? roomCode.toUpperCase() : generateRoomCode();
  
  // Handle join choice - create new session or merge into current
  let sessionDoc;
  if (joinChoice === 'new') {
    // Create a new session for this sync
    const newSessionId = generateSessionId();
    const roomSessionName = `Synced: ${finalRoomCode}`;
    await createNewSession(roomSessionName);
    sessionDoc = getActiveSessionDoc();
  } else {
    // Use current session (for 'create' or 'merge')
    sessionDoc = getActiveSessionDoc();
  }
  
  if (!sessionDoc) {
    throw new Error('No active session');
  }
  
  // Update state
  SyncManager.state = 'connecting';
  SyncManager.displayName = displayName;
  SyncManager.roomCode = finalRoomCode;
  SyncManager.password = password || null;
  
  // Persist to localStorage (NOT password - must re-enter)
  localStorage.setItem('pbe-sync-displayName', displayName);
  localStorage.setItem('pbe-sync-room', finalRoomCode);
  
  updateSyncUI();
  
  try {
    // Create WebRTC provider
    // Room name is just the code (1 room = 1 session)
    const roomName = SyncManager.config.roomPrefix + finalRoomCode;
    
    SyncManager.provider = new WebrtcProvider(roomName, sessionDoc, {
      signaling: SyncManager.config.signalingServers,
      password: password || null,  // Used as encryption key if provided
      awareness: new awarenessProtocol.Awareness(sessionDoc),
      maxConns: 20,
      filterBcConns: true,
      peerOpts: {}
    });
    
    // Set up awareness
    setupAwareness(SyncManager.provider.awareness);
    
    // Listen for connection events
    SyncManager.provider.on('status', function(event) {
      console.log('WebRTC status:', event.status);
      
      if (event.status === 'connected') {
        SyncManager.state = 'connected';
        updateSyncUI();
        
        if (SyncManager.onStateChange) {
          SyncManager.onStateChange('connected');
        }
      }
    });
    
    SyncManager.provider.on('synced', function(event) {
      console.log('WebRTC synced:', event.synced);
      
      // This is where we'd trigger the name matching dialog
      // if there are differences between local and remote data
      if (event.synced && SyncManager.state === 'connecting') {
        checkForNameMatching();
      }
    });
    
    SyncManager.provider.on('peers', function(event) {
      console.log('WebRTC peers changed:', event.webrtcPeers);
      updatePeersFromAwareness();
      updateSyncUI();
    });
    
    // Wait for initial connection (with timeout)
    await waitForConnection(10000);
    
    SyncManager.state = 'connected';
    updateSyncUI();
    
    if (SyncManager.onStateChange) {
      SyncManager.onStateChange('connected');
    }
    
    return finalRoomCode;
    
  } catch (error) {
    console.error('Failed to start sync:', error);
    SyncManager.state = 'error';
    updateSyncUI();
    
    if (SyncManager.onError) {
      SyncManager.onError(error);
    }
    
    throw error;
  }
}

/**
 * Wait for WebRTC connection with timeout
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
function waitForConnection(timeout) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkConnection = function() {
      if (SyncManager.provider && SyncManager.provider.connected) {
        resolve();
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error('Connection timeout'));
        return;
      }
      
      setTimeout(checkConnection, 100);
    };
    
    checkConnection();
  });
}

/**
 * Stop sync - disconnect from current room
 */
function stopSync() {
  // Destroy WebRTC provider
  if (SyncManager.provider) {
    SyncManager.provider.destroy();
    SyncManager.provider = null;
  }
  
  // Clear awareness
  SyncManager.awareness = null;
  
  // Reset state
  SyncManager.state = 'offline';
  SyncManager.roomCode = null;
  SyncManager.peers.clear();
  
  // Clear localStorage (keep display name for convenience)
  localStorage.removeItem('pbe-sync-room');
  
  updateSyncUI();
  
  if (SyncManager.onStateChange) {
    SyncManager.onStateChange('offline');
  }
}

/**
 * Check if name matching is needed and trigger dialog
 */
async function checkForNameMatching() {
  // Get remote state from peers
  const sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) return;
  
  // Check if we have any peers with data
  const peerCount = getSyncPeerCount();
  if (peerCount <= 1) {
    // We're alone, no matching needed
    return;
  }
  
  // Name matching will be implemented in Phase 4
  // For now, just log
  console.log('Connected with peers, name matching may be needed');
}
```

**Success Criteria:**
- [ ] `startSync()` creates WebRTC provider
- [ ] Provider connects to signaling servers
- [ ] State transitions: offline → connecting → connected
- [ ] Room code is generated or validated
- [ ] Display name and room persisted to localStorage
- [ ] Connection timeout works (10 seconds)
- [ ] `stopSync()` properly destroys provider

**Failure Criteria:**
- Connection never completes
- State stuck in 'connecting'
- Provider throws errors
- Memory leaks on disconnect

### Task 3.2: Implement Auto-Reconnect

**Add to `scripts/app-sync.js`:**

```javascript
/**
 * Attempt to auto-reconnect to saved room
 * Called on page load if room was saved
 */
async function autoReconnect() {
  const savedRoom = localStorage.getItem('pbe-sync-room');
  const savedName = localStorage.getItem('pbe-sync-displayName');
  
  if (!savedRoom || !savedName) {
    return false;
  }
  
  console.log('Attempting auto-reconnect to room:', savedRoom);
  
  try {
    await startSync(savedName, savedRoom);
    return true;
  } catch (error) {
    console.warn('Auto-reconnect failed:', error);
    // Don't clear saved room - user can manually retry
    return false;
  }
}

/**
 * Handle visibility change for reconnection
 */
function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      // Page became visible again
      if (SyncManager.state === 'error' || 
          (SyncManager.roomCode && SyncManager.state === 'offline')) {
        autoReconnect();
      }
    }
  });
}

/**
 * Handle online/offline events
 */
function setupNetworkHandlers() {
  window.addEventListener('online', function() {
    console.log('Network online');
    if (SyncManager.roomCode && SyncManager.state !== 'connected') {
      autoReconnect();
    }
  });
  
  window.addEventListener('offline', function() {
    console.log('Network offline');
    // Provider will handle disconnection
    // Keep state so we can reconnect when online
  });
}

// Update initSyncManager to set up handlers
function initSyncManager() {
  // Load persisted room info from localStorage
  const savedRoom = localStorage.getItem('pbe-sync-room');
  const savedName = localStorage.getItem('pbe-sync-displayName');
  
  if (savedRoom && savedName) {
    SyncManager.roomCode = savedRoom;
    SyncManager.displayName = savedName;
  }
  
  // Set up event handlers
  setupVisibilityHandler();
  setupNetworkHandlers();
  
  // Attempt auto-reconnect after a short delay
  // (let the rest of the app initialize first)
  if (savedRoom && savedName) {
    setTimeout(function() {
      autoReconnect();
    }, 1000);
  }
  
  console.log('SyncManager initialized');
}
```

**Success Criteria:**
- [ ] Auto-reconnect attempts on page load if room was saved
- [ ] Reconnects when tab becomes visible after being hidden
- [ ] Reconnects when network comes back online
- [ ] Failed reconnect doesn't clear saved room
- [ ] Multiple reconnect attempts don't create multiple providers

### Task 3.3: Add WebRTC Provider Integration to app-yjs.js

**Modify `scripts/app-yjs.js`:**

Add a hook for session switching to disconnect/reconnect WebRTC:

```javascript
/**
 * Handle session switch for sync
 * Disconnects WebRTC from old session, reconnects to new
 */
async function handleSessionSwitchForSync(oldSessionId, newSessionId) {
  if (typeof SyncManager === 'undefined') return;
  if (SyncManager.state !== 'connected') return;
  
  console.log('Session switched while synced, reconnecting...');
  
  // Store current sync info
  const roomCode = SyncManager.roomCode;
  const displayName = SyncManager.displayName;
  
  // Stop current sync
  stopSync();
  
  // Wait for new session doc to be ready
  await initSessionDoc(newSessionId);
  
  // Reconnect to same room with new session
  try {
    await startSync(displayName, roomCode);
  } catch (error) {
    console.error('Failed to reconnect after session switch:', error);
  }
}
```

Call this from the session switch logic in app-yjs.js.

**Success Criteria:**
- [ ] Switching sessions disconnects from current room
- [ ] Switching sessions reconnects to same room
- [ ] New session doc is synced after switch
- [ ] Other peers see the session change

### Phase 3 Tests

**File:** `tests/unit/sync-connection.test.js`

```javascript
const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

describe('Sync Connection', () => {
  describe('startSync', () => {
    it('should require display name', async () => {
      // Test that empty display name throws
    });
    
    it('should generate room code if not provided', async () => {
      // Test room code generation
    });
    
    it('should validate room code format', async () => {
      // Test invalid room code rejection
    });
    
    it('should transition to connecting state', async () => {
      // Test state transition
    });
    
    it('should persist to localStorage', async () => {
      // Test localStorage writes
    });
  });
  
  describe('stopSync', () => {
    it('should destroy provider', () => {
      // Test provider cleanup
    });
    
    it('should clear room from localStorage', () => {
      // Test localStorage cleared
    });
    
    it('should keep display name in localStorage', () => {
      // Test display name preserved
    });
  });
  
  describe('autoReconnect', () => {
    it('should reconnect if room saved', async () => {
      // Test auto-reconnect
    });
    
    it('should not reconnect if no saved room', async () => {
      // Test skip reconnect
    });
  });
});
```

### Phase 3 Completion Checklist

- [ ] `startSync()` creates WebRTC provider and connects
- [ ] Connection to signaling servers works
- [ ] Room code generation and validation works
- [ ] State management (offline → connecting → connected)
- [ ] `stopSync()` properly cleans up
- [ ] Auto-reconnect on page load
- [ ] Reconnect on visibility change
- [ ] Reconnect on network online
- [ ] Session switch disconnects/reconnects
- [ ] Tests created and passing
- [ ] Manual testing: create room, join room, disconnect

---

## Phase 4: Name & Question Matching

### Objective
Implement the matching dialog for Teams, Blocks, and Questions when joining a room with existing data. Auto-match where possible, show UI for manual resolution.

### Dependencies
- Phase 3 complete (connection working)

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/app-sync.js` | MODIFY | Add matching logic and dialog |
| `css/styles.css` | MODIFY | Add matching dialog styles |

### Matching Algorithm

```
For each category (Teams, Blocks, Questions):

1. EXACT MATCH: Same name (case-insensitive) → auto-match
2. POSITION MATCH: If names differ but position matches → suggest as match
3. UNMATCHED: Show as needing manual resolution

Confidence levels:
- "exact" - Name matches exactly (auto-approve)
- "position" - Position matches but name differs (needs review)
- "new" - Only exists on one side (create or skip)
```

### Task 4.1: Implement Matching Logic

**Add to `scripts/app-sync.js`:**

```javascript
/**
 * Compare local and remote data to find matches
 * @param {Object} localSession - Local session data
 * @param {Object} remoteSession - Remote session data (from sync)
 * @returns {Object} Matching results for teams, blocks, questions
 */
function compareSessionData(localSession, remoteSession) {
  return {
    teams: compareArrays(
      getTeamNames(localSession),
      getTeamNames(remoteSession),
      'team'
    ),
    blocks: compareArrays(
      getBlockNames(localSession),
      getBlockNames(remoteSession),
      'block'
    ),
    questions: compareArrays(
      getQuestionNames(localSession),
      getQuestionNames(remoteSession),
      'question'
    )
  };
}

/**
 * Compare two arrays of names and find matches
 * @param {Array} localNames - Local names array (index 0 is null)
 * @param {Array} remoteNames - Remote names array (index 0 is null)
 * @param {string} type - Type for logging ('team', 'block', 'question')
 * @returns {Object} Matching result
 */
function compareArrays(localNames, remoteNames, type) {
  const result = {
    matches: [],      // Array of { remoteIndex, localIndex, confidence, remoteName, localName }
    unmatched: {
      local: [],      // Indices that exist only locally
      remote: []      // Indices that exist only remotely
    },
    needsReview: false
  };
  
  const localUsed = new Set();
  const remoteUsed = new Set();
  
  // Pass 1: Exact name matches
  for (let r = 1; r < remoteNames.length; r++) {
    if (!remoteNames[r]) continue;
    
    const remoteName = remoteNames[r].toLowerCase().trim();
    
    for (let l = 1; l < localNames.length; l++) {
      if (localUsed.has(l) || !localNames[l]) continue;
      
      const localName = localNames[l].toLowerCase().trim();
      
      if (remoteName === localName) {
        result.matches.push({
          remoteIndex: r,
          localIndex: l,
          confidence: 'exact',
          remoteName: remoteNames[r],
          localName: localNames[l]
        });
        localUsed.add(l);
        remoteUsed.add(r);
        break;
      }
    }
  }
  
  // Pass 2: Position matches for remaining
  for (let r = 1; r < remoteNames.length; r++) {
    if (remoteUsed.has(r) || !remoteNames[r]) continue;
    
    // Check if same position is available locally
    if (r < localNames.length && localNames[r] && !localUsed.has(r)) {
      result.matches.push({
        remoteIndex: r,
        localIndex: r,
        confidence: 'position',
        remoteName: remoteNames[r],
        localName: localNames[r]
      });
      localUsed.add(r);
      remoteUsed.add(r);
      result.needsReview = true;
    }
  }
  
  // Pass 3: Collect unmatched
  for (let r = 1; r < remoteNames.length; r++) {
    if (!remoteUsed.has(r) && remoteNames[r]) {
      result.unmatched.remote.push({
        index: r,
        name: remoteNames[r]
      });
      result.needsReview = true;
    }
  }
  
  for (let l = 1; l < localNames.length; l++) {
    if (!localUsed.has(l) && localNames[l]) {
      result.unmatched.local.push({
        index: l,
        name: localNames[l]
      });
    }
  }
  
  return result;
}

/**
 * Calculate overall match statistics
 * @param {Object} comparison - Result from compareSessionData
 * @returns {Object} Statistics
 */
function getMatchStats(comparison) {
  const stats = {
    teams: {
      total: comparison.teams.matches.length + comparison.teams.unmatched.remote.length,
      exact: comparison.teams.matches.filter(m => m.confidence === 'exact').length,
      needsReview: comparison.teams.needsReview
    },
    blocks: {
      total: comparison.blocks.matches.length + comparison.blocks.unmatched.remote.length,
      exact: comparison.blocks.matches.filter(m => m.confidence === 'exact').length,
      needsReview: comparison.blocks.needsReview
    },
    questions: {
      total: comparison.questions.matches.length + comparison.questions.unmatched.remote.length,
      exact: comparison.questions.matches.filter(m => m.confidence === 'exact').length,
      needsReview: comparison.questions.needsReview
    }
  };
  
  stats.overallNeedsReview = stats.teams.needsReview || 
                             stats.blocks.needsReview || 
                             stats.questions.needsReview;
  
  return stats;
}
```

**Success Criteria:**
- [ ] Exact name matches are found (case-insensitive)
- [ ] Position-based matches are suggested when names differ
- [ ] Unmatched items are tracked on both sides
- [ ] `needsReview` flag correctly identifies when UI is needed
- [ ] Empty/null entries are handled correctly

### Task 4.2: Implement Matching Dialog UI

**Add to `scripts/app-sync.js`:**

```javascript
/**
 * Show the name matching dialog
 * @param {Object} comparison - Result from compareSessionData
 * @returns {Promise<Object>} User-confirmed mappings or null if cancelled
 */
async function showNameMatchingDialog(comparison) {
  return new Promise((resolve) => {
    // Remove any existing dialog
    const existing = document.getElementById('sync-dialog-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'sync-dialog-overlay';
    overlay.className = 'sync-dialog-overlay';
    
    overlay.innerHTML = createMatchingDialogHTML(comparison);
    document.body.appendChild(overlay);
    
    // Store resolve function for button handlers
    window._matchingDialogResolve = resolve;
    
    // Set up event listeners
    setupMatchingDialogListeners(comparison);
  });
}

/**
 * Create HTML for matching dialog
 */
function createMatchingDialogHTML(comparison) {
  const stats = getMatchStats(comparison);
  
  return `
    <div class="sync-dialog matching-dialog">
      <h2>${t('sync.matching_title')}</h2>
      <p>${t('sync.matching_description')}</p>
      
      ${createMatchingSection('teams', t('sync.matching_teams_header'), comparison.teams)}
      ${createMatchingSection('blocks', t('sync.matching_blocks_header'), comparison.blocks)}
      ${createMatchingSection('questions', t('sync.matching_questions_header'), comparison.questions)}
      
      <div class="button-row">
        <button type="button" onclick="cancelMatching()">${t('sync.matching_skip')}</button>
        <button type="button" onclick="confirmMatching()" class="primary">${t('sync.matching_confirm')}</button>
      </div>
    </div>
  `;
}

/**
 * Create HTML for a matching section (teams, blocks, or questions)
 */
function createMatchingSection(type, title, data) {
  if (data.matches.length === 0 && data.unmatched.remote.length === 0) {
    return ''; // Nothing to show
  }
  
  let html = `
    <h3>${title}</h3>
    <table class="matching-table">
      <thead>
        <tr>
          <th>#</th>
          <th>${t('sync.matching_remote')}</th>
          <th></th>
          <th>${t('sync.matching_local')}</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  // Show matches
  for (const match of data.matches) {
    const isExact = match.confidence === 'exact';
    html += `
      <tr data-type="${type}" data-remote-index="${match.remoteIndex}">
        <td>${match.remoteIndex}</td>
        <td>${escapeHtml(match.remoteName)}</td>
        <td>→</td>
        <td>
          ${isExact ? 
            `<span class="auto-matched">${escapeHtml(match.localName)} ✓</span>` :
            createLocalSelector(type, match.remoteIndex, match.localIndex, data.unmatched.local)
          }
        </td>
      </tr>
    `;
  }
  
  // Show unmatched remote items
  for (const item of data.unmatched.remote) {
    html += `
      <tr data-type="${type}" data-remote-index="${item.index}">
        <td>${item.index}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>→</td>
        <td>
          ${createLocalSelector(type, item.index, 'new', data.unmatched.local)}
        </td>
      </tr>
    `;
  }
  
  html += '</tbody></table>';
  return html;
}

/**
 * Create dropdown selector for local match
 */
function createLocalSelector(type, remoteIndex, selectedValue, unmatchedLocal) {
  let html = `<select class="matching-select" data-type="${type}" data-remote-index="${remoteIndex}">`;
  
  // Option to create new
  html += `<option value="new" ${selectedValue === 'new' ? 'selected' : ''}>${t('sync.matching_create_new')}</option>`;
  
  // Options for unmatched local items
  for (const item of unmatchedLocal) {
    html += `<option value="${item.index}" ${selectedValue === item.index ? 'selected' : ''}>${escapeHtml(item.name)}</option>`;
  }
  
  html += '</select>';
  return html;
}

/**
 * Cancel matching and disconnect
 */
function cancelMatching() {
  const overlay = document.getElementById('sync-dialog-overlay');
  if (overlay) overlay.remove();
  
  if (window._matchingDialogResolve) {
    window._matchingDialogResolve(null);
    delete window._matchingDialogResolve;
  }
  
  // Disconnect since user cancelled
  stopSync();
}

/**
 * Confirm matching and apply mappings
 */
function confirmMatching() {
  const mappings = collectMappings();
  
  const overlay = document.getElementById('sync-dialog-overlay');
  if (overlay) overlay.remove();
  
  if (window._matchingDialogResolve) {
    window._matchingDialogResolve(mappings);
    delete window._matchingDialogResolve;
  }
}

/**
 * Collect user-selected mappings from dialog
 */
function collectMappings() {
  const mappings = {
    teams: {},
    blocks: {},
    questions: {}
  };
  
  const selects = document.querySelectorAll('.matching-select');
  selects.forEach(select => {
    const type = select.dataset.type;
    const remoteIndex = parseInt(select.dataset.remoteIndex);
    const localValue = select.value;
    
    mappings[type][remoteIndex] = localValue === 'new' ? 'new' : parseInt(localValue);
  });
  
  // Include auto-matched items
  const autoMatched = document.querySelectorAll('.auto-matched');
  autoMatched.forEach(el => {
    const row = el.closest('tr');
    const type = row.dataset.type;
    const remoteIndex = parseInt(row.dataset.remoteIndex);
    // Auto-matched items keep their index
    mappings[type][remoteIndex] = remoteIndex;
  });
  
  return mappings;
}

/**
 * Set up event listeners for matching dialog
 */
function setupMatchingDialogListeners(comparison) {
  // Could add live preview of changes here
}
```

**Success Criteria:**
- [ ] Dialog shows all categories (Teams, Blocks, Questions)
- [ ] Exact matches show with checkmark (no dropdown)
- [ ] Non-exact matches show dropdown with options
- [ ] Unmatched remote items show with "Create New" option
- [ ] Cancel button disconnects and closes dialog
- [ ] Confirm button collects mappings and continues sync
- [ ] Mappings object has correct structure

### Task 4.3: Apply Mappings Before Sync

**Add to `scripts/app-sync.js`:**

```javascript
/**
 * Apply name mappings to synchronize data structure
 * @param {Object} mappings - User-confirmed mappings
 * @param {Y.Doc} sessionDoc - Session document to modify
 */
function applyMappings(mappings, sessionDoc) {
  sessionDoc.transact(() => {
    const session = sessionDoc.getMap('session');
    
    // Apply team mappings
    if (mappings.teams) {
      applyArrayMappings(session.get('teams'), mappings.teams);
    }
    
    // Apply block mappings
    if (mappings.blocks) {
      applyArrayMappings(session.get('blocks'), mappings.blocks);
    }
    
    // Apply question mappings
    // Questions are more complex - need to handle team scores within each question
    if (mappings.questions) {
      applyQuestionMappings(session.get('questions'), mappings.questions, mappings.teams);
    }
  });
}

/**
 * Apply mappings to a Y.Array
 * @param {Y.Array} yarray - Yjs array to modify
 * @param {Object} mappings - Index mappings (remoteIndex -> localIndex or 'new')
 */
function applyArrayMappings(yarray, mappings) {
  // This is called on the joining peer to restructure their local data
  // to match the remote structure
  
  // For 'new' items, we'll need to insert placeholders
  // For mapped items, we may need to reorder
  
  // Implementation depends on desired merge behavior
  // For now, we'll trust the CRDT to handle merges
  console.log('Applying mappings:', mappings);
}

/**
 * Apply question mappings, including team score reordering
 */
function applyQuestionMappings(questions, questionMappings, teamMappings) {
  // Questions are indexed by position
  // Team scores within questions need to follow team mappings
  console.log('Applying question mappings:', questionMappings);
}
```

**Success Criteria:**
- [ ] Mappings are applied within a Yjs transaction
- [ ] Team reordering updates all question team scores
- [ ] New items are created in correct positions
- [ ] Existing data is preserved where mapped

### Phase 4 Tests

**File:** `tests/unit/sync-matching.test.js`

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Sync Matching', () => {
  describe('compareArrays', () => {
    it('should find exact name matches', () => {
      const local = [null, 'Eagles', 'Hawks', 'Lions'];
      const remote = [null, 'Eagles', 'Hawks', 'Lions'];
      
      // Test exact matching
    });
    
    it('should be case-insensitive', () => {
      const local = [null, 'Eagles', 'HAWKS'];
      const remote = [null, 'eagles', 'Hawks'];
      
      // Test case insensitivity
    });
    
    it('should detect position-only matches', () => {
      const local = [null, 'Team A', 'Team B'];
      const remote = [null, 'Eagles', 'Hawks'];
      
      // Test position matching
    });
    
    it('should track unmatched items', () => {
      const local = [null, 'Eagles'];
      const remote = [null, 'Eagles', 'Hawks', 'Lions'];
      
      // Test unmatched tracking
    });
    
    it('should handle empty arrays', () => {
      const local = [null];
      const remote = [null];
      
      // Test empty case
    });
  });
  
  describe('getMatchStats', () => {
    it('should calculate correct totals', () => {
      // Test statistics calculation
    });
    
    it('should set needsReview flag correctly', () => {
      // Test review flag
    });
  });
});
```

### Phase 4 Completion Checklist

- [ ] Matching algorithm finds exact matches
- [ ] Matching algorithm suggests position matches
- [ ] Matching algorithm tracks unmatched items
- [ ] Dialog displays all categories
- [ ] Dialog shows dropdowns for non-exact matches
- [ ] Cancel disconnects from room
- [ ] Confirm applies mappings
- [ ] Mappings are applied via Yjs transaction
- [ ] Tests for matching logic pass
- [ ] Manual testing: join room with different names

---

## Phase 5: Session Switching & Sync Behavior

### Objective
Handle session switching while synced - disconnect from sync when switching sessions since one room = one session.

### Dependencies
- Phase 4 complete

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/app-sync.js` | MODIFY | Handle session switch behavior |
| `scripts/app-state.js` | MODIFY | Notify sync of session changes |

### Task 5.1: Disconnect on Session Switch

Since one room always corresponds to one session, switching sessions requires disconnecting from the current sync room.

**Modify `scripts/app-sync.js`:**

```javascript
/**
 * Handle session switch while synced
 * Disconnects from current room since 1 room = 1 session
 * @param {string} newSessionId - New session's UUID
 */
function handleSessionSwitch(newSessionId) {
  if (SyncManager.state !== 'connected') {
    return; // Not synced, nothing to do
  }
  
  console.log('Session switched while synced, disconnecting...');
  
  // Notify user
  showToast(t('sync.session_switch_disconnect'));
  announceToScreenReader(t('sync.session_switch_disconnect'));
  
  // Disconnect from current room
  stopSync();
}

/**
 * Check if we should sync the current session
 * @returns {boolean} True if sync should be active
 */
function shouldSyncCurrentSession() {
  return SyncManager.state === 'connected' && 
         SyncManager.provider !== null;
}

/**
 * Get the synced session's ID
 * @returns {string|null} Session ID being synced, or null
 */
function getSyncedSessionId() {
  if (!shouldSyncCurrentSession()) return null;
  return SyncManager.syncedSessionId;
}
```

**Success Criteria:**
- [ ] Session switch disconnects from sync
- [ ] User is notified of disconnect
- [ ] No errors during session switch
- [ ] Sync button shows offline state after switch

### Task 5.2: Integrate with Session Switching

**Modify `scripts/app-state.js`:**

In the `switchSession` function, add sync notification:

```javascript
/**
 * Switch to a different session
 * @param {string} sessionId - UUID of session to switch to
 */
async function switchSession(sessionId) {
  const oldSessionId = DocManager.activeSessionId;
  
  // Notify sync module before switching
  if (typeof handleSessionSwitch === 'function' && oldSessionId !== sessionId) {
    handleSessionSwitch(sessionId);
  }
  
  // ... existing session switch logic ...
}
```

**Success Criteria:**
- [ ] Session switch triggers sync disconnect
- [ ] User informed of disconnect
- [ ] App remains stable after disconnect

### Task 5.3: Session Info in Sync State

**Modify `scripts/app-sync.js`:**

Track which session is synced:

```javascript
// Add to SyncManager object
SyncManager.syncedSessionId = null;

// In startSync, after connecting:
SyncManager.syncedSessionId = getActiveSessionId();

// In stopSync:
SyncManager.syncedSessionId = null;

/**
 * Get current synced session name for display
 */
function getSyncSessionName() {
  if (!shouldSyncCurrentSession()) return null;
  
  const sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) return null;
  
  const session = sessionDoc.getMap('session');
  return session ? session.get('name') : null;
}
  
  const sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) return null;
  
  const session = sessionDoc.getMap('session');
  return session ? session.get('name') : null;
}
```

**Update `updateSyncUI` to show session name:**

```javascript
function updateSyncUI() {
  // ... existing code ...
  
  // Show which session is being synced
  if (SyncManager.state === 'connected') {
    const sessionName = getSyncSessionName();
    // Could display this in tooltip or status
  }
}
```

**Success Criteria:**
- [ ] Current synced session name is accessible
- [ ] UI can show which session is synced
- [ ] Session name updates on switch

### Phase 5 Tests

**File:** `tests/unit/sync-sessions.test.js`

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Sync Sessions', () => {
  describe('handleSessionSwitch', () => {
    it('should do nothing if not connected', () => {
      // Test early exit when offline
    });
    
    it('should disconnect from sync when switching sessions', () => {
      // Test that stopSync is called
    });
    
    it('should notify user of disconnect', () => {
      // Test toast/announcement is shown
    });
  });
  
  describe('getSyncedSessionId', () => {
    it('should return null when not connected', () => {
      // Test null return
    });
    
    it('should return session ID when connected', () => {
      // Test ID return
    });
  });
  
  describe('getSyncSessionName', () => {
    it('should return null when not connected', () => {
      // Test null return
    });
    
    it('should return session name when connected', () => {
      // Test name return
    });
  });
});
```

### Phase 5 Completion Checklist

- [ ] Session switch disconnects from sync
- [ ] User is notified of disconnect on session switch
- [ ] Synced session ID is tracked
- [ ] Session name available for UI display
- [ ] No memory leaks on session switch
- [ ] Tests pass
- [ ] Manual testing: switch sessions while synced

---

## Phase 6: Polish & Testing

### Objective
Handle edge cases, improve error handling, add comprehensive tests, and update documentation.

### Dependencies
- Phases 1-5 complete

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/app-sync.js` | MODIFY | Error handling, edge cases |
| `AGENTS.md` | MODIFY | Add sync documentation |
| `tests/` | CREATE | Comprehensive test suite |

### Task 6.1: Error Handling

**Add to `scripts/app-sync.js`:**

```javascript
/**
 * Error types for sync operations
 */
const SyncError = {
  CONNECTION_FAILED: 'connection_failed',
  TIMEOUT: 'timeout',
  INVALID_ROOM: 'invalid_room',
  SESSION_NOT_FOUND: 'session_not_found',
  NETWORK_ERROR: 'network_error'
};

/**
 * Handle sync errors gracefully
 * @param {Error} error - Error object
 * @param {string} context - Where the error occurred
 */
function handleSyncError(error, context) {
  console.error(`Sync error in ${context}:`, error);
  
  SyncManager.state = 'error';
  updateSyncUI();
  
  // Determine error type and show appropriate message
  let message = t('sync.connection_failed');
  
  if (error.message.includes('timeout')) {
    message = t('sync.error_timeout');
  } else if (error.message.includes('network')) {
    message = t('sync.error_network');
  }
  
  // Show error to user (could use toast notification)
  if (SyncManager.onError) {
    SyncManager.onError(error, context);
  }
}

/**
 * Retry connection with exponential backoff
 * @param {number} attempt - Current attempt number
 */
async function retryConnection(attempt) {
  const maxAttempts = SyncManager.config.maxReconnectAttempts;
  
  if (attempt >= maxAttempts) {
    console.log('Max reconnection attempts reached');
    SyncManager.state = 'error';
    updateSyncUI();
    return;
  }
  
  const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
  console.log(`Retry attempt ${attempt + 1} in ${delay}ms`);
  
  setTimeout(async () => {
    try {
      await startSync(SyncManager.displayName, SyncManager.roomCode);
    } catch (error) {
      retryConnection(attempt + 1);
    }
  }, delay);
}
```

**Success Criteria:**
- [ ] Errors are caught and logged
- [ ] User sees appropriate error messages
- [ ] Retry with exponential backoff works
- [ ] Max retry limit is respected
- [ ] Error state is reflected in UI

### Task 6.2: Edge Cases

**Handle these scenarios:**

1. **User closes browser while synced**
   - Provider cleanup happens automatically
   - Other peers see user leave

2. **Network disconnection**
   - Detect offline state
   - Queue local changes
   - Reconnect when online
   - CRDT merges changes

3. **Signaling server down**
   - Fall back to secondary server
   - Retry with backoff
   - Show error after all servers fail

4. **Peer leaves during name matching**
   - Close dialog gracefully
   - Show notification
   - Allow retry

5. **Session deleted while synced**
   - Disconnect from room
   - Show notification
   - Clear sync state

**Success Criteria:**
- [ ] All edge cases handled gracefully
- [ ] No JavaScript errors in console
- [ ] User informed of issues
- [ ] App remains usable

### Task 6.3: Add i18n Error Messages

**Add to i18n files:**

```javascript
"sync": {
  // ... existing keys ...
  "error_timeout": "Connection timed out. Please try again.",
  "error_network": "Network error. Check your connection.",
  "error_server_down": "Sync servers unavailable. Try again later.",
  "error_session_deleted": "Session was deleted. Disconnecting from sync.",
  "error_peer_left": "{{name}} disconnected.",
  "reconnecting": "Reconnecting...",
  "reconnect_failed": "Failed to reconnect. Click to retry.",
  "session_switch_disconnect": "Switched sessions. Disconnected from sync room.",
  "copy_code": "Copy Code",
  "code_copied": "Room code copied to clipboard",
  "aria_room_created": "Room created with code {{code}}"
}
```

### Task 6.4: Accessibility Requirements

**Ensure all sync UI meets WCAG 2.1 AA standards:**

#### Keyboard Navigation
- All dialogs must be fully keyboard accessible
- Focus trap within modal dialogs
- Escape key closes dialogs
- Tab order follows visual layout
- Focus returns to trigger element when dialog closes

#### Screen Reader Support
- All dialogs have `role="dialog"` and `aria-modal="true"`
- Dialog titles linked via `aria-labelledby`
- Form inputs have associated labels
- Error messages use `role="alert"` for immediate announcement
- Peer join/leave events announced via ARIA live region
- Status changes announced (connecting, connected, error)

#### Visual Requirements
- Focus indicators visible (2px outline minimum)
- Color contrast meets 4.5:1 ratio
- Text resizable to 200% without loss of functionality
- No information conveyed by color alone
- Decorative icons use `aria-hidden="true"`

#### Implementation Checklist

```javascript
// Add to showSyncDialog() - focus management
function showSyncDialog() {
  // ... existing code ...
  
  // Trap focus within dialog
  trapFocus(overlay);
  
  // Store previously focused element
  SyncManager.previousFocus = document.activeElement;
}

function closeSyncDialog() {
  // ... existing code ...
  
  // Return focus to trigger
  if (SyncManager.previousFocus) {
    SyncManager.previousFocus.focus();
    SyncManager.previousFocus = null;
  }
}

/**
 * Trap focus within an element
 * @param {HTMLElement} element - Container to trap focus within
 */
function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];
  
  element.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  });
}
```

**Required CSS:**

```css
/* Already added in Task 1.5 CSS updates */
.visually-hidden { /* For screen-reader-only content */ }
.sync-dialog button:focus,
.sync-dialog input:focus { /* Visible focus indicators */ }
```

**Success Criteria:**
- [ ] All dialogs keyboard navigable
- [ ] Focus trapped in modal dialogs
- [ ] Focus returns to trigger on close
- [ ] Screen reader announces state changes
- [ ] Screen reader announces peer join/leave
- [ ] All form inputs have labels
- [ ] Error messages announced immediately
- [ ] Focus indicators visible
- [ ] Tested with VoiceOver (macOS) or NVDA (Windows)

### Task 6.5: Update AGENTS.md

**Add sync section to AGENTS.md:**

```markdown
## WebRTC Sync Architecture

### Overview

Real-time peer-to-peer synchronization using WebRTC and Yjs awareness protocol.

### Components

- `SyncManager` in `app-sync.js` - Central sync controller
- `WebrtcProvider` from y-webrtc - WebRTC connection management
- Awareness protocol - Presence and display names

### Room System

- 6-character room codes (e.g., "ABC123")
- One room = one session (always)
- Room names: `pbe-sync-{code}`
- Switching sessions disconnects from sync
- Optional password protection (unchecked by default)

### Signaling Servers

Minimum 3 servers for redundancy:
- Primary: `wss://y-webrtc-pbe.fly.dev`
- Backup 1: `wss://signaling.yjs.dev`
- Backup 2: `wss://y-webrtc-signaling-us.herokuapp.com`

### Join Behavior

When joining an existing room:
1. User chooses: Create new session (default) or Merge into current
2. If merging, name matching dialog appears if differences detected
3. Auto-match by exact name (case-insensitive)
4. Manual resolution for unmatched items

### Username Collision Handling

- Duplicate display names get auto-suffixed: "Alice" → "Alice (2)"
- User notified via toast when name is changed
- Checked both on join and when peers change

### History Attribution

All history entries include `user` field:
- Connected users: display name
- Local/offline: null (shown as "(local)")

### Accessibility

- All dialogs keyboard accessible with focus trap
- Screen reader announcements for state changes
- ARIA live regions for peer join/leave
- Visible focus indicators

### Testing

- Unit tests: `tests/unit/sync-*.test.js`
- UI tests: `tests/ui/sync-*.test.js`
- Manual testing required for WebRTC functionality
- Accessibility testing with screen readers
```

### Task 6.6: Comprehensive Test Suite

**Create test files:**

1. `tests/unit/sync-core.test.js` - Core functions (Phase 1)
2. `tests/unit/sync-presence.test.js` - Presence management (Phase 2)
3. `tests/unit/sync-connection.test.js` - Connection logic (Phase 3)
4. `tests/unit/sync-matching.test.js` - Name matching (Phase 4)
5. `tests/unit/sync-sessions.test.js` - Session handling (Phase 5)
6. `tests/ui/sync-dialog.test.js` - Dialog UI (Phase 2)
7. `tests/ui/sync-indicator.test.js` - Status indicator UI
8. `tests/ui/sync-accessibility.test.js` - Accessibility tests

**Test Coverage Requirements:**
- [ ] All public functions have tests
- [ ] Edge cases covered
- [ ] Error conditions tested
- [ ] UI interactions tested
- [ ] Keyboard navigation tested
- [ ] Focus management tested

### Phase 6 Completion Checklist

- [ ] Error handling implemented
- [ ] Retry logic with backoff works
- [ ] All edge cases handled
- [ ] i18n error messages added (all languages)
- [ ] AGENTS.md updated with sync docs
- [ ] Full test suite created
- [ ] All tests pass
- [ ] Manual testing complete:
  - [ ] Create room
  - [ ] Join room
  - [ ] Name matching dialog
  - [ ] Session switching while synced
  - [ ] Disconnect/reconnect
  - [ ] Network offline/online
  - [ ] Multiple peers (3+)
  - [ ] Browser refresh
  - [ ] Close and reopen browser

---

## Final Verification

### Branch Status

Before merging, verify:
```bash
# Confirm you're on the feature branch
git branch --show-current
# Should output: feature/webrtc-sync

# Check all changes are committed
git status
# Should show clean working tree
```

### All Tests Pass

```bash
node --test
```

Expected: All existing tests + all new sync tests pass.

### Signaling Server Verification

```bash
# Verify minimum 3 servers are configured
node -e "const s = require('./scripts/app-sync.js'); console.log('Servers:', s.SyncManager.config.signalingServers.length)"
# Should output: Servers: 3 (or more)
```

### Manual Test Checklist

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Create Room | Click Sync → Enter name → Create | Room code displayed |
| Join Room | Click Sync → Enter name → Enter code → Join | Connected to room |
| Peer Count | Two browsers in same room | Shows "2 people editing" |
| Peer Hover | Hover over peer count | Shows both names |
| Name Matching | Join with different team names | Matching dialog appears |
| Auto-Match | Join with same team names | No dialog, syncs immediately |
| Disconnect | Click Sync → Disconnect | Returns to offline state |
| Refresh | Refresh while connected | Auto-reconnects |
| Offline | Go offline while connected | Shows disconnected, queues changes |
| Reconnect | Go back online | Auto-reconnects, merges changes |
| Session Switch | Switch sessions while synced | Reconnects to new session room |
| History | Make change while synced | Shows user name in history |

### Merge to Main

Only after ALL above checks pass:

```bash
# Switch to main
git checkout main
git pull origin main

# Merge feature branch
git merge feature/webrtc-sync

# Push to remote
git push origin main

# Optional: Delete feature branch
git branch -d feature/webrtc-sync
git push origin --delete feature/webrtc-sync
```

### Documentation Complete

- [ ] AGENTS.md updated
- [ ] All i18n strings documented
- [ ] Code comments complete
- [ ] JSDoc for all public functions

---

## Appendix: Data Structures

### SyncManager State

```javascript
{
  state: 'offline' | 'connecting' | 'connected' | 'error',
  roomCode: string | null,
  displayName: string | null,
  password: string | null,         // NOT persisted to localStorage
  syncedSessionId: string | null,  // Session ID being synced
  provider: WebrtcProvider | null,
  awareness: Awareness | null,
  previousFocus: Element | null,   // For focus management
  peers: Map<clientId, { displayName, color, lastSeen }>,
  config: {
    signalingServers: string[],    // Minimum 3 required
    minSignalingServers: 3,
    roomPrefix: 'pbe-sync-',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  },
  // Callbacks
  onStateChange: Function | null,
  onPeersChange: Function | null,
  onError: Function | null
}
```

### localStorage Keys

| Key | Value | Purpose |
|-----|-------|---------|
| `pbe-sync-room` | Room code | Persist room for auto-reconnect |
| `pbe-sync-displayName` | Display name | Remember user's name |

**Note:** Password is NOT stored in localStorage for security. Users must re-enter the password when reconnecting to a password-protected room.

### Room Naming

Room names use a simple format since one room = one session:
```
pbe-sync-{ROOMCODE}
```

Example: Room code `ABC123` → WebRTC room name `pbe-sync-ABC123`

### Join Choice Options

| Choice | Behavior |
|--------|----------|
| `new` | Create a new local session named "Synced: {ROOMCODE}" and sync room data into it |
| `merge` | Merge room data into current session (triggers name matching if differences) |
| `create` | Creating a new room (uses current session) |

### History Entry (Enhanced)

```javascript
{
  timestamp: number,
  sessionName: string,
  action: string,
  details: string,
  user: string | null  // null for local/offline changes
}
```

### Matching Result

```javascript
{
  teams: {
    matches: [{ remoteIndex, localIndex, confidence, remoteName, localName }],
    unmatched: { local: [{ index, name }], remote: [{ index, name }] },
    needsReview: boolean
  },
  blocks: { /* same structure */ },
  questions: { /* same structure */ }
}
```

### Mappings Object

```javascript
{
  teams: { [remoteIndex]: localIndex | 'new' },
  blocks: { [remoteIndex]: localIndex | 'new' },
  questions: { [remoteIndex]: localIndex | 'new' }
}
```
