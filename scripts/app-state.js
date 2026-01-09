function initialize_state() {
  // Wait for Yjs to be ready
  if (typeof ydoc === 'undefined' || !yjsReady) {
    // Yjs not ready yet, will be called again
    setTimeout(initialize_state, 100);
    return;
  }

  // Check if Yjs has data (version 2.0)
  if (has_yjs_data()) {
    // Load from Yjs
    load_from_yjs();
    window.stateInitialized = true;
    return;
  }

  // Check localStorage for legacy data
  var data_version = JSON.parse(get_element("data_version"));

  if (data_version === null) {
    // First run - initialize new Yjs state
    initialize_new_yjs_state();
    load_from_yjs();
  } else if (data_version < 2.0) {
    // Migration needed from localStorage to Yjs
    migrate_localStorage_to_yjs(data_version);
    load_from_yjs();
  }

  // Mark state as initialized
  window.stateInitialized = true;
}
function data_upgrades(data_version, data = "localStorage") {
  //Data structure upgrades
  //Add in rounding option
  if (data_version == 1.0) {
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
        //Add missing data element
        set_element("session_"+i+"_rounding", JSON.stringify("false"), data);
    }
    set_element("data_version", 1.01, data);
  }
  //Add in ignore question option
  if (data_version == 1.01) {
    let current_session = Number(get_element("current_session", data));
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
      var question_names = JSON.parse(get_element("session_"+current_session+"_question_names", data));
      var question_count = question_names.length - 1;
      for (let j = 1; j <= question_count; j++) {  
        //Add missing data element
        set_element("session_"+i+"_question_"+j+"_ignore", JSON.stringify("false"), data);
      }
    }
  }
  //Remove Rounding option
  if (data_version < 1.3) {
  let session_names = JSON.parse(get_element("session_names", data));
  for (let i = 1; i < session_names.length; i++) {
      //Add missing data element
      remove_element("session_"+i+"_rounding");
  }
    set_element("data_version", 1.3, data);
  }
  //Add Back Rounding option for live scoring
  if (data_version < 1.4) {
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
        //Add missing data element
        set_element("session_"+i+"_rounding", JSON.stringify("false"), data);
    }
    set_element("data_version", 1.4, data);
  }
  //Add Extra Credit option
  if (data_version < 1.5) {
    let current_session = Number(get_element("current_session", data));
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
      let question_names = JSON.parse(get_element("session_"+current_session+"_question_names", data));
      let question_count = question_names.length - 1;
      for (let j = 1; j <= question_count; j++) {  
        let team_names = JSON.parse(get_element("session_"+current_session+"_team_names", data));
        let team_count = team_names.length - 1;
        for (let k = 1; k <= team_count; k++) {
          //Add missing data element
          set_element("session_"+i+"_question_"+j+"_team_"+k+"_extra_credit", JSON.stringify(0), data);
        }
      }
    }

    /* NOTE: Be sure to add new data elements to validation function */

    set_element("data_version", 1.5, data);
  }
  return data;
}

/**
 * Migrate localStorage data to Yjs format
 * @param {number} oldVersion - Current localStorage data version
 */
