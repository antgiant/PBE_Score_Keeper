/**
 * Snapshot Validation Infrastructure
 * 
 * Provides utilities for capturing session state snapshots and comparing them
 * before/after migration to ensure data integrity and calculation consistency.
 * 
 * Used for:
 * 1. Pre-migration validation (capture before, compare after)
 * 2. Ongoing calculation regression testing
 * 3. Cross-version compatibility validation
 */

/**
 * Captures a complete snapshot of a session's state including raw data and calculated values.
 * 
 * @param {string} sessionId - The UUID of the session to snapshot
 * @returns {Object} Complete session snapshot with raw data, calculated values, and metadata
 */
function captureSessionSnapshot(sessionId) {
  const sessionDoc = typeof getSessionDoc === 'function' ? getSessionDoc(sessionId) : null;
  if (!sessionDoc) {
    console.error('Cannot capture snapshot: session not found', sessionId);
    return null;
  }

  const session = sessionDoc.getMap('session');
  if (!session) {
    console.error('Cannot capture snapshot: session map not found', sessionId);
    return null;
  }

  const snapshot = {
    meta: {
      capturedAt: new Date().toISOString(),
      snapshotVersion: 1,
      sessionId: sessionId,
      sessionName: session.get('name') || '',
      dataVersion: session.get('dataVersion') || 'unknown'
    },
    raw: captureRawData(session),
    calculated: captureCalculatedValues(sessionId),
    display: captureDisplayValues(session)
  };

  return snapshot;
}

/**
 * Captures the raw CRDT data from a session.
 * This includes teams, questions, blocks, config, and history.
 * Uses v5 UUID-based session structure.
 * 
 * @param {Y.Map} session - The session Y.Map
 * @returns {Object} Raw data extracted from Y.Maps/Y.Arrays
 */
function captureRawData(session) {
  const raw = {
    teams: [],
    questions: [],
    blocks: [],
    config: {},
    history: []
  };

  const teamsById = session.get('teamsById');
  const teamOrder = session.get('teamOrder');
  
  // Capture teams (using order array)
  if (teamsById && teamOrder) {
    for (let i = 0; i < teamOrder.length; i++) {
      const teamId = teamOrder.get(i);
      const team = teamsById.get(teamId);
      if (team && !team.get('deleted')) {
        raw.teams.push({
          index: i,
          id: teamId,
          name: team.get('name') || ''
        });
      }
    }
  }
  
  // Capture blocks
  const blocksById = session.get('blocksById');
  const blockOrder = session.get('blockOrder');
  if (blocksById && blockOrder) {
    for (let i = 0; i < blockOrder.length; i++) {
      const blockId = blockOrder.get(i);
      const block = blocksById.get(blockId);
      if (block && !block.get('deleted')) {
        raw.blocks.push({
          index: i,
          id: blockId,
          name: block.get('name') || ''
        });
      }
    }
  }
  
  // Capture questions - sorted by numeric ID
  const questionsById = session.get('questionsById');
  if (questionsById && questionsById.size > 0) {
    // Get question IDs and sort by numeric part
    const questionIds = Array.from(questionsById.keys()).sort((a, b) => {
      const numA = parseInt(a.replace('q-', ''), 10) || 0;
      const numB = parseInt(b.replace('q-', ''), 10) || 0;
      return numA - numB;
    });
    
    questionIds.forEach((questionId, idx) => {
      const question = questionsById.get(questionId);
      if (question) {
        const questionData = {
          index: idx,
          id: questionId,
          score: question.get('score') || 0,
          blockId: question.get('blockId') || '',
          ignore: question.get('ignore') || false,
          teamScores: []
        };
        
        const teamScores = question.get('teamScores');
        if (teamScores && teamsById && teamOrder) {
          // Include team scores in the order of teamOrder
          for (let j = 0; j < teamOrder.length; j++) {
            const teamId = teamOrder.get(j);
            const team = teamsById.get(teamId);
            if (team && !team.get('deleted')) {
              const scoreData = teamScores.get(teamId);
              if (scoreData) {
                questionData.teamScores.push({
                  teamIndex: j,
                  teamId: teamId,
                  score: scoreData.get('score') || 0,
                  extraCredit: scoreData.get('extraCredit') || 0
                });
              }
            }
          }
        }
        
        raw.questions.push(questionData);
      }
    });
  }

  // Capture config
  const config = session.get('config');
  if (config) {
    raw.config = {
      rounding: config.get('rounding') || false
    };
  }

  // Capture history (last 50 entries for validation)
  const history = session.get('history') || session.get('historyLog');
  if (history && history.length) {
    const historyCount = Math.min(history.length, 50);
    for (let i = history.length - historyCount; i < history.length; i++) {
      const entry = history.get(i);
      if (entry) {
        raw.history.push({
          index: i,
          action: entry.get('action') || '',
          details: entry.get('details') || '',
          timestamp: entry.get('timestamp') || 0,
          user: entry.get('user') || null
        });
      }
    }
  }

  return raw;
}

