function arrayToCsv(data){
  return data.map(row =>
    row
    .map(String)  // convert every value to String
    .map(v => v.replaceAll('"', '""'))  // escape double quotes
    .map(v => `"${v}"`)  // quote it
    .join(',')  // comma-separated
  ).join('\r\n');  // rows starting on new lines
}

/**
 * Check if a string is a valid UUID v4 format
 * @param {string} str - String to validate
 * @returns {boolean} True if valid UUID
 */
function isValidUUID(str) {
  if (typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Convert session from Y.Doc to plain JSON object (multi-doc architecture)
 * @param {string} sessionId - Session UUID to convert
 * @returns {Object} Plain object representation of session data
 */
function session_to_json(sessionId) {
  const sessionDoc = getSessionDoc(sessionId);
  if (!sessionDoc) return null;

  const session = sessionDoc.getMap('session');
  if (!session) return null;

  const sessionObj = {
    id: sessionId,
    name: session.get('name'),
    config: {
      maxPointsPerQuestion: session.get('config').get('maxPointsPerQuestion'),
      rounding: session.get('config').get('rounding')
    },
    teams: [],
    blocks: [],
    questions: [],
    currentQuestion: session.get('currentQuestion')
  };

  // Teams
  const teams = session.get('teams');
  for (let t = 0; t < teams.length; t++) {
    const team = teams.get(t);
    sessionObj.teams.push(team === null ? null : { name: team.get('name') });
  }

  // Blocks
  const blocks = session.get('blocks');
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks.get(b);
    sessionObj.blocks.push({ name: block.get('name') });
  }

  // Questions
  const questions = session.get('questions');
  for (let q = 0; q < questions.length; q++) {
    const question = questions.get(q);
    if (question === null) {
      sessionObj.questions.push(null);
      continue;
    }

    const questionObj = {
      name: question.get('name'),
      score: question.get('score'),
      block: question.get('block'),
      ignore: question.get('ignore'),
      teams: []
    };

    const questionTeams = question.get('teams');
    for (let qt = 0; qt < questionTeams.length; qt++) {
      const teamScore = questionTeams.get(qt);
      questionObj.teams.push(teamScore === null ? null : {
        score: teamScore.get('score'),
        extraCredit: teamScore.get('extraCredit')
      });
    }

    sessionObj.questions.push(questionObj);
  }

  return sessionObj;
}

/**
 * Convert all sessions to plain JSON object (multi-doc architecture)
 * @returns {Promise<Object>} Plain object representation of all Yjs data
 */
async function yjs_to_json() {
  if (!getGlobalDoc()) return null;

  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  const currentSessionId = meta.get('currentSession');

  // Load all sessions from IndexedDB before exporting
  for (const sessionId of sessionOrder) {
    if (!getSessionDoc(sessionId)) {
      await initSessionDoc(sessionId);
    }
  }

  const result = {
    dataVersion: meta.get('dataVersion') || 3.0,
    currentSession: sessionOrder.indexOf(currentSessionId) + 1,
    sessions: [null]  // Index 0 is null placeholder
  };

  for (const sessionId of sessionOrder) {
    const sessionJson = session_to_json(sessionId);
    result.sessions.push(sessionJson);
  }

  return result;
}

/**
 * Export current session only as JSON
 */
function export_current_session_json() {
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  const currentSessionId = meta.get('currentSession');
  const currentIndex = sessionOrder.indexOf(currentSessionId);
  
  if (currentIndex < 0 || !currentSessionId) {
    console.error('No current session found');
    return '{}';
  }
  
  const sessionJson = session_to_json(currentSessionId);
  if (!sessionJson) {
    console.error('Failed to export current session');
    return '{}';
  }

  const singleSessionData = {
    dataVersion: 3.0,
    currentSession: 1,
    sessions: [null, sessionJson]
  };

  return JSON.stringify(singleSessionData, null, 2);
}

/**
 * Export all sessions as JSON
 * @returns {Promise<string>} JSON string of all sessions
 */
async function export_all_sessions_json() {
  const data = await yjs_to_json();
  return JSON.stringify(data, null, 2);
}

function filter_to_current_session(key, value) {
  // Legacy function - kept for compatibility but not used with Yjs
  let current_session_local = Number(get_element("current_session"));
  let session_names = JSON.parse(get_element("session_names"));

  if (key.substring(0,8) == "session_") {
    let temp = "session_" + current_session_local;
    if (key == "session_names") {
      return JSON.stringify(["", session_names[current_session_local]]);
    }
    else if (key.substring(0,temp.length) != temp) {
      return undefined;
    }
  }

  else if (key == "current_session") {
    return "1";
  }

  return value;
}

/** Download contents as a file
 * Source: https://stackoverflow.com/questions/14964035/how-to-export-javascript-array-info-to-csv-on-client-side
 */
function downloadBlob(content, filename, contentType) {
  // Create a blob
  let blob = new Blob([content], { type: contentType });
  let url = URL.createObjectURL(blob);

  // Create a link to download it
  let pom = document.createElement('a');
  pom.href = url;
  pom.setAttribute('download', filename);
  pom.click();
}
/**
 * Import JSON data into multi-doc architecture
 * Creates new session Y.Docs for each imported session
 * @param {Object} data - v2.0/v3.0 format JSON data
 * @param {string} mode - 'replace' or 'append'
 */
async function import_yjs_from_json(data, mode) {
  if (!getGlobalDoc()) return;

  const meta = getGlobalDoc().getMap('meta');

  if (mode === 'replace') {
    // Clear existing sessions
    const currentSessionOrder = meta.get('sessionOrder') || [];
    
    // Destroy existing session docs
    for (const sessionId of currentSessionOrder) {
      const existingDoc = getSessionDoc(sessionId);
      if (existingDoc) {
        existingDoc.destroy();
      }
      DocManager.sessionDocs.delete(sessionId);
      // Clear from IndexedDB
      try {
        indexedDB.deleteDatabase('pbe-score-keeper-session-' + sessionId);
      } catch (e) {
        console.warn('Failed to delete session DB:', sessionId, e);
      }
    }

    // Reset global doc
    getGlobalDoc().transact(() => {
      meta.set('dataVersion', 3.0);
      meta.set('sessionOrder', []);
      meta.set('currentSession', null);
      // Clear session name cache
      meta.set('sessionNames', new Y.Map());
    }, 'import');
  }

  // Import sessions (skip index 0 placeholder)
  const importedSessionIds = [];
  for (let i = 1; i < data.sessions.length; i++) {
    const sessionData = data.sessions[i];
    if (!sessionData) continue;

    // Preserve session ID if it's a valid UUID, otherwise generate new
    const sessionId = (sessionData.id && isValidUUID(sessionData.id)) ? sessionData.id : generateSessionId();
    
    // Check if session already exists (for merge support)
    let existingDoc = DocManager.sessionDocs.get(sessionId);
    if (!existingDoc && window.indexedDB && typeof IndexeddbPersistence !== 'undefined') {
      // Try to load from IndexedDB
      existingDoc = await initSessionDoc(sessionId);
    }
    
    // Create session doc or use existing
    const sessionDoc = existingDoc || new Y.Doc();
    const session = sessionDoc.getMap('session');
    
    sessionDoc.transact(() => {
      session.set('id', sessionId);
      session.set('name', sessionData.name);
      session.set('currentQuestion', sessionData.currentQuestion || 1);

      // Config
      const config = new Y.Map();
      config.set('maxPointsPerQuestion', sessionData.config.maxPointsPerQuestion);
      config.set('rounding', sessionData.config.rounding);
      session.set('config', config);

      // Teams
      const teams = new Y.Array();
      for (let t = 0; t < sessionData.teams.length; t++) {
        if (sessionData.teams[t] === null) {
          teams.push([null]);
        } else {
          const teamMap = new Y.Map();
          teamMap.set('name', sessionData.teams[t].name);
          teams.push([teamMap]);
        }
      }
      session.set('teams', teams);

      // Blocks
      const blocks = new Y.Array();
      for (let b = 0; b < sessionData.blocks.length; b++) {
        const blockMap = new Y.Map();
        blockMap.set('name', sessionData.blocks[b].name);
        blocks.push([blockMap]);
      }
      session.set('blocks', blocks);

      // Questions
      const questions = new Y.Array();
      for (let q = 0; q < sessionData.questions.length; q++) {
        if (sessionData.questions[q] === null) {
          questions.push([null]);
          continue;
        }

        const questionData = sessionData.questions[q];
        const questionMap = new Y.Map();
        questionMap.set('name', questionData.name);
        questionMap.set('score', questionData.score);
        questionMap.set('block', questionData.block);
        questionMap.set('ignore', questionData.ignore);

        const questionTeams = new Y.Array();
        for (let qt = 0; qt < questionData.teams.length; qt++) {
          if (questionData.teams[qt] === null) {
            questionTeams.push([null]);
          } else {
            const teamScoreMap = new Y.Map();
            teamScoreMap.set('score', questionData.teams[qt].score);
            teamScoreMap.set('extraCredit', questionData.teams[qt].extraCredit || 0);
            questionTeams.push([teamScoreMap]);
          }
        }
        questionMap.set('teams', questionTeams);

        questions.push([questionMap]);
      }
      session.set('questions', questions);

      // Initialize history
      session.set('historyLog', new Y.Array());
    }, 'import');

    // Store session doc if not already stored
    if (!DocManager.sessionDocs.has(sessionId)) {
      DocManager.sessionDocs.set(sessionId, sessionDoc);
      
      // Set up IndexedDB persistence and track provider
      if (window.indexedDB && typeof IndexeddbPersistence !== 'undefined') {
        const persistence = new IndexeddbPersistence('pbe-score-keeper-session-' + sessionId, sessionDoc);
        DocManager.sessionProviders.set(sessionId, persistence);
      }
    }
    
    importedSessionIds.push(sessionId);
  }

  // Update global doc with imported sessions
  getGlobalDoc().transact(() => {
    const existingOrder = meta.get('sessionOrder') || [];
    const newOrder = mode === 'replace' ? importedSessionIds : [...existingOrder, ...importedSessionIds];
    meta.set('sessionOrder', newOrder);
    
    // Update session name cache
    let sessionNames = meta.get('sessionNames');
    if (!sessionNames) {
      sessionNames = new Y.Map();
      meta.set('sessionNames', sessionNames);
    }
    
    for (const sessionId of importedSessionIds) {
      const sessionDoc = getSessionDoc(sessionId);
      if (sessionDoc) {
        const session = sessionDoc.getMap('session');
        const name = session.get('name') || 'Unnamed Session';
        sessionNames.set(sessionId, name);
      }
    }
    
    // Set current session
    const targetSessionId = mode === 'replace' 
      ? (importedSessionIds.length > 0 ? importedSessionIds[0] : null)
      : (importedSessionIds.length > 0 ? importedSessionIds[importedSessionIds.length - 1] : existingOrder[existingOrder.length - 1]);
    
    if (targetSessionId) {
      meta.set('currentSession', targetSessionId);
      DocManager.setActiveSession(targetSessionId);
    }
  }, 'import');

  // Add import history entry
  add_global_history_entry(t('history_global.actions.import'), t('history_global.details_templates.imported_sessions', { count: importedSessionIds.length }));
}

function setup_file_import() {
  //Check the support for the File API support
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    let fileSelected = document.getElementById('import_file');
    fileSelected.addEventListener('change', function (e) {
      let fileTobeRead = fileSelected.files[0];
      
      // Support both JSON and binary formats
      let isJsonFile = /json.*/.test(fileTobeRead.type) || fileTobeRead.name.endsWith('.json');
      let isBinaryFile = fileTobeRead.name.endsWith('.yjs') || fileTobeRead.type === 'application/octet-stream';
      
      if (isJsonFile) {
        // Handle JSON import
        let fileReader = new FileReader();
        fileReader.onload = async function (e) {
          try {
            let temp_import_data = JSON.parse(fileReader.result);
            const result = await importSessionData(temp_import_data);
            if (result.success) {
              sync_data_to_display();
              add_global_history_entry(t('history_global.actions.import'), t('history_global.details_templates.imported_from_json', { count: result.importedCount }));
              alert(t('alerts.import_success', { count: result.importedCount }));
              $( '#accordion' ).accordion({active: 0});
            } else {
              const errorMsg = result.errors.length > 0 ? result.errors[0] : 'Unknown import error';
              alert(t('alerts.import_failed', { error: errorMsg }));
            }
          } catch (error) {
            console.error('JSON import error:', error);
            alert(t('alerts.import_json_failed', { error: error.message }));
          }
        }
        fileReader.readAsText(fileTobeRead);
      } else if (isBinaryFile) {
        // Handle binary import (.yjs files)
        let fileReader = new FileReader();
        fileReader.onload = async function (e) {
          try {
            const binaryData = new Uint8Array(fileReader.result);
            const result = await importSessionData(binaryData);
            if (result.success) {
              sync_data_to_display();
              add_global_history_entry(t('history_global.actions.import'), t('history_global.details_templates.imported_from_yjs', { count: result.importedCount }));
              alert(t('alerts.import_success', { count: result.importedCount }));
              $( '#accordion' ).accordion({active: 0});
            } else {
              const errorMsg = result.errors.length > 0 ? result.errors[0] : 'Unknown import error';
              alert(t('alerts.import_failed', { error: errorMsg }));
            }
          } catch (error) {
            console.error('Binary import error:', error);
            alert(t('alerts.import_binary_failed', { error: error.message }));
          }
        }
        fileReader.readAsArrayBuffer(fileTobeRead);
      } else {
        alert(t('alerts.select_valid_file'));
      }
      //Unselect file
      fileSelected.value = "";

    }, false);
  }
  else {
    var noSupportText = (typeof t === 'function') ? t('advanced.no_import_support') : 'Your Browser does not support importing.';
    $("#import_group").html("<p>"+noSupportText+"</p>");
  }
}

