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
 * Convert Yjs document to plain JSON object
 * @returns {Object} Plain object representation of Yjs data
 */
function yjs_to_json() {
  if (!ydoc) return null;

  const meta = ydoc.getMap('meta');
  const sessions = ydoc.getArray('sessions');

  const result = {
    dataVersion: meta.get('dataVersion'),
    currentSession: meta.get('currentSession'),
    sessions: []
  };

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions.get(i);
    if (session === null) {
      result.sessions.push(null);
      continue;
    }

    const sessionObj = {
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

    result.sessions.push(sessionObj);
  }

  return result;
}

/**
 * Export current session only as JSON
 */
function export_current_session_json() {
  const fullData = yjs_to_json();
  const session = fullData.sessions[current_session];

  const singleSessionData = {
    dataVersion: 2.0,
    currentSession: 1,
    sessions: [null, session]
  };

  return JSON.stringify(singleSessionData, null, 2);
}

/**
 * Export all sessions as JSON
 */
function export_all_sessions_json() {
  return JSON.stringify(yjs_to_json(), null, 2);
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
 * Import JSON data into Yjs from v2.0 format
 */
function import_yjs_from_json(data, mode) {
  if (!ydoc) return;

  const sessions = ydoc.getArray('sessions');
  const meta = ydoc.getMap('meta');

  if (mode === 'replace') {
    ydoc.transact(() => {
      // Clear existing data
      while (sessions.length > 0) {
        sessions.delete(0, 1);
      }

      // Import new data
      meta.set('dataVersion', data.dataVersion);
      meta.set('currentSession', data.currentSession);

      // Import sessions
      for (let i = 0; i < data.sessions.length; i++) {
        if (data.sessions[i] === null) {
          sessions.push([null]);
          continue;
        }

        const sessionData = data.sessions[i];
        const sessionMap = new Y.Map();
        sessionMap.set('name', sessionData.name);

        // Config
        const config = new Y.Map();
        config.set('maxPointsPerQuestion', sessionData.config.maxPointsPerQuestion);
        config.set('rounding', sessionData.config.rounding);
        sessionMap.set('config', config);

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
        sessionMap.set('teams', teams);

        // Blocks
        const blocks = new Y.Array();
        for (let b = 0; b < sessionData.blocks.length; b++) {
          const blockMap = new Y.Map();
          blockMap.set('name', sessionData.blocks[b].name);
          blocks.push([blockMap]);
        }
        sessionMap.set('blocks', blocks);

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
              teamScoreMap.set('extraCredit', questionData.teams[qt].extraCredit);
              questionTeams.push([teamScoreMap]);
            }
          }
          questionMap.set('teams', questionTeams);

          questions.push([questionMap]);
        }
        sessionMap.set('questions', questions);
        sessionMap.set('currentQuestion', sessionData.currentQuestion);

        sessions.push([sessionMap]);
      }

      // Update global current_session
      current_session = data.currentSession;
    }, 'import');
  } else if (mode === 'append') {
    ydoc.transact(() => {
      const old_session_count = sessions.length - 1;

      // Append sessions from import (skip index 0 placeholder)
      for (let i = 1; i < data.sessions.length; i++) {
        const sessionData = data.sessions[i];
        const sessionMap = new Y.Map();
        sessionMap.set('name', sessionData.name);

        // Config
        const config = new Y.Map();
        config.set('maxPointsPerQuestion', sessionData.config.maxPointsPerQuestion);
        config.set('rounding', sessionData.config.rounding);
        sessionMap.set('config', config);

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
        sessionMap.set('teams', teams);

        // Blocks
        const blocks = new Y.Array();
        for (let b = 0; b < sessionData.blocks.length; b++) {
          const blockMap = new Y.Map();
          blockMap.set('name', sessionData.blocks[b].name);
          blocks.push([blockMap]);
        }
        sessionMap.set('blocks', blocks);

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
              teamScoreMap.set('extraCredit', questionData.teams[qt].extraCredit);
              questionTeams.push([teamScoreMap]);
            }
          }
          questionMap.set('teams', questionTeams);

          questions.push([questionMap]);
        }
        sessionMap.set('questions', questions);
        sessionMap.set('currentQuestion', sessionData.currentQuestion);

        sessions.push([sessionMap]);
      }

      // Set current session to last imported session
      current_session = sessions.length - 1;
      meta.set('currentSession', current_session);
    }, 'import');
  }
}

function setup_file_import() {
  //Check the support for the File API support
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    let fileSelected = document.getElementById('import_file');
    fileSelected.addEventListener('change', function (e) {
      //Set the extension for the file
      let fileExtension = /json.*/;
      //Get the file object
      let fileTobeRead = fileSelected.files[0];
      //Check of the extension match
      if (fileTobeRead.type.match(fileExtension)) {
        //Initialize the FileReader object to read the file
        let fileReader = new FileReader();
        fileReader.onload = function (e) {
          let temp_import_data = JSON.parse(fileReader.result);

          // Detect format: v2.0 (Yjs) vs v1.x (localStorage)
          const is_v2 = temp_import_data.dataVersion === 2.0 && temp_import_data.sessions && Array.isArray(temp_import_data.sessions);

          if (is_v2) {
            // v2.0 format - import directly into Yjs
            if (import_status == "replace"
                && window.confirm("Are you sure you want to irreversably delete all of your current data and replace it with this import?")) {
              import_yjs_from_json(temp_import_data, 'replace');
              sync_data_to_display();
              $( '#accordion' ).accordion({active: 0});
            } else if (import_status == "append") {
              import_yjs_from_json(temp_import_data, 'append');
              sync_data_to_display();
              $( '#accordion' ).accordion({active: 0});
            }
          } else {
            // v1.x format - validate, upgrade, then convert to Yjs
            if (validate_data(temp_import_data)) {
              let data_version = JSON.parse(get_element("data_version", temp_import_data));
              temp_import_data = data_upgrades(data_version, temp_import_data);

              // Convert localStorage format to v2.0 format
              const converted_data = convert_localStorage_to_v2(temp_import_data);

              if (import_status == "replace"
                  && window.confirm("Are you sure you want to irreversably delete all of your current data and replace it with this import?")) {
                import_yjs_from_json(converted_data, 'replace');
                sync_data_to_display();
                $( '#accordion' ).accordion({active: 0});
              } else if (import_status == "append") {
                import_yjs_from_json(converted_data, 'append');
                sync_data_to_display();
                $( '#accordion' ).accordion({active: 0});
              }
            } else {
              alert("Selected imported data is not valid.");
            }
          }
        }
        fileReader.readAsText(fileTobeRead);
      }
      else {
        alert("Please select json file for import");
      }
      //Unselect file
      fileSelected.value = "";

    }, false);
  }
  else {
    $("#import_group").html("<p>Your Browser does not support importing.</p>");
  }
}

/**
 * Convert localStorage v1.5 format to v2.0 Yjs format
 */
function convert_localStorage_to_v2(localStorageData) {
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
  