/**
 * Captures calculated values by running the summary functions.
 * These are the values that must be preserved after migration.
 * 
 * @param {string} sessionId - The session ID (used to ensure correct session context)
 * @returns {Object} Calculated summary values
 */
function captureCalculatedValues(sessionId) {
  // Note: These functions use get_current_session() internally
  // In a multi-session context, we need to ensure the correct session is active
  // For now, assume the caller has set the correct session context

  const calculated = {
    teamScoreSummary: null,
    blockScoreSummary: null,
    teamAndBlockScoreSummary: null,
    questionLog: null
  };

  try {
    // Capture team score summary (handles rounding modes)
    if (typeof get_team_score_summary === 'function') {
      calculated.teamScoreSummary = get_team_score_summary();
    }

    // Capture block score summary
    if (typeof get_block_score_summary === 'function') {
      calculated.blockScoreSummary = get_block_score_summary();
    }

    // Capture team and block combined summary
    if (typeof get_team_and_block_score_summary === 'function') {
      calculated.teamAndBlockScoreSummary = get_team_and_block_score_summary();
    }

    // Capture question log
    if (typeof get_question_log === 'function') {
      calculated.questionLog = get_question_log();
    }
  } catch (error) {
    console.error('Error capturing calculated values:', error);
  }

  return calculated;
}

/**
 * Captures display-ready values (counts, names, etc.)
 * 
 * @param {Y.Map} session - The session Y.Map
 * @returns {Object} Display values
 */
function captureDisplayValues(session) {
  const display = {
    teamNames: [],
    blockNames: [],
    questionNames: [],
    teamCount: 0,
    blockCount: 0,
    questionCount: 0
  };

  try {
    // Use existing getter functions if available
    if (typeof get_team_names === 'function') {
      display.teamNames = get_team_names();
      display.teamCount = display.teamNames.length - 1; // Exclude placeholder
    }

    if (typeof get_block_names === 'function') {
      display.blockNames = get_block_names();
      display.blockCount = display.blockNames.length - 1; // Exclude placeholder
    }

    if (typeof get_question_names === 'function') {
      display.questionNames = get_question_names();
      display.questionCount = display.questionNames.length - 1; // Exclude placeholder
    }
  } catch (error) {
    console.error('Error capturing display values:', error);
  }

  return display;
}

/**
 * Compares two snapshots and returns a detailed diff.
 * 
 * @param {Object} before - The "before" snapshot
 * @param {Object} after - The "after" snapshot
 * @param {Object} options - Comparison options
 * @param {boolean} options.ignoreTimestamps - Whether to ignore timestamp differences (default: true)
 * @param {boolean} options.ignoreHistoryOrder - Whether to ignore history entry order (default: false)
 * @returns {Object} Comparison result with match status and detailed differences
 */