/**
 * Convert localStorage format to v2.0 Yjs format
 * Handles automatic upgrade from any v1.x version to v1.5 before conversion
 */
function convert_localStorage_to_v2(localStorageData) {
  // Check if data needs upgrading to v1.5 first
  let dataVersion = localStorageData['data_version'] ? Number(JSON.parse(localStorageData['data_version'])) : 1.0;
  if (dataVersion < 1.5) {
    // Upgrade data to v1.5
    localStorageData = data_upgrades(dataVersion, localStorageData);
  }
  
  const sessionNames = JSON.parse(localStorageData['session_names']);
  const result = {
    dataVersion: 2.0,
    currentSession: Number(localStorageData['current_session']),
    sessions: [null] // Placeholder at index 0
  };

  for (let s = 1; s < sessionNames.length; s++) {
    const session = {
      name: sessionNames[s],
      config: {
        maxPointsPerQuestion: Number(JSON.parse(localStorageData['session_' + s + '_max_points_per_question'])),
        rounding: JSON.parse(localStorageData['session_' + s + '_rounding']) === 'true'
      },
      teams: [],
      blocks: [],
      questions: [],
      currentQuestion: Number(JSON.parse(localStorageData['session_' + s + '_current_question']))
    };

    // Teams
    const teamNames = JSON.parse(localStorageData['session_' + s + '_team_names']);
    session.teams.push(null); // Placeholder
    for (let t = 1; t < teamNames.length; t++) {
      session.teams.push({ name: teamNames[t] });
    }

    // Blocks
    const blockNames = JSON.parse(localStorageData['session_' + s + '_block_names']);
    for (let b = 0; b < blockNames.length; b++) {
      session.blocks.push({ name: blockNames[b] });
    }

    // Questions
    const questionNames = JSON.parse(localStorageData['session_' + s + '_question_names']);
    session.questions.push(null); // Placeholder
    for (let q = 1; q < questionNames.length; q++) {
      const question = {
        name: questionNames[q],
        score: Number(JSON.parse(localStorageData['session_' + s + '_question_' + q + '_score'] || '0')),
        block: Number(JSON.parse(localStorageData['session_' + s + '_question_' + q + '_block'] || '0')),
        ignore: JSON.parse(localStorageData['session_' + s + '_question_' + q + '_ignore'] || 'false') === 'true',
        teams: [null] // Placeholder
      };

      for (let t = 1; t < teamNames.length; t++) {
        question.teams.push({
          score: Number(JSON.parse(localStorageData['session_' + s + '_question_' + q + '_team_' + t + '_score'] || '0')),
          extraCredit: Number(JSON.parse(localStorageData['session_' + s + '_question_' + q + '_team_' + t + '_extra_credit'] || '0'))
        });
      }

      session.questions.push(question);
    }

    result.sessions.push(session);
  }

  return result;
}
function validate_data(data_to_validate) {
  let row_count = 0;
      //Must have Data Version of 1.2 or higher (Export was impossible before then.)
  if (Number(get_element("data_version", data_to_validate)) >= 1.2
      //Must have Session Names
      && JSON.parse(get_element("session_names", data_to_validate)).length > 1
      //Current Session must exist and be possible
      && Number(get_element("current_session", data_to_validate)) <= JSON.parse(get_element("session_names", data_to_validate)).length) {
    
    //To be here three elements must exist
    row_count = 3;

    const session_max_points_check = /^session_([0-9]+)_max_points_per_question$/;
    const session_rounding_check = /^session_([0-9]+)_rounding$/;
    const block_name_check = /^session_([0-9]+)_block_names$/;
    const team_name_check = /^session_([0-9]+)_team_names$/;
    const question_name_check = /^session_([0-9]+)_question_names$/;
    const question_current_name_check = /^session_([0-9]+)_current_question$/;
    const question_max_points_check = /^session_([0-9]+)_question_([0-9]+)_score$/;
    const question_block_check = /^session_([0-9]+)_question_([0-9]+)_block$/;
    const question_ignore_check = /^session_([0-9]+)_question_([0-9]+)_ignore$/;
    const team_question_score_check = /^session_([0-9]+)_question_([0-9]+)_team_([0-9]+)_score$/;
    const team_question_extra_credit_check = /^session_([0-9]+)_question_([0-9]+)_team_([0-9]+)_extra_credit$/;

    for (let key in data_to_validate){
      //Make sure that Boolean values exist
      if (key.search(session_rounding_check) > -1
          || key.search(question_ignore_check) > -1) {
        row_count++;
      }
      //Team Name is array sanity check
      if (key.search(team_name_check) > -1 && JSON.parse(get_element(key, data_to_validate)).length > 1) {
        row_count++;
      }
      //Block Name is array sanity check
      if (key.search(block_name_check) > -1 && JSON.parse(get_element(key, data_to_validate)).length > 1) {
        row_count++;
      }
      //Question Name is array sanity check
      if (key.search(question_name_check) > -1 && JSON.parse(get_element(key, data_to_validate)).length > 1) {
        row_count++;
      }
      //Session Max points is number >= 0 sanity check
      if (key.search(session_max_points_check) > -1 && Number(JSON.parse(get_element(key, data_to_validate))) >= 0) {
        row_count++;
      }
      //Current Question is number >= 0 sanity check
      if (key.search(question_current_name_check) > -1 && Number(JSON.parse(get_element(key, data_to_validate))) >= 0) {
        row_count++;
      }
      //Question Max points is number >= 0 sanity check
      if (key.search(question_max_points_check) > -1 && Number(JSON.parse(get_element(key, data_to_validate))) >= 0) {
        row_count++;
      }
      //Question's Block is number >= 0 sanity check
      if (key.search(question_block_check) > -1 && Number(JSON.parse(get_element(key, data_to_validate))) >= 0) {
        row_count++;
      }
      //Team's question score is number >= 0 sanity check
      if (key.search(team_question_score_check) > -1 && Number(JSON.parse(get_element(key, data_to_validate))) >= 0) {
        row_count++;
      }
      //Team's question extra credit is number >= 0 sanity check
      if (key.search(team_question_extra_credit_check) > -1 && Number(JSON.parse(get_element(key, data_to_validate))) >= 0) {
        row_count++;
      }
    }
    
    //row_count must equal number of rows in imported data or there is a problem.
    if (Object.keys(data_to_validate).length == row_count) {
      return true;
    } else {
      return false;
    }
  }
  return false;
}