function migrate_localStorage_to_yjs(oldVersion) {
  console.log('Starting migration from localStorage v' + oldVersion + ' to Yjs v2.0');

  try {
    // Step 1: Create backup of localStorage
    backup_localStorage();

    // Step 2: Copy all localStorage to temp object and upgrade to v1.5
    const upgradedData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith('pbe_legacy_backup_')) {
        upgradedData[key] = localStorage.getItem(key);
      }
    }

    // Run existing migrations to get to v1.5
    data_upgrades(oldVersion, upgradedData);

    // Step 3: Transform flat localStorage structure to nested Yjs structure
    ydoc.transact(function() {
      const meta = ydoc.getMap('meta');
      const sessions = ydoc.getArray('sessions');

      // Set metadata
      meta.set('dataVersion', 2.0);
      meta.set('currentSession', Number(JSON.parse(upgradedData['current_session'])));

      // Parse session names
      const sessionNames = JSON.parse(upgradedData['session_names']);

      // Create placeholder at index 0
      sessions.push([null]);

      // Migrate each session
      for (let s = 1; s < sessionNames.length; s++) {
        const sessionMap = new Y.Map();
        sessionMap.set('name', sessionNames[s]);

        // Config
        const config = new Y.Map();
        config.set('maxPointsPerQuestion', Number(JSON.parse(upgradedData['session_' + s + '_max_points_per_question'])));
        config.set('rounding', JSON.parse(upgradedData['session_' + s + '_rounding']) === 'true');
        sessionMap.set('config', config);

        // Teams
        const teams = new Y.Array();
        const teamNames = JSON.parse(upgradedData['session_' + s + '_team_names']);
        teams.push([null]); // Placeholder at index 0
        for (let t = 1; t < teamNames.length; t++) {
          const teamMap = new Y.Map();
          teamMap.set('name', teamNames[t]);
          teams.push([teamMap]);
        }
        sessionMap.set('teams', teams);

        // Blocks
        const blocks = new Y.Array();
        const blockNames = JSON.parse(upgradedData['session_' + s + '_block_names']);
        for (let b = 0; b < blockNames.length; b++) {
          const blockMap = new Y.Map();
          blockMap.set('name', blockNames[b]);
          blocks.push([blockMap]);
        }
        sessionMap.set('blocks', blocks);

        // Questions
        const questions = new Y.Array();
        const questionNames = JSON.parse(upgradedData['session_' + s + '_question_names']);
        questions.push([null]); // Placeholder at index 0

        for (let q = 1; q < questionNames.length; q++) {
          const questionMap = new Y.Map();
          questionMap.set('name', questionNames[q]);
          questionMap.set('score', Number(JSON.parse(upgradedData['session_' + s + '_question_' + q + '_score'] || '0')));
          questionMap.set('block', Number(JSON.parse(upgradedData['session_' + s + '_question_' + q + '_block'] || '0')));
          questionMap.set('ignore', JSON.parse(upgradedData['session_' + s + '_question_' + q + '_ignore'] || 'false') === 'true');

          // Question teams
          const questionTeams = new Y.Array();
          questionTeams.push([null]); // Placeholder at index 0
          for (let t = 1; t < teamNames.length; t++) {
            const teamScoreMap = new Y.Map();
            teamScoreMap.set('score', Number(JSON.parse(upgradedData['session_' + s + '_question_' + q + '_team_' + t + '_score'] || '0')));
            teamScoreMap.set('extraCredit', Number(JSON.parse(upgradedData['session_' + s + '_question_' + q + '_team_' + t + '_extra_credit'] || '0')));
            questionTeams.push([teamScoreMap]);
          }
          questionMap.set('teams', questionTeams);

          questions.push([questionMap]);
        }

        sessionMap.set('questions', questions);
        sessionMap.set('currentQuestion', Number(JSON.parse(upgradedData['session_' + s + '_current_question'])));

        sessions.push([sessionMap]);
      }
    }, 'migration');

    // Step 4: Clear old localStorage (keep backup)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith('pbe_legacy_backup_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(function(key) {
      localStorage.removeItem(key);
    });

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    alert('Data migration failed. Your data is safe in localStorage. Please export a backup and report this issue.');
    throw error;
  }
}

/**
 * Create a backup of localStorage before migration
 */
function backup_localStorage() {
  const backupKey = 'pbe_legacy_backup_' + new Date().toISOString();
  const allData = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('pbe_legacy_backup_')) {
      allData[key] = localStorage.getItem(key);
    }
  }

  try {
    localStorage.setItem(backupKey, JSON.stringify(allData));
    console.log('Backup created:', backupKey);
  } catch (e) {
    console.error('Could not create localStorage backup (storage full?):', e);
    // Still continue with migration - user can export manually if needed
  }
}

function get_element(element_name, data = "localStorage") {
  if (data === "localStorage") {
    return localStorage.getItem(element_name);
  } else {
    return data[element_name];
  }
}
function set_element(element_name, element_value, data = "localStorage") {
  if (data === "localStorage") {
    localStorage.setItem(element_name, element_value);
  } else {
    data[element_name] = element_value;
  }
}
function remove_element(element_name, data = "localStorage") {
  if (data === "localStorage") {
    localStorage.removeItem(element_name);
  } else {
    delete data[element_name];
  }
}
function get_all_data() {
  return localStorage;
}