function compareSnapshots(before, after, options = {}) {
  const {
    ignoreTimestamps = true,
    ignoreHistoryOrder = false
  } = options;

  const result = {
    match: true,
    differences: [],
    warnings: [],
    summary: {
      rawDataMatch: true,
      calculatedMatch: true,
      displayMatch: true
    }
  };

  if (!before || !after) {
    result.match = false;
    result.differences.push({
      type: 'error',
      path: 'snapshot',
      message: 'One or both snapshots are null/undefined'
    });
    return result;
  }

  // Compare raw data
  compareRawData(before.raw, after.raw, result, ignoreTimestamps);

  // Compare calculated values (most critical for user experience)
  compareCalculatedValues(before.calculated, after.calculated, result);

  // Compare display values
  compareDisplayValues(before.display, after.display, result);

  // Update summary
  result.summary.rawDataMatch = !result.differences.some(d => d.path.startsWith('raw.'));
  result.summary.calculatedMatch = !result.differences.some(d => d.path.startsWith('calculated.'));
  result.summary.displayMatch = !result.differences.some(d => d.path.startsWith('display.'));
  result.match = result.differences.length === 0;

  return result;
}

/**
 * Compares raw data between snapshots.
 */
function compareRawData(before, after, result, ignoreTimestamps) {
  if (!before || !after) {
    result.differences.push({
      type: 'error',
      path: 'raw',
      message: 'Raw data missing from one or both snapshots'
    });
    return;
  }

  // Compare teams
  snapshotCompareArrays(before.teams, after.teams, 'raw.teams', result, (a, b) => {
    return a.name === b.name;
  });

  // Compare blocks
  snapshotCompareArrays(before.blocks, after.blocks, 'raw.blocks', result, (a, b) => {
    return a.name === b.name;
  });

  // Compare questions (more complex - includes team scores)
  if (before.questions.length !== after.questions.length) {
    result.differences.push({
      type: 'count',
      path: 'raw.questions',
      before: before.questions.length,
      after: after.questions.length,
      message: `Question count changed: ${before.questions.length} → ${after.questions.length}`
    });
  } else {
    for (let i = 0; i < before.questions.length; i++) {
      const qBefore = before.questions[i];
      const qAfter = after.questions[i];

      if (qBefore.score !== qAfter.score) {
        result.differences.push({
          type: 'value',
          path: `raw.questions[${i}].score`,
          before: qBefore.score,
          after: qAfter.score
        });
      }

      if (qBefore.block !== qAfter.block) {
        result.differences.push({
          type: 'value',
          path: `raw.questions[${i}].block`,
          before: qBefore.block,
          after: qAfter.block
        });
      }

      if (qBefore.ignore !== qAfter.ignore) {
        result.differences.push({
          type: 'value',
          path: `raw.questions[${i}].ignore`,
          before: qBefore.ignore,
          after: qAfter.ignore
        });
      }

      // Compare team scores within questions
      if (qBefore.teamScores.length !== qAfter.teamScores.length) {
        result.differences.push({
          type: 'count',
          path: `raw.questions[${i}].teamScores`,
          before: qBefore.teamScores.length,
          after: qAfter.teamScores.length
        });
      } else {
        for (let j = 0; j < qBefore.teamScores.length; j++) {
          const tsBefore = qBefore.teamScores[j];
          const tsAfter = qAfter.teamScores[j];

          if (tsBefore.score !== tsAfter.score) {
            result.differences.push({
              type: 'value',
              path: `raw.questions[${i}].teamScores[${j}].score`,
              before: tsBefore.score,
              after: tsAfter.score
            });
          }

          if (tsBefore.extraCredit !== tsAfter.extraCredit) {
            result.differences.push({
              type: 'value',
              path: `raw.questions[${i}].teamScores[${j}].extraCredit`,
              before: tsBefore.extraCredit,
              after: tsAfter.extraCredit
            });
          }
        }
      }
    }
  }

  // Compare config
  if (before.config.rounding !== after.config.rounding) {
    result.differences.push({
      type: 'value',
      path: 'raw.config.rounding',
      before: before.config.rounding,
      after: after.config.rounding
    });
  }
}

/**
 * Compares calculated values (summaries) between snapshots.
 * These are the most critical values - they affect user-visible results.
 */