/**
 * [Phase 3.1] Export current session as binary Y.Doc update
 * @returns {Uint8Array} Encoded session state
 */
/**
 * Export single session as native Yjs binary update (multi-doc architecture)
 * Creates encoded state of the session's Y.Doc for export.
 * The exported file can be imported using Y.applyUpdate() to merge into existing doc.
 * @param {number|string} sessionNumOrId - Session number (1-based) or UUID to export
 * @returns {Uint8Array} Native Yjs binary update (can be merged via Y.applyUpdate)
 */
function exportSession(sessionNumOrId) {
  if (!getGlobalDoc()) {
    console.error('Yjs not initialized');
    return null;
  }

  try {
    const meta = getGlobalDoc().getMap('meta');
    const sessionOrder = meta.get('sessionOrder') || [];
    
    // Resolve session ID
    let sessionId;
    if (typeof sessionNumOrId === 'string' && sessionNumOrId.length > 10) {
      // It's a UUID
      sessionId = sessionNumOrId;
    } else {
      // It's a number (1-based index)
      const index = (sessionNumOrId || get_current_session_index()) - 1;
      sessionId = sessionOrder[index];
    }

    if (!sessionId) {
      console.error('Session not found:', sessionNumOrId);
      return null;
    }

    // Get the session doc
    const sessionDoc = getSessionDoc(sessionId);
    if (!sessionDoc) {
      console.error('Session doc not found:', sessionId);
      return null;
    }

    // Encode the session doc as native Yjs binary
    const state = Y.encodeStateAsUpdate(sessionDoc);
    
    return state;
  } catch (error) {
    console.error('Session export error:', error);
    return null;
  }
}

