# Session Merge Implementation Design

## Overview
Enable merging multiple independent recordings of the same sporting event where different scorers may have tracked different teams, questions, or time periods.

## Design Decisions

### 1. Team/Block Alignment Strategy
**Decision:** Fuzzy match with user confirmation

- Match team and block names case-insensitively
- Handle minor variations (e.g., "Team 1" vs "team 1" vs "TEAM 1")
- Show mapping UI for ambiguous cases
- Require user confirmation before applying alignment
- Prevent misalignment from similar but different names

### 2. Conflict Resolution Strategy
**Decision:** Last modified wins with option to review conflicts before committing

- Requires adding `lastModified` timestamp to individual score objects
- Default behavior: score with most recent timestamp wins automatically
- Provide pre-merge conflict review UI showing:
  - All detected conflicts
  - Both values with timestamps
  - Which value would win by default
- Allow user to override default resolution for any conflict
- Only commit merge after user reviews and approves

### 3. UUID Handling
**Decision:** Generate new UUID and delete original sessions

- Merged session gets a fresh UUID (not source or target)
- Both source and target sessions are deleted after successful merge
- Creates clean "new" session representing the combined event
- Prevents confusion about which session is "canonical"
- User can export both originals before merging if backup needed

### 4. Score-Level Timestamps
**Decision:** Yes - add modification tracking to score objects

**New score structure:**
```javascript
teamScore (Y.Map) {
  score: number
  extraCredit: number
  lastModified: number        // NEW: timestamp of last edit
  deviceId: string           // NEW: identifier for tracking source
}
```

**Benefits:**
- Enables "last modified wins" conflict resolution
- Supports future "show what changed since last merge" features
- Allows tracking which device/scorer made each entry
- Provides audit trail for parallel recordings
- Minimal storage overhead (~16 bytes per score)

**Implementation notes:**
- Backwards compatible: existing scores without timestamps get migration value
- Update all score modification functions to set `lastModified`
- Generate/persist `deviceId` on first app load (UUID stored in localStorage)

## Architecture

### New Module: scripts/app-merge.js

**Key Functions:**
- `initiateMerge(sourceId, targetId)` - Entry point, validates sessions
- `analyzeSessionsForMerge(source, target)` - Pre-merge structural analysis
- `alignStructuresByName(source, target)` - Fuzzy matching for teams/blocks
- `detectScoreConflicts(source, target, mappings)` - Find conflicting scores
- `showMergePreviewUI(analysis, conflicts)` - Review UI before committing
- `executeMerge(sourceId, targetId, resolutions)` - Perform merge transaction
- `cleanupAfterMerge(sourceId, targetId, newId)` - Delete originals

### UI Components

**Merge Dialog** (in index.html):
- Session selector dropdowns (source + target)
- "Analyze" button to run pre-merge checks
- Conflict review table showing:
  - Team name
  - Question name
  - Source value (with timestamp)
  - Target value (with timestamp)
  - Resolution (dropdown: use source/target/custom)
- "Execute Merge" button (enabled after review)

### Data Migration

**Existing sessions without timestamps:**
- On first load with new version, scan all scores
- Add `lastModified: session.get('lastModified')` to all existing scores
- Add `deviceId: 'legacy'` to existing scores
- Preserve all existing data without loss

## Testing Strategy

**Test Coverage Required:**
1. Sparse data merge (non-overlapping scores)
2. Identical scores (no conflicts)
3. Conflicting scores (different values, resolve by timestamp)
4. Structural alignment (different team/block names)
5. One-way data (source has data target doesn't)
6. History preservation from both sessions
7. UUID generation and cleanup
8. Backwards compatibility with non-timestamped scores
9. User overrides default conflict resolution
10. Cancelled merge (no changes applied)

## Implementation Order

1. Add `lastModified` and `deviceId` fields to score updates
2. Implement data migration for existing sessions
3. Build structural alignment logic (fuzzy matching)
4. Create conflict detection algorithm
5. Design and implement merge preview UI
6. Implement merge execution with transaction
7. Add cleanup and history logging
8. Write comprehensive test suite
9. Update documentation

## Future Enhancements

- Three-way merge support (keep both originals)
- Selective merge (choose specific questions/teams to merge)
- Merge history tracking (record all merges performed)
- Export merged session immediately after merge
- Undo last merge operation
- Batch merge multiple sessions at once