function compareCalculatedValues(before, after, result) {
  if (!before || !after) {
    result.differences.push({
      type: 'error',
      path: 'calculated',
      message: 'Calculated values missing from one or both snapshots'
    });
    return;
  }

  // Compare team score summary
  compareSummaryArrays(before.teamScoreSummary, after.teamScoreSummary, 'calculated.teamScoreSummary', result);

  // Compare block score summary
  compareSummaryArrays(before.blockScoreSummary, after.blockScoreSummary, 'calculated.blockScoreSummary', result);

  // Compare team and block summary
  compareSummaryArrays(before.teamAndBlockScoreSummary, after.teamAndBlockScoreSummary, 'calculated.teamAndBlockScoreSummary', result);

  // Compare question log
  compareSummaryArrays(before.questionLog, after.questionLog, 'calculated.questionLog', result);
}

/**
 * Compares display values between snapshots.
 */
function compareDisplayValues(before, after, result) {
  if (!before || !after) {
    result.differences.push({
      type: 'error',
      path: 'display',
      message: 'Display values missing from one or both snapshots'
    });
    return;
  }

  // Compare counts
  if (before.teamCount !== after.teamCount) {
    result.differences.push({
      type: 'value',
      path: 'display.teamCount',
      before: before.teamCount,
      after: after.teamCount
    });
  }

  if (before.blockCount !== after.blockCount) {
    result.differences.push({
      type: 'value',
      path: 'display.blockCount',
      before: before.blockCount,
      after: after.blockCount
    });
  }

  if (before.questionCount !== after.questionCount) {
    result.differences.push({
      type: 'value',
      path: 'display.questionCount',
      before: before.questionCount,
      after: after.questionCount
    });
  }

  // Compare name arrays
  snapshotCompareArrays(before.teamNames, after.teamNames, 'display.teamNames', result, (a, b) => a === b);
  snapshotCompareArrays(before.blockNames, after.blockNames, 'display.blockNames', result, (a, b) => a === b);
}

/**
 * Helper to compare arrays with a custom equality function.
 */
function snapshotCompareArrays(before, after, path, result, equalsFn) {
  if (!before || !after) {
    result.differences.push({
      type: 'error',
      path: path,
      message: 'Array missing from one or both snapshots'
    });
    return;
  }

  if (before.length !== after.length) {
    result.differences.push({
      type: 'count',
      path: path,
      before: before.length,
      after: after.length,
      message: `Array length changed: ${before.length} → ${after.length}`
    });
    return;
  }

  for (let i = 0; i < before.length; i++) {
    if (!equalsFn(before[i], after[i])) {
      result.differences.push({
        type: 'value',
        path: `${path}[${i}]`,
        before: before[i],
        after: after[i]
      });
    }
  }
}

/**
 * Helper to compare summary arrays (2D arrays from summary functions).
 */
function compareSummaryArrays(before, after, path, result) {
  if (!before || !after) {
    // Not necessarily an error - some summaries may be empty
    if (before !== after) {
      result.warnings.push({
        type: 'missing',
        path: path,
        message: 'Summary array missing from one snapshot'
      });
    }
    return;
  }

  if (before.length !== after.length) {
    result.differences.push({
      type: 'count',
      path: path,
      before: before.length,
      after: after.length,
      message: `Summary row count changed: ${before.length} → ${after.length}`
    });
    return;
  }

  for (let i = 0; i < before.length; i++) {
    const rowBefore = before[i];
    const rowAfter = after[i];

    if (!rowBefore || !rowAfter) continue;

    if (rowBefore.length !== rowAfter.length) {
      result.differences.push({
        type: 'count',
        path: `${path}[${i}]`,
        before: rowBefore.length,
        after: rowAfter.length,
        message: `Summary column count changed in row ${i}`
      });
      continue;
    }

    for (let j = 0; j < rowBefore.length; j++) {
      // Use loose equality for numbers vs strings, but check actual value
      const valBefore = rowBefore[j];
      const valAfter = rowAfter[j];

      // Handle undefined/null equivalence
      if (valBefore == null && valAfter == null) continue;

      // For numeric values, compare with tolerance for floating point
      if (typeof valBefore === 'number' && typeof valAfter === 'number') {
        if (Math.abs(valBefore - valAfter) > 0.0001) {
          result.differences.push({
            type: 'value',
            path: `${path}[${i}][${j}]`,
            before: valBefore,
            after: valAfter
          });
        }
      } else if (valBefore !== valAfter) {
        result.differences.push({
          type: 'value',
          path: `${path}[${i}][${j}]`,
          before: valBefore,
          after: valAfter
        });
      }
    }
  }
}