/**
 * Export all sessions as native Yjs binary updates (multi-doc architecture)
 * Encodes the global Y.Doc and individual session docs for export.
 * Returns a serialized container that can be saved as a single .yjs file.
 * The exported file can be imported using Y.applyUpdate() to merge into existing docs.
 * @returns {Promise<Uint8Array>} Serialized container with global and all session binary updates
 */
async function exportAllSessions() {
  if (!getGlobalDoc()) {
    console.error('Yjs not initialized');
    return null;
  }

  try {
    // Encode the entire global doc as native Yjs binary
    // This captures metadata and session list
    const globalState = Y.encodeStateAsUpdate(getGlobalDoc());

    // Get session order from meta
    const meta = getGlobalDoc().getMap('meta');
    const sessionOrder = meta.get('sessionOrder') || [];

    // Load all sessions from IndexedDB before exporting
    for (const sessionId of sessionOrder) {
      if (!getSessionDoc(sessionId)) {
        await initSessionDoc(sessionId);
      }
    }

    // Export each session doc
    const sessions = {};
    for (const sessionId of sessionOrder) {
      const sessionDoc = getSessionDoc(sessionId);
      if (sessionDoc) {
        try {
          // Convert Uint8Array to Base64 for JSON serialization
          const updateBytes = Y.encodeStateAsUpdate(sessionDoc);
          sessions[sessionId] = uint8ArrayToBase64(updateBytes);
        } catch (error) {
          console.warn(`Failed to export session ${sessionId}:`, error);
        }
      }
    }

    // Create container object with Base64-encoded binaries
    const container = {
      format: 'pbe-multi-doc',
      version: '3.0',
      exportedAt: Date.now(),
      global: uint8ArrayToBase64(globalState),
      sessions: sessions
    };

    // Serialize to JSON and convert to Uint8Array for download
    const jsonString = JSON.stringify(container);
    return new TextEncoder().encode(jsonString);
  } catch (error) {
    console.error('All sessions export error:', error);
    return null;
  }
}

