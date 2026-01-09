function local_data_update(record) {
  update_data_element(record.id, record.value);

  sync_data_to_display();
}

function external_data_update(record) {
  sync_data_to_display();
}
function update_data_element(updated_id, new_value) {
  const team_name_check = /team_([0-9]+)_name/;
  const block_name_check = /block_([0-9]+)_name/;
  const question_max_points_check = /question_score_([0-9]+)/;
  const question_block_check = /question_block_([0-9]+)/;
  const team_question_score_check = /team_([0-9]+)_score_([0-9]+)/;
  const decrease_team_extra_credit_check = /team_([0-9]+)_extra_credit_decrease/;
  const increase_team_extra_credit_check = /team_([0-9]+)_extra_credit_increase/;

  const session = get_current_session();
  if (!session) return;
  var current_question = session.get('currentQuestion');

  //Update Session Name
  if (updated_id == "session_name") {
    let new_value = $("#session_name").text();
    const oldName = session.get('name');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        session.set('name', new_value);
        add_history_entry('Rename Session', 'Renamed "' + oldName + '" to "' + new_value + '"');
      }, 'local');
    }
    $("#session_quick_nav").focus();
  }
  //Goto next session
  else if (updated_id == "new_session") {
    // Use multi-doc createNewSession - return promise for await support
    return createNewSession().then(function(newSessionId) {
      if (newSessionId) {
        sync_data_to_display();
      }
      return newSessionId;
    });
  }

  //Jump to specific session
  else if (updated_id == "session_quick_nav") {
    // Use multi-doc switchSession
    switchSession(Number(new_value));
  }

  //Increase total teams count
  else if (updated_id == "total_teams_increase") {
    const teams = session.get('teams');
    const questions = session.get('questions');
    const new_team_num = teams.length;
    const sessionDoc = getActiveSessionDoc();

    if (sessionDoc) {
      sessionDoc.transact(() => {
        // Add new team
        const newTeam = new Y.Map();
        newTeam.set('name', 'Team ' + new_team_num);
        teams.push([newTeam]);

        // Add placeholder scores for all existing questions
        for (let i = 1; i < questions.length; i++) {
          const question = questions.get(i);
          const questionTeams = question.get('teams');
          const teamScore = new Y.Map();
          teamScore.set('score', 0);
          teamScore.set('extraCredit', 0);
          questionTeams.push([teamScore]);
        }

        add_history_entry('Add Team', 'Added "Team ' + new_team_num + '"');
      }, 'local');
    }
  }
  //Decrease total teams count
  else if (updated_id == "total_teams_decrease") {
    const teams = session.get('teams');
    const questions = session.get('questions');
    if (teams.length > 2) {
      const lastTeam = teams.get(teams.length - 1);
      const teamName = lastTeam.get('name');
      if (window.confirm("Do you really want Delete " + teamName + "?")) {
        const sessionDoc = getActiveSessionDoc();
        if (sessionDoc) {
          sessionDoc.transact(() => {
            // Remove team from teams array
            teams.delete(teams.length - 1, 1);

            // Remove team scores from all questions
            for (let i = 1; i < questions.length; i++) {
              const question = questions.get(i);
              const questionTeams = question.get('teams');
              questionTeams.delete(questionTeams.length - 1, 1);
            }

            add_history_entry('Delete Team', 'Deleted "' + teamName + '"');
          }, 'local');
        }
      }
    }
  }
  //Update Team Name
  else if (updated_id.search(team_name_check) > -1) {
    let updated_team_number = Number(updated_id.match(team_name_check)[1]);
    const teams = session.get('teams');
    const oldName = teams.get(updated_team_number).get('name');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        teams.get(updated_team_number).set('name', new_value);
        add_history_entry('Rename Team', 'Renamed "' + oldName + '" to "' + new_value + '"');
      }, 'local');
    }
  }
  //Increase total Block/Group Count
  if (updated_id == "total_blocks_increase") {
    const blocks = session.get('blocks');
    const blockNum = blocks.length;
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        const newBlock = new Y.Map();
        newBlock.set('name', 'Block/Group ' + blockNum);
        blocks.push([newBlock]);
        add_history_entry('Add Block/Group', 'Added "Block/Group ' + blockNum + '"');
      }, 'local');
    }
  }
  //Decrease total Blocks/Groups count
  else if (updated_id == "total_blocks_decrease") {
    const blocks = session.get('blocks');
    const questions = session.get('questions');

    //Don't allow deleting of blocks that are in use
    let question_count = questions.length - 1;
    let smallest_valid_number_of_blocks = 1;
    for (let i = 1; i <= question_count; i++) {
      let temp_max_blocks = questions.get(i).get('block');
      if (smallest_valid_number_of_blocks < temp_max_blocks) {
        smallest_valid_number_of_blocks = temp_max_blocks;
      }
    }
    if (blocks.length > (smallest_valid_number_of_blocks + 1)) {
      const blockToDelete = blocks.get(blocks.length - 1);
      const blockName = blockToDelete.get('name');
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          blocks.delete(blocks.length - 1, 1);
          add_history_entry('Delete Block/Group', 'Deleted "' + blockName + '"');
        }, 'local');
      }
    }
  }
  //Update Block/Group Name
  else if (updated_id.search(block_name_check) > -1) {
    let updated_block_number = Number(updated_id.match(block_name_check)[1]);
    const blocks = session.get('blocks');
    const oldName = blocks.get(updated_block_number).get('name');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        blocks.get(updated_block_number).set('name', new_value);
        add_history_entry('Rename Block/Group', 'Renamed "' + oldName + '" to "' + new_value + '"');
      }, 'local');
    }
  }
  //Increase Max Points per Question
  if (updated_id == "max_points_increase") {
    const config = session.get('config');
    const oldValue = config.get('maxPointsPerQuestion');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        config.set('maxPointsPerQuestion', oldValue + 1);
        add_history_entry('Change Max Points', 'Increased max points from ' + oldValue + ' to ' + (oldValue + 1));
      }, 'local');
    }
  }
  //Decrease Max Points per Question
  else if (updated_id == "max_points_decrease") {
    const config = session.get('config');
    const questions = session.get('questions');

    //Find largest actual max points and prevent max per question from going below that number
    let question_count = questions.length - 1;
    let smallest_valid_max_points = 1;
    for (let i = 1; i <= question_count; i++) {
      let temp_max_points = questions.get(i).get('score');
      if (smallest_valid_max_points < temp_max_points) {
        smallest_valid_max_points = temp_max_points;
      }
    }
    let max_points = config.get('maxPointsPerQuestion');
    if (max_points > smallest_valid_max_points) {
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          config.set('maxPointsPerQuestion', max_points - 1);
          add_history_entry('Change Max Points', 'Decreased max points from ' + max_points + ' to ' + (max_points - 1));
        }, 'local');
      }
    }
  }
  //Update Question Title
  else if (updated_id == "current_question_title") {
    let new_value = $("#current_question_title").text();
    const questions = session.get('questions');
    const oldName = questions.get(current_question).get('name');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        questions.get(current_question).set('name', new_value);
        add_history_entry('Rename Question', 'Renamed "' + oldName + '" to "' + new_value + '"');
      }, 'local');
    }
    $("#question_quick_nav").focus();
  }
  //Update Rounding Status to Yes
  else if (updated_id == "rounding_yes") {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        session.get('config').set('rounding', true);
        add_history_entry('Change Rounding', 'Enabled rounding to best team\'s total');
      }, 'local');
    }
  }
  //Update Rounding Status to No
  else if (updated_id == "rounding_no") {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        session.get('config').set('rounding', false);
        add_history_entry('Change Rounding', 'Disabled rounding');
      }, 'local');
    }
  }
  //Update Ignore Question Status
  else if (updated_id == "ignore_question") {
    let temp = $("#ignore_question").prop("checked");
    const questions = session.get('questions');
    const questionName = questions.get(current_question).get('name');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        questions.get(current_question).set('ignore', temp);
        if (temp) {
          add_history_entry('Ignore Question', 'Set "' + questionName + '" to be ignored');
        } else {
          add_history_entry('Include Question', 'Set "' + questionName + '" to be included');
        }
      }, 'local');
    }
  }
  //Toggle Extra Credit
  else if (updated_id == "extra_credit") {
    const questions = session.get('questions');
    const currentQuestionObj = questions.get(current_question);
    const questionName = currentQuestionObj.get('name');

    if ($("#extra_credit").prop("checked")) {
      // Log enabling extra credit
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          add_history_entry('Enable Extra Credit', 'Enabled extra credit for "' + questionName + '"');
        }, 'local');
      }
    } else {
      // Disabling extra credit - may need to clear existing extra credit
      const questionTeams = currentQuestionObj.get('teams');
      const teams = session.get('teams');
      let team_count = teams.length - 1;

      let temp_extra_credit = 0;
      for (let i=1;i<=team_count;i++) {
        let temp = questionTeams.get(i).get('extraCredit') || 0;
        $('#team_'+i+'_extra_credit').text(temp);
        temp_extra_credit += temp;
      }
      //Only display warning if there actually is extra credit to delete
      if (temp_extra_credit > 0 && window.confirm("Are you sure you want to irreversably delete this question's extra credit?")) {
        const sessionDoc = getActiveSessionDoc();
        if (sessionDoc) {
          sessionDoc.transact(() => {
            for (let i = 1; i <= team_count; i++) {
              questionTeams.get(i).set('extraCredit', 0);
            }
            add_history_entry('Clear Extra Credit', 'Cleared all extra credit for "' + questionName + '"');
          }, 'local');
        }
      } else {
        // Just log disabling extra credit (no clearing needed)
        const sessionDoc = getActiveSessionDoc();
        if (sessionDoc) {
          sessionDoc.transact(() => {
            add_history_entry('Disable Extra Credit', 'Disabled extra credit for "' + questionName + '"');
          }, 'local');
        }
      }
    }
  }
  //increase team extra credit
  else if (updated_id.search(increase_team_extra_credit_check) > -1) {
    let team_number = Number(updated_id.match(increase_team_extra_credit_check)[1]);
    const questions = session.get('questions');
    const teams = session.get('teams');
    const questionTeams = questions.get(current_question).get('teams');
    const questionName = questions.get(current_question).get('name');
    const teamName = teams.get(team_number).get('name');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        let team_extra_credit = questionTeams.get(team_number).get('extraCredit');
        questionTeams.get(team_number).set('extraCredit', team_extra_credit + 1);
        add_history_entry('Extra Credit', 'Increased extra credit for "' + teamName + '" on "' + questionName + '" to ' + (team_extra_credit + 1));
      }, 'local');
    }
  }
  //decrease team extra credit
  else if (updated_id.search(decrease_team_extra_credit_check) > -1) {
    let team_number = Number(updated_id.match(decrease_team_extra_credit_check)[1]);
    const questions = session.get('questions');
    const teams = session.get('teams');
    const questionTeams = questions.get(current_question).get('teams');
    const questionName = questions.get(current_question).get('name');
    const teamName = teams.get(team_number).get('name');
    let team_extra_credit = questionTeams.get(team_number).get('extraCredit');
    if (team_extra_credit > 0) {
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          questionTeams.get(team_number).set('extraCredit', team_extra_credit - 1);
          add_history_entry('Extra Credit', 'Decreased extra credit for "' + teamName + '" on "' + questionName + '" to ' + (team_extra_credit - 1));
        }, 'local');
      }
    }
  }
  //Update Current Question Max Possible Score
  else if (updated_id.search(question_max_points_check) > -1) {
    //Disable selecting max possible score lower than already earned score
    const questions = session.get('questions');
    const questionTeams = questions.get(current_question).get('teams');
    const teams = session.get('teams');
    const questionName = questions.get(current_question).get('name');
    const oldScore = questions.get(current_question).get('score');
    let team_count = teams.length - 1;
    let temp_max = 0;
    for (let i = 1; i <= team_count; i++) {
      if (temp_max < questionTeams.get(i).get('score')) {
        temp_max = questionTeams.get(i).get('score');
      }
    }
    if (new_value >= temp_max) {
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          questions.get(current_question).set('score', Number(new_value));
          add_history_entry('Set Question Points', 'Set max points for "' + questionName + '" from ' + oldScore + ' to ' + new_value);
        }, 'local');
      }
    }
  }
  //Update Current Question's Block/Group
  else if (updated_id.search(question_block_check) > -1) {
    const questions = session.get('questions');
    const blocks = session.get('blocks');
    const questionName = questions.get(current_question).get('name');
    const oldBlockNum = questions.get(current_question).get('block');
    const oldBlockName = blocks.get(oldBlockNum).get('name');
    const newBlockName = blocks.get(Number(new_value)).get('name');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        questions.get(current_question).set('block', Number(new_value));
        add_history_entry('Change Question Block', 'Changed "' + questionName + '" from "' + oldBlockName + '" to "' + newBlockName + '"');
      }, 'local');
    }
  }
  //Update score for a team on the current question
  else if (updated_id.search(team_question_score_check) > -1) {
    let team_number = Number(updated_id.match(team_question_score_check)[1]);
    const questions = session.get('questions');
    const teams = session.get('teams');
    const questionName = questions.get(current_question).get('name');
    const teamName = teams.get(team_number).get('name');
    const oldScore = questions.get(current_question).get('teams').get(team_number).get('score');
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        questions.get(current_question).get('teams').get(team_number).set('score', Number(new_value));
        add_history_entry('Score Change', '"' + teamName + '" on "' + questionName + '" from ' + oldScore + ' to ' + new_value);
      }, 'local');
    }
  }
  //Go forward one question
  else if (updated_id == "next_question" || updated_id == "next_question_2") {
    const questions = session.get('questions');
    let question_count = questions.length - 1;
    if (current_question == question_count) {
      //Only move forward if current question has a max possible score set
      let question_max_points = questions.get(current_question).get('score');
      if (question_max_points > 0) {
        //Add a new question
        const teams = session.get('teams');
        let team_count = teams.length - 1;

        const sessionDoc = getActiveSessionDoc();
        if (sessionDoc) {
          sessionDoc.transact(() => {
            //Move current Question forward one
            session.set('currentQuestion', current_question + 1);

            //Create new question
            const newQuestion = new Y.Map();
            newQuestion.set('name', 'Question ' + (current_question + 1));
            newQuestion.set('score', 0);
            newQuestion.set('block', 0);
            newQuestion.set('ignore', false);

            //Set default score for all teams on this question to 0
            const newQuestionTeams = new Y.Array();
            newQuestionTeams.push([null]); // Placeholder
            for (let i = 1; i <= team_count; i++) {
              const teamScore = new Y.Map();
              teamScore.set('score', 0);
              teamScore.set('extraCredit', 0);
              newQuestionTeams.push([teamScore]);
            }
            newQuestion.set('teams', newQuestionTeams);

            questions.push([newQuestion]);
          }, 'local');
        }
      }
    } else {
      //Move forward to existing question
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          session.set('currentQuestion', current_question + 1);
        }, 'local');
      }
    }
  }
  //Go to previous question
  else if (updated_id == "previous_question" || updated_id == "previous_question_2") {
    if (current_question > 1) {
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          session.set('currentQuestion', current_question - 1);
        }, 'local');
      }
    }
  }
  //Jump to specific question
  else if (updated_id == "question_quick_nav") {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        session.set('currentQuestion', Number(new_value));
      }, 'local');
    }
  }
  //Export team data for session
  else if (updated_id == "export_team") {
    let temp = get_team_score_summary();
    downloadBlob(arrayToCsv(temp), 'team_data.csv', 'text/csv;charset=utf-8;');
  }
  //Export block data for session
  else if (updated_id == "export_block") {
    let temp = get_block_score_summary();
    downloadBlob(arrayToCsv(temp), 'block_data.csv', 'text/csv;charset=utf-8;');
  }
  //Export team and block data for session
  else if (updated_id == "export_team_and_block") {
    let temp = get_team_and_block_score_summary();
    downloadBlob(arrayToCsv(temp), 'team_and_block_data.csv', 'text/csv;charset=utf-8;');
  }
  //Export question log data for session
  else if (updated_id == "export_question_log") {
    let temp = get_question_log();
    downloadBlob(arrayToCsv(temp), 'question_log_data.csv', 'text/csv;charset=utf-8;');
  }
  //Export session to JSON and binary formats
  else if (updated_id == "export_session_json") {
    // Try binary export first (Phase 3.1)
    try {
      const binary = exportSession(get_current_session_index());
      if (binary && binary.length > 0) {
        downloadBinaryExport(binary, 'pbe_session_' + (new Date().toJSON().slice(0,10)) + '.yjs');
      } else {
        // Fallback to JSON if binary export fails
        downloadBlob(export_current_session_json(), 'pbe_session_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
      }
    } catch (error) {
      console.warn('Binary export failed, falling back to JSON:', error);
      downloadBlob(export_current_session_json(), 'pbe_session_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
    }
  }
  //Export all to JSON and binary formats
  else if (updated_id == "export_all_json") {
    // Export as binary container with all sessions
    try {
      const exportData = exportAllSessions();
      if (exportData && exportData.length > 0) {
        downloadBinaryExport(exportData, 'pbe_all_sessions_' + (new Date().toJSON().slice(0,10)) + '.yjs');
      } else {
        // Fallback to JSON if binary export fails
        downloadBlob(export_all_sessions_json(), 'all_pbe_score_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
      }
    } catch (error) {
      console.warn('Binary export failed, falling back to JSON:', error);
      downloadBlob(export_all_sessions_json(), 'all_pbe_score_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
    }
  }
  //Delete current session
  else if (updated_id == "session_delete") {
    const globalDoc = getGlobalDoc();
    const sessionOrder = globalDoc.getArray('sessionOrder');
    const meta = globalDoc.getMap('meta');
    const currentSessionId = meta.get('currentSession');

    //Only Delete if more than one session exists
    if (sessionOrder.length > 1) {
      if (window.confirm("Are you sure you want to irreversably delete this Session (Round/Game)?")) {
        deleteSession(currentSessionId);
        alert("Deleted");
      }
    }
    else {
      alert("You may not delete the only Session (Round/Game)");
    }
  }
}

function reorder_teams(order) {
  const session = get_current_session();
  if (!session) return;

  const teams = session.get('teams');
  let team_count = teams.length - 1;
  if (order.length !== team_count) {
    return;
  }

  // Build description of reorder
  let oldOrder = [];
  for (let i = 1; i <= team_count; i++) {
    oldOrder.push(teams.get(i).get('name'));
  }

  // Build new order description
  let newOrder = [];
  for (let i = 0; i < order.length; i++) {
    let index = Number(order[i]);
    newOrder.push(oldOrder[index - 1]);
  }

  const sessionDoc = getActiveSessionDoc();
  if (sessionDoc) {
    sessionDoc.transact(() => {
      // Collect team data in new order
      let temp_team_data = [];
      for (let i = 0; i < order.length; i++) {
        let index = Number(order[i]);
        const team = teams.get(index);
        temp_team_data.push({ name: team.get('name') });
      }

      // Delete all teams (except index 0)
      teams.delete(1, teams.length - 1);

      // Create new team objects in new order
      for (let i = 0; i < temp_team_data.length; i++) {
        const newTeam = new Y.Map();
        newTeam.set('name', temp_team_data[i].name);
        teams.push([newTeam]);
      }

      // Reorder team scores for all questions
      const questions = session.get('questions');
      let question_count = questions.length - 1;
      for (let i = 1; i <= question_count; i++) {
        const question = questions.get(i);
        const questionTeams = question.get('teams');

        // Collect score data in new order
        let temp_score_data = [];
        for (let j = 0; j < order.length; j++) {
          let index = Number(order[j]);
          const teamScore = questionTeams.get(index);
          temp_score_data.push({
            score: teamScore.get('score'),
            extraCredit: teamScore.get('extraCredit')
          });
        }

        // Delete all scores (except index 0)
        questionTeams.delete(1, questionTeams.length - 1);

        // Create new score objects in new order
        for (let j = 0; j < temp_score_data.length; j++) {
          const newScore = new Y.Map();
          newScore.set('score', temp_score_data[j].score);
          newScore.set('extraCredit', temp_score_data[j].extraCredit);
          questionTeams.push([newScore]);
        }
      }

      // Add history entry
      add_history_entry('Reorder Teams', 'New order: ' + newOrder.join(', '));
    }, 'local');
  }
}

function reorder_blocks(order) {
  const session = get_current_session();
  if (!session) return;

  const blocks = session.get('blocks');
  let block_count = blocks.length - 1;
  if (order.length !== block_count) {
    return;
  }

  // Build description of reorder
  let oldOrder = [];
  for (let i = 1; i <= block_count; i++) {
    oldOrder.push(blocks.get(i).get('name'));
  }

  // Build new order description
  let newOrder = [];
  for (let i = 0; i < order.length; i++) {
    let index = Number(order[i]);
    newOrder.push(oldOrder[index - 1]);
  }

  const sessionDoc = getActiveSessionDoc();
  if (sessionDoc) {
    sessionDoc.transact(() => {
      // Collect block data in new order
      let temp_block_data = [];
      let block_map = {};
      for (let i = 0; i < order.length; i++) {
        let index = Number(order[i]);
        block_map[index] = i + 1;
        const block = blocks.get(index);
        temp_block_data.push({ name: block.get('name') });
      }

      // Delete all blocks (except index 0)
      blocks.delete(1, blocks.length - 1);

      // Create new block objects in new order
      for (let i = 0; i < temp_block_data.length; i++) {
        const newBlock = new Y.Map();
        newBlock.set('name', temp_block_data[i].name);
        blocks.push([newBlock]);
      }

      // Update question block references
      const questions = session.get('questions');
      let question_count = questions.length - 1;
      for (let i = 1; i <= question_count; i++) {
        const question = questions.get(i);
        let existing_block = question.get('block');
        if (existing_block > 0 && block_map[existing_block]) {
          question.set('block', block_map[existing_block]);
        }
      }

      // Add history entry
      add_history_entry('Reorder Blocks/Groups', 'New order: ' + newOrder.join(', '));
    }, 'local');
  }
}