/**
 * Serializes a snapshot to JSON string for file storage.
 * 
 * @param {Object} snapshot - The snapshot to serialize
 * @returns {string} JSON string representation
 */
function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Deserializes a snapshot from JSON string.
 * 
 * @param {string} jsonString - The JSON string to deserialize
 * @returns {Object} The deserialized snapshot
 */
function deserializeSnapshot(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to deserialize snapshot:', error);
    return null;
  }
}

/**
 * Saves a snapshot to a file (triggers browser download).
 * 
 * @param {Object} snapshot - The snapshot to save
 * @param {string} filename - Optional filename (defaults to session-snapshot-{timestamp}.json)
 */
function saveSnapshotToFile(snapshot, filename = null) {
  if (!snapshot) {
    console.error('Cannot save null snapshot');
    return;
  }

  const jsonString = serializeSnapshot(snapshot);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultFilename = `session-snapshot-${timestamp}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Loads a snapshot from a file input.
 * 
 * @param {File} file - The file object to read
 * @returns {Promise<Object>} Promise resolving to the loaded snapshot
 */
function loadSnapshotFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const snapshot = deserializeSnapshot(event.target.result);
      if (snapshot) {
        resolve(snapshot);
      } else {
        reject(new Error('Failed to parse snapshot file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read snapshot file'));
    reader.readAsText(file);
  });
}

/**
 * Generates a human-readable report from a comparison result.
 * 
 * @param {Object} comparison - The comparison result from compareSnapshots
 * @returns {string} Human-readable report
 */
function generateComparisonReport(comparison) {
  const lines = [];

  lines.push('=== Snapshot Comparison Report ===');
  lines.push(`Overall Match: ${comparison.match ? '✅ PASS' : '❌ FAIL'}`);
  lines.push('');
  lines.push('Summary:');
  lines.push(`  Raw Data Match: ${comparison.summary.rawDataMatch ? '✅' : '❌'}`);
  lines.push(`  Calculated Values Match: ${comparison.summary.calculatedMatch ? '✅' : '❌'}`);
  lines.push(`  Display Values Match: ${comparison.summary.displayMatch ? '✅' : '❌'}`);
  lines.push('');

  if (comparison.differences.length > 0) {
    lines.push(`Differences Found (${comparison.differences.length}):`);
    for (const diff of comparison.differences) {
      if (diff.type === 'error') {
        lines.push(`  ❌ [ERROR] ${diff.path}: ${diff.message}`);
      } else if (diff.type === 'count') {
        lines.push(`  ⚠️ [COUNT] ${diff.path}: ${diff.before} → ${diff.after}`);
      } else {
        lines.push(`  ⚠️ [VALUE] ${diff.path}: ${JSON.stringify(diff.before)} → ${JSON.stringify(diff.after)}`);
      }
    }
    lines.push('');
  }

  if (comparison.warnings.length > 0) {
    lines.push(`Warnings (${comparison.warnings.length}):`);
    for (const warning of comparison.warnings) {
      lines.push(`  ℹ️ ${warning.path}: ${warning.message}`);
    }
  }

  return lines.join('\n');
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    captureSessionSnapshot,
    captureRawData,
    captureCalculatedValues,
    captureDisplayValues,
    compareSnapshots,
    compareRawData,
    compareCalculatedValues,
    compareDisplayValues,
    serializeSnapshot,
    deserializeSnapshot,
    saveSnapshotToFile,
    loadSnapshotFromFile,
    generateComparisonReport
  };
}