/**
 * Convert Uint8Array to Base64 string
 * @param {Uint8Array} bytes - Binary data
 * @returns {string} Base64-encoded string
 */
function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 * @param {string} base64 - Base64-encoded string
 * @returns {Uint8Array} Binary data
 */
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Download binary export as file
 * @param {Uint8Array} binary - Binary data to export
 * @param {string} filename - Filename for download
 */
function downloadBinaryExport(binary, filename) {
  const blob = new Blob([binary], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Detect import format (binary or JSON)
 * @param {any} data - Data to detect format of
 * @returns {string} Format: 'binary-single', 'binary-full', 'json-v3', 'json-legacy', or 'invalid'
 */
function detectImportFormat(data) {
  // Check if binary (Uint8Array) - could be single session or multi-doc container
  if (data instanceof Uint8Array) {
    // Try to parse as multi-doc container (JSON with Base64 binaries)
    try {
      const jsonString = new TextDecoder().decode(data);
      const parsed = JSON.parse(jsonString);
      if (parsed.format === 'pbe-multi-doc' && parsed.global && parsed.sessions) {
        return 'binary-full';
      }
    } catch (e) {
      // Not a JSON container, treat as single Yjs binary
    }
    return 'binary-single';
  }

  // Check if JSON object
  if (typeof data === 'object' && data !== null) {
    // Check for multi-doc export container (has format marker)
    if (data.format === 'pbe-multi-doc' && data.global && data.sessions) {
      return 'binary-full';
    }
    // Check for v3.0 JSON format
    if (data.dataVersion === 3.0 || (data.dataVersion === 2.0 && data.sessions)) {
      return 'json-v3';
    }
    // Check for legacy JSON format with camelCase dataVersion
    if (data.dataVersion && typeof data.dataVersion === 'number') {
      return 'json-legacy';
    }
    // Flat localStorage format (v1.x) - uses underscore data_version or has session keys
    // These files have keys like "session_1_question_1_score", "session_names", "data_version", etc.
    if ('data_version' in data || 'session_names' in data || Object.keys(data).some(k => k.startsWith('session_'))) {
      return 'json-legacy';
    }
  }

  // Check if JSON string
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return detectImportFormat(parsed);
    } catch (e) {
      return 'invalid';
    }
  }

  return 'invalid';
}

/**
 * Universal import function for all formats (multi-doc architecture)
 * Supports native Yjs binary (single and multi-doc) and legacy JSON formats
 * @param {any} data - Data to import (binary or JSON)
 * @returns {Promise<Object>} Import result { success, importedCount, errors }
 */
async function importSessionData(data) {
  if (!getGlobalDoc()) {
    console.error('Yjs not initialized');
    return { success: false, importedCount: 0, errors: ['Yjs not initialized'] };
  }

  // Detect format
  const format = detectImportFormat(data);
  
  if (format === 'invalid') {
    return { success: false, importedCount: 0, errors: ['Invalid import format. Expected JSON or binary (.yjs) file.'] };
  }

  const result = { success: true, importedCount: 0, errors: [] };
  const meta = getGlobalDoc().getMap('meta');

  try {
    if (format === 'binary-full') {
      // Import multi-doc export: preserve session UUIDs for conflict-free merge
      // If session with same UUID exists, we merge; otherwise create new
      
      // Parse container if it's a Uint8Array
      let container = data;
      if (data instanceof Uint8Array) {
        try {
          const jsonString = new TextDecoder().decode(data);
          container = JSON.parse(jsonString);
        } catch (e) {
          return { success: false, importedCount: 0, errors: ['Failed to parse multi-doc container'] };
        }
      }
      
      // Merge global doc state if present
      if (container.global) {
        try {
          const globalData = base64ToUint8Array(container.global);
          Y.applyUpdate(getGlobalDoc(), globalData, 'import');
        } catch (error) {
          result.errors.push('Failed to merge global state: ' + error.message);
        }
      }
      
      if (container.sessions && typeof container.sessions === 'object') {
        const importedSessionIds = [];
        
        for (const [originalSessionId, sessionDataBase64] of Object.entries(container.sessions)) {
          try {
            // Decode Base64 to Uint8Array
            const sessionData = base64ToUint8Array(sessionDataBase64);
            
            // Preserve original session UUID for conflict-free import
            // This allows merging changes from the same session across devices
            const sessionId = originalSessionId;
            
            // Check if this session already exists in memory
            let sessionDoc = DocManager.sessionDocs.get(sessionId);
            
            // If not in memory, try to load from IndexedDB first
            if (!sessionDoc && window.indexedDB && typeof IndexeddbPersistence !== 'undefined') {
              sessionDoc = await initSessionDoc(sessionId);
            }
            
            if (sessionDoc) {
              // Merge into existing session doc (CRDT merge)
              Y.applyUpdate(sessionDoc, sessionData, 'import');
            } else {
              // Create new session doc and apply the imported state
              sessionDoc = new Y.Doc();
              Y.applyUpdate(sessionDoc, sessionData, 'import');
              
              // Ensure session doc has correct ID stored
              const session = sessionDoc.getMap('session');
              if (session && session.get('id') !== sessionId) {
                sessionDoc.transact(() => {
                  session.set('id', sessionId);
                }, 'import');
              }
              
              // Store the session doc
              DocManager.sessionDocs.set(sessionId, sessionDoc);
              
              // Set up IndexedDB persistence and track provider
              if (window.indexedDB && typeof IndexeddbPersistence !== 'undefined') {
                const persistence = new IndexeddbPersistence('pbe-score-keeper-session-' + sessionId, sessionDoc);
                DocManager.sessionProviders.set(sessionId, persistence);
              }
            }
            
            importedSessionIds.push(sessionId);
            result.importedCount++;
          } catch (error) {
            result.errors.push(`Failed to import session ${originalSessionId}: ${error.message}`);
          }
        }
        
        // Update global doc with imported sessions
        if (importedSessionIds.length > 0) {
          getGlobalDoc().transact(() => {
            const existingOrder = meta.get('sessionOrder') || [];
            // Only add sessions that aren't already in the order
            const newSessions = importedSessionIds.filter(id => !existingOrder.includes(id));
            const newOrder = [...existingOrder, ...newSessions];
            meta.set('sessionOrder', newOrder);
            
            // Update session name cache
            let sessionNames = meta.get('sessionNames');
            if (!sessionNames) {
              sessionNames = new Y.Map();
              meta.set('sessionNames', sessionNames);
            }
            
            for (const sessionId of importedSessionIds) {
              const sessionDoc = getSessionDoc(sessionId);
              if (sessionDoc) {
                const session = sessionDoc.getMap('session');
                const name = session.get('name') || 'Unnamed Session';
                sessionNames.set(sessionId, name);
              }
            }
            
            // Set current session to first imported
            meta.set('currentSession', importedSessionIds[0]);
            DocManager.setActiveSession(importedSessionIds[0]);
          }, 'import');
          
        }
      }
    } 
    else if (format === 'binary-single') {
      // Import single session binary update
      try {
        // Create temp doc to read the session ID from the binary
        const tempDoc = new Y.Doc();
        Y.applyUpdate(tempDoc, data, 'import');
        const tempSession = tempDoc.getMap('session');
        
        // Get the original session ID if it exists, otherwise generate new
        let sessionId = tempSession.get('id');
        if (!sessionId) {
          sessionId = generateSessionId();
        }
        
        // Check if this session already exists in memory
        let sessionDoc = DocManager.sessionDocs.get(sessionId);
        
        // If not in memory, try to load from IndexedDB first
        if (!sessionDoc && window.indexedDB && typeof IndexeddbPersistence !== 'undefined') {
          sessionDoc = await initSessionDoc(sessionId);
        }
        
        if (sessionDoc) {
          // Merge into existing session doc (CRDT merge)
          Y.applyUpdate(sessionDoc, data, 'import');
          // Destroy the temp doc since we used the existing one
          tempDoc.destroy();
        } else {
          // Use the temp doc as our session doc
          sessionDoc = tempDoc;
          
          // Ensure session doc has correct ID stored
          if (!tempSession.get('id')) {
            sessionDoc.transact(() => {
              tempSession.set('id', sessionId);
            }, 'import');
          }
          
          // Store session doc
          DocManager.sessionDocs.set(sessionId, sessionDoc);
          
          // Set up IndexedDB persistence and track provider
          if (window.indexedDB && typeof IndexeddbPersistence !== 'undefined') {
            const persistence = new IndexeddbPersistence('pbe-score-keeper-session-' + sessionId, sessionDoc);
            DocManager.sessionProviders.set(sessionId, persistence);
          }
        }
        
        // Update global doc
        getGlobalDoc().transact(() => {
          const existingOrder = meta.get('sessionOrder') || [];
          // Only add if not already in order
          const newOrder = existingOrder.includes(sessionId) ? existingOrder : [...existingOrder, sessionId];
          meta.set('sessionOrder', newOrder);
          meta.set('currentSession', sessionId);
          DocManager.setActiveSession(sessionId);
        }, 'import');
        
        result.importedCount = 1;
      } catch (error) {
        result.success = false;
        result.errors.push(`Failed to import session: ${error.message}`);
      }
    } 
    else if (format === 'json-v3' || format === 'json-legacy') {
      // Import JSON format (legacy save files)
      // Check if this is flat localStorage format (needs conversion)
      let importData = data;
      if (!data.sessions && ('session_names' in data || Object.keys(data).some(k => k.startsWith('session_')))) {
        // Convert flat localStorage format to structured v2.0 format
        try {
          importData = convert_localStorage_to_v2(data);
        } catch (conversionError) {
          result.success = false;
          result.errors.push('Failed to convert localStorage format: ' + conversionError.message);
          return result;
        }
      }
      
      await import_yjs_from_json(importData, 'append');
      result.importedCount = importData.sessions ? Math.max(0, importData.sessions.length - 1) : 0;
    }
  } catch (error) {
    result.success = false;
    result.errors.push(error.message);
  }

  return result;
}
