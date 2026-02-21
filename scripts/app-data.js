function local_data_update(record) {
  var result = update_data_element(record.id, record.value);
  
  // If update_data_element returns a promise (async operations like session switch),
  // wait for it before syncing display
  if (result && typeof result.then === 'function') {
    return result;
  }
  
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
  const timer_first_point_seconds_check = /timer_first_point_seconds/;
  const timer_subsequent_point_seconds_check = /timer_subsequent_point_seconds/;
  const timer_warning_flash_seconds_check = /timer_warning_flash_seconds/;
  const delete_team_check = /delete_team_([0-9]+)/;
  const delete_block_check = /delete_block_([0-9]+)/;

  const session = get_current_session();
  if (!session) return;
  const activeSessionDoc = getActiveSessionDoc();
  if (!activeSessionDoc) return;
  if (!isUUIDSession(session)) {
    ensureSessionIsV5(activeSessionDoc);
  }
  if (!isUUIDSession(session)) return;
  var current_question = current_question_index;

  //Goto next session
  if (updated_id == "new_session") {
    // Use multi-doc createNewSession - return promise for await support
    return createNewSession().then(function(newSessionId) {
      if (newSessionId) {
        sync_data_to_display();
      }
      return newSessionId;
    });
  }

  else if (updated_id == "session_prev_button") {
    const currentSessionIndex = get_current_session_index();
    if (currentSessionIndex <= 1) {
      return;
    }
    return switchSession(currentSessionIndex - 1).then(function(switched) {
      sync_data_to_display();
      return switched;
    });
  }

  else if (updated_id == "session_next_button") {
    const sessionNames = get_session_names();
    const sessionCount = sessionNames.length - 1;
    const currentSessionIndex = get_current_session_index();
    if (currentSessionIndex < sessionCount) {
      return switchSession(currentSessionIndex + 1).then(function(switched) {
        sync_data_to_display();
        return switched;
      });
    }
    return createNewSession().then(function(newSessionId) {
      if (newSessionId) {
        sync_data_to_display();
      }
      return newSessionId;
    });
  }

  //Jump to specific session
  else if (updated_id == "session_quick_nav") {
    // Use multi-doc switchSession - return promise for await support
    // Always sync display after - if cancelled, reset dropdown to current session
    return switchSession(Number(new_value)).then(function(switched) {
      sync_data_to_display();
      return switched;
    });
  }

  //Increase total teams count
  else if (updated_id == "total_teams_increase") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const teams = getOrderedTeams(session);
    const newTeamName = t('defaults.team_name', { number: teams.length + 1 });
    createTeam(sessionDoc, session, newTeamName);
    add_history_entry('edit_log.actions.add_team', 'edit_log.details_templates.added', { name: newTeamName });
  }
  //Decrease total teams count
  else if (updated_id == "total_teams_decrease") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const teams = getOrderedTeams(session);
    if (teams.length > 1) {
      const lastTeam = teams[teams.length - 1];
      const teamName = lastTeam.data.get('name');
      if (window.confirm(t('confirm.delete_team', { name: teamName }))) {
        softDeleteTeam(sessionDoc, session, lastTeam.id);
        add_history_entry('edit_log.actions.delete_team', 'edit_log.details_templates.deleted', { name: teamName });
      }
    }
  }
  //Update Team Name
  else if (updated_id.search(team_name_check) > -1) {
    let updated_team_number = Number(updated_id.match(team_name_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const teams = getOrderedTeams(session);
    if (updated_team_number >= 1 && updated_team_number <= teams.length) {
      const team = teams[updated_team_number - 1];
      const oldName = team.data.get('name');
      updateTeamName(sessionDoc, session, team.id, new_value);
      add_history_entry('edit_log.actions.rename_team', 'edit_log.details_templates.renamed', { old: oldName, new: new_value });
    }
  }
  //Delete specific team by index
  else if (updated_id.search(delete_team_check) > -1) {
    let team_to_delete = Number(updated_id.match(delete_team_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const teams = getOrderedTeams(session);
    if (teams.length > 1 && team_to_delete >= 1 && team_to_delete <= teams.length) {
      const team = teams[team_to_delete - 1];
      const teamName = team.data.get('name');
      if (window.confirm(t('confirm.delete_team', { name: teamName }))) {
        softDeleteTeam(sessionDoc, session, team.id);
        add_history_entry('edit_log.actions.delete_team', 'edit_log.details_templates.deleted', { name: teamName });
      }
    }
  }
  //Increase total Block/Group Count
  if (updated_id == "total_blocks_increase") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const blocks = getOrderedBlocks(session);
    const newBlockName = t('defaults.block_name', { number: blocks.length });
    createBlock(sessionDoc, session, newBlockName, false);
    add_history_entry('edit_log.actions.add_block', 'edit_log.details_templates.added', { name: newBlockName });
  }
  //Decrease total Blocks/Groups count
  else if (updated_id == "total_blocks_decrease") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const blocks = getOrderedBlocks(session);
    if (blocks.length > 1) {
      const lastBlock = blocks[blocks.length - 1];
      if (!lastBlock.data.get('isDefault')) {
        const blockName = lastBlock.data.get('name');
        softDeleteBlock(sessionDoc, session, lastBlock.id);
        add_history_entry('edit_log.actions.delete_block', 'edit_log.details_templates.deleted', { name: blockName });
      }
    }
  }
  //Update Block/Group Name
  else if (updated_id.search(block_name_check) > -1) {
    let updated_block_number = Number(updated_id.match(block_name_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const blocks = getOrderedBlocks(session);
    if (updated_block_number >= 0 && updated_block_number < blocks.length) {
      const block = blocks[updated_block_number];
      const oldName = block.data.get('name');
      updateBlockName(sessionDoc, session, block.id, new_value);
      add_history_entry('edit_log.actions.rename_block', 'edit_log.details_templates.renamed', { old: oldName, new: new_value });
    }
  }
  //Delete specific block by index
  else if (updated_id.search(delete_block_check) > -1) {
    let block_to_delete = Number(updated_id.match(delete_block_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const blocks = getOrderedBlocks(session);
    if (block_to_delete >= 0 && block_to_delete < blocks.length) {
      const block = blocks[block_to_delete];
      if (!block.data.get('isDefault')) {
        const blockName = block.data.get('name');
        if (window.confirm(t('confirm.delete_block', { name: blockName }))) {
          softDeleteBlock(sessionDoc, session, block.id);
          add_history_entry('edit_log.actions.delete_block', 'edit_log.details_templates.deleted', { name: blockName });
        }
      }
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
        add_history_entry('edit_log.actions.change_max_points', 'edit_log.details_templates.increased_max_points', { old: oldValue, new: oldValue + 1 });
      }, 'local');
    }
  }
  //Decrease Max Points per Question
  else if (updated_id == "max_points_decrease") {
    const config = session.get('config');

    //Find largest actual max points and prevent max per question from going below that number
    let smallest_valid_max_points = 1;
    const orderedQuestions = getOrderedQuestions(session);
    for (const q of orderedQuestions) {
      const score = q.data.get('score') || 0;
      if (smallest_valid_max_points < score) {
        smallest_valid_max_points = score;
      }
    }
    let max_points = config.get('maxPointsPerQuestion');
    if (max_points > smallest_valid_max_points) {
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          config.set('maxPointsPerQuestion', max_points - 1);
          add_history_entry('edit_log.actions.change_max_points', 'edit_log.details_templates.decreased_max_points', { old: max_points, new: max_points - 1 });
        }, 'local');
      }
    }
  }
  //Set Max Points per Question directly (from click-to-edit)
  else if (updated_id == "max_points_direct") {
    const config = session.get('config');
    const oldValue = config.get('maxPointsPerQuestion');
    
    //Find largest actual max points - cannot go below this number
    let smallest_valid_max_points = 1;
    const orderedQuestions = getOrderedQuestions(session);
    for (const q of orderedQuestions) {
      const score = q.data.get('score') || 0;
      if (smallest_valid_max_points < score) {
        smallest_valid_max_points = score;
      }
    }
    
    // Ensure new value respects minimum
    const newValue = Math.max(smallest_valid_max_points, Math.floor(Number(new_value)));
    
    // Only update if value changed
    if (newValue !== oldValue) {
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          config.set('maxPointsPerQuestion', newValue);
          add_history_entry('edit_log.actions.change_max_points', 'edit_log.details_templates.set_max_points', { old: oldValue, new: newValue });
        }, 'local');
      }
    }
  }

  //Update Rounding Status to Yes
  else if (updated_id == "rounding_yes") {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        session.get('config').set('rounding', true);
        add_history_entry('edit_log.actions.change_rounding', 'edit_log.details_templates.enabled_rounding', {});
      }, 'local');
    }
  }
  //Update Rounding Status to No
  else if (updated_id == "rounding_no") {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        session.get('config').set('rounding', false);
        add_history_entry('edit_log.actions.change_rounding', 'edit_log.details_templates.disabled_rounding', {});
      }, 'local');
    }
  }
  //Enable or disable question timer
  else if (updated_id == "timer_enabled" || updated_id == "timer_enabled_yes" || updated_id == "timer_enabled_no") {
    const timerEnabled = updated_id == "timer_enabled_yes"
      ? true
      : updated_id == "timer_enabled_no"
        ? false
        : $("#timer_enabled").prop("checked") === true;
    $("#timer_enabled").prop("checked", timerEnabled);
    $("#timer_enabled_yes").prop("checked", timerEnabled);
    $("#timer_enabled_no").prop("checked", !timerEnabled);
    if (timerEnabled) {
      $("#timer_enabled_toggle").addClass("is-enabled");
      $("#timer_enabled_toggle").removeClass("is-disabled");
    } else {
      $("#timer_enabled_toggle").addClass("is-disabled");
      $("#timer_enabled_toggle").removeClass("is-enabled");
    }
    const sessionId = session.get('id');
    if (sessionId && typeof set_local_timer_enabled === 'function') {
      set_local_timer_enabled(sessionId, timerEnabled);
    }
    if (!timerEnabled && typeof stop_question_timer_from_user === 'function') {
      stop_question_timer_from_user();
    }
  }
  //Enable or disable auto-start for the timer (local only)
  else if (updated_id == "timer_auto_start") {
    const timerAutoStart = $("#timer_auto_start").prop("checked") === true;
    const sessionId = session.get('id');
    if (sessionId && typeof set_local_timer_auto_start === 'function') {
      set_local_timer_auto_start(sessionId, timerAutoStart);
    }
  }
  //Update timer seconds for first point
  else if (updated_id.search(timer_first_point_seconds_check) > -1) {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      const parsedValue = Math.max(0, Math.floor(Number(new_value) || 0));
      sessionDoc.transact(() => {
        session.get('config').set('timerFirstPointSeconds', parsedValue);
      }, 'local');
    }
  }
  //Update timer seconds for subsequent points
  else if (updated_id.search(timer_subsequent_point_seconds_check) > -1) {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      const parsedValue = Math.max(0, Math.floor(Number(new_value) || 0));
      sessionDoc.transact(() => {
        session.get('config').set('timerSubsequentPointSeconds', parsedValue);
      }, 'local');
    }
  }
  //Update timer warning flash seconds threshold
  else if (updated_id.search(timer_warning_flash_seconds_check) > -1) {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      const parsedValue = Math.max(0, Math.floor(Number(new_value) || 0));
      sessionDoc.transact(() => {
        session.get('config').set('timerWarningFlashSeconds', parsedValue);
      }, 'local');
    }
  }
  //Restart question timer
  else if (updated_id == "question_timer_restart") {
    if (typeof restart_question_timer_from_current_question === 'function') {
      restart_question_timer_from_current_question();
    }
  }
  //Toggle question timer play/pause
  else if (updated_id == "question_timer_play_pause") {
    if (typeof toggle_question_timer_play_pause === 'function') {
      toggle_question_timer_play_pause();
    }
  }
  //Adjust question timer duration and persist per-question adjustment in Yjs
  else if (updated_id == "question_timer_decrease" || updated_id == "question_timer_increase") {
    const delta = updated_id == "question_timer_increase" ? 1 : -1;
    if (typeof adjust_question_timer_for_current_question === 'function') {
      adjust_question_timer_for_current_question(delta);
    }
  }
  //Update Ignore Question Status
  else if (updated_id == "ignore_question") {
    let temp = $("#ignore_question").prop("checked");
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const questions = getOrderedQuestions(session);
    if (current_question_index >= 1 && current_question_index <= questions.length) {
      const question = questions[current_question_index - 1];
      const questionName = question.data.get('name');
      updateQuestionIgnore(sessionDoc, session, question.id, temp);
      if (temp) {
        add_history_entry('edit_log.actions.ignore_question', 'edit_log.details_templates.set_ignored', { name: questionName });
      } else {
        add_history_entry('edit_log.actions.include_question', 'edit_log.details_templates.set_included', { name: questionName });
      }
    }
  }
  //Toggle Extra Credit
  else if (updated_id == "extra_credit") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const questions = getOrderedQuestions(session);
    const teams = getOrderedTeams(session);
    if (current_question_index >= 1 && current_question_index <= questions.length) {
      const question = questions[current_question_index - 1];
      const questionName = question.data.get('name');

      if ($("#extra_credit").prop("checked")) {
        sessionDoc.transact(() => {
          add_history_entry('edit_log.actions.enable_extra_credit', 'edit_log.details_templates.enabled_extra_credit', { name: questionName });
        }, 'local');
      } else {
        // Check for existing extra credit
        let temp_extra_credit = 0;
        for (let i = 0; i < teams.length; i++) {
          const score = getTeamScore(session, question.id, teams[i].id);
          const ec = score ? score.extraCredit : 0;
          $('#team_'+(i+1)+'_extra_credit').text(ec);
          temp_extra_credit += ec;
        }
        
        if (temp_extra_credit > 0 && window.confirm(t('confirm.delete_extra_credit'))) {
          sessionDoc.transact(() => {
            for (let i = 0; i < teams.length; i++) {
              setTeamExtraCredit(sessionDoc, session, question.id, teams[i].id, 0);
            }
            add_history_entry('edit_log.actions.clear_extra_credit', 'edit_log.details_templates.cleared_extra_credit', { name: questionName });
          }, 'local');
        } else {
          sessionDoc.transact(() => {
            add_history_entry('edit_log.actions.disable_extra_credit', 'edit_log.details_templates.disabled_extra_credit', { name: questionName });
          }, 'local');
        }
      }
    }
  }
  //increase team extra credit
  else if (updated_id.search(increase_team_extra_credit_check) > -1) {
    let team_number = Number(updated_id.match(increase_team_extra_credit_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const teams = getOrderedTeams(session);
    const questions = getOrderedQuestions(session);
    if (team_number >= 1 && team_number <= teams.length && current_question_index >= 1 && current_question_index <= questions.length) {
      const team = teams[team_number - 1];
      const question = questions[current_question_index - 1];
      const currentScore = getTeamScore(session, question.id, team.id);
      const currentEC = currentScore ? currentScore.extraCredit : 0;
      setTeamExtraCredit(sessionDoc, session, question.id, team.id, currentEC + 1);
      add_history_entry('edit_log.actions.extra_credit', 'edit_log.details_templates.increased_extra_credit', { 
        team: team.data.get('name'), 
        question: question.data.get('name'), 
        value: currentEC + 1 
      });
    }
  }
  //decrease team extra credit
  else if (updated_id.search(decrease_team_extra_credit_check) > -1) {
    let team_number = Number(updated_id.match(decrease_team_extra_credit_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const teams = getOrderedTeams(session);
    const questions = getOrderedQuestions(session);
    if (team_number >= 1 && team_number <= teams.length && current_question_index >= 1 && current_question_index <= questions.length) {
      const team = teams[team_number - 1];
      const question = questions[current_question_index - 1];
      const currentScore = getTeamScore(session, question.id, team.id);
      const currentEC = currentScore ? currentScore.extraCredit : 0;
      if (currentEC > 0) {
        setTeamExtraCredit(sessionDoc, session, question.id, team.id, currentEC - 1);
        add_history_entry('edit_log.actions.extra_credit', 'edit_log.details_templates.decreased_extra_credit', { 
          team: team.data.get('name'), 
          question: question.data.get('name'), 
          value: currentEC - 1 
        });
      }
    }
  }
  //Update Current Question Max Possible Score
  else if (updated_id.search(question_max_points_check) > -1) {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const questions = getOrderedQuestions(session);
    const teams = getOrderedTeams(session);
    if (current_question_index >= 1 && current_question_index <= questions.length) {
      const question = questions[current_question_index - 1];
      const questionName = question.data.get('name');
      const oldScore = question.data.get('score');
      
      // Find max earned score across all teams
      let temp_max = 0;
      for (let i = 0; i < teams.length; i++) {
        const score = getTeamScore(session, question.id, teams[i].id);
        if (score && score.score > temp_max) {
          temp_max = score.score;
        }
      }
      
      if (Number(new_value) >= temp_max) {
        updateQuestionScore(sessionDoc, session, question.id, Number(new_value));
        if (typeof start_question_timer_from_question_points === 'function') {
          start_question_timer_from_question_points(Number(new_value));
        }
        add_history_entry('edit_log.actions.set_question_points', 'edit_log.details_templates.set_question_points', { name: questionName, old: oldScore, new: new_value });
      }
    }
  }
  //Update Current Question's Block/Group
  else if (updated_id.search(question_block_check) > -1) {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const questions = getOrderedQuestions(session);
    const blocks = getOrderedBlocks(session);
    if (current_question_index >= 1 && current_question_index <= questions.length) {
      const question = questions[current_question_index - 1];
      const questionName = question.data.get('name');
      const oldBlockId = question.data.get('blockId');
      const oldBlock = getBlockById(session, oldBlockId);
      const oldBlockName = oldBlock ? oldBlock.get('name') : '';
      
      // new_value is the display index
      const blockIndex = Number(new_value);
      if (blockIndex >= 0 && blockIndex < blocks.length) {
        const newBlock = blocks[blockIndex];
        updateQuestionBlock(sessionDoc, session, question.id, newBlock.id);
        add_history_entry('edit_log.actions.change_question_block', 'edit_log.details_templates.changed_block', { 
          question: questionName, 
          old: oldBlockName, 
          new: newBlock.data.get('name') 
        });
      }
    }
  }
  //Update score for a team on the current question
  else if (updated_id.search(team_question_score_check) > -1) {
    let team_number = Number(updated_id.match(team_question_score_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const teams = getOrderedTeams(session);
    const questions = getOrderedQuestions(session);
    if (team_number >= 1 && team_number <= teams.length && current_question_index >= 1 && current_question_index <= questions.length) {
      const team = teams[team_number - 1];
      const question = questions[current_question_index - 1];
      const currentScore = getTeamScore(session, question.id, team.id);
      const oldScore = currentScore ? currentScore.score : 0;
      setTeamScore(sessionDoc, session, question.id, team.id, Number(new_value));
      add_history_entry('edit_log.actions.score_change', 'edit_log.details_templates.score_changed', { 
        team: team.data.get('name'), 
        question: question.data.get('name'), 
        old: oldScore, 
        new: new_value 
      });
    }
  }
  //Go forward one question
  else if (updated_id == "next_question" || updated_id == "next_question_2") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    const questions = getOrderedQuestions(session);
    const question_count = questions.length;
    
    if (current_question_index === question_count) {
      // At last question - only add new one if current has max points set
      const currentQuestion = questions[current_question_index - 1];
      const question_max_points = currentQuestion.data.get('score');
      if (question_max_points > 0) {
        sessionDoc.transact(() => {
          createQuestion(sessionDoc, session, {
            name: t('defaults.question_name', { number: current_question_index + 1 }),
            score: 0,
            blockId: null  // Default block
          });
          current_question_index = current_question_index + 1;
        }, 'local');
      }
    } else {
      // Move forward to existing question
      sessionDoc.transact(() => {
        current_question_index = current_question_index + 1;
      }, 'local');
    }
  }
  //Go to previous question
  else if (updated_id == "previous_question" || updated_id == "previous_question_2") {
    if (current_question > 1) {
      const sessionDoc = getActiveSessionDoc();
      if (sessionDoc) {
        sessionDoc.transact(() => {
          current_question_index = current_question - 1;
        }, 'local');
      }
    }
  }
  //Jump to specific question
  else if (updated_id == "question_quick_nav") {
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        current_question_index = Number(new_value);
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
        add_history_entry('edit_log.actions.export_session', 'edit_log.details_templates.exported_session_yjs', {});
      } else {
        // Fallback to JSON if binary export fails
        downloadBlob(export_current_session_json(), 'pbe_session_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
        add_history_entry('edit_log.actions.export_session', 'edit_log.details_templates.exported_session_json', {});
      }
    } catch (error) {
      console.warn('Binary export failed, falling back to JSON:', error);
      downloadBlob(export_current_session_json(), 'pbe_session_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
      add_history_entry('edit_log.actions.export_session', 'edit_log.details_templates.exported_session_json_fallback', {});
    }
  }
  //Export all to JSON and binary formats
  else if (updated_id == "export_all_json") {
    // Export as binary container with all sessions (async - loads all sessions from IndexedDB)
    (async function() {
      try {
        const exportData = await exportAllSessions();
        if (exportData && exportData.length > 0) {
          downloadBinaryExport(exportData, 'pbe_all_sessions_' + (new Date().toJSON().slice(0,10)) + '.yjs');
          add_history_entry('edit_log.actions.export_all_sessions', 'edit_log.details_templates.exported_all_yjs', {});
        } else {
          // Fallback to JSON if binary export fails
          const jsonData = await export_all_sessions_json();
          downloadBlob(jsonData, 'all_pbe_score_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
          add_history_entry('edit_log.actions.export_all_sessions', 'edit_log.details_templates.exported_all_json', {});
        }
      } catch (error) {
        console.warn('Binary export failed, falling back to JSON:', error);
        try {
          const jsonData = await export_all_sessions_json();
          downloadBlob(jsonData, 'all_pbe_score_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
          add_history_entry('edit_log.actions.export_all_sessions', 'edit_log.details_templates.exported_all_json_fallback', {});
        } catch (jsonError) {
          console.error('JSON export also failed:', jsonError);
        }
      }
    })();
    return; // Prevent sync_data_to_display from running before export completes
  }
  //Delete current session
  else if (updated_id == "session_delete") {
    const meta = getGlobalDoc().getMap('meta');
    const currentSessionId = meta.get('currentSession');

    // Delegate validation and confirmations to deleteSession (multi-doc aware)
    // Note: deleteSession is async and handles its own sync_data_to_display
    deleteSession(currentSessionId).catch(function(err) {
      console.error('Delete session failed:', err);
    });
    return; // Prevent sync_data_to_display from running before delete completes
  }
}

function reorder_teams(order) {
  const session = get_current_session();
  if (!session) return;

  const sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) return;

  if (!isUUIDSession(session)) {
    ensureSessionIsV5(sessionDoc);
  }
  if (!isUUIDSession(session)) return;

  const teamOrder = session.get('teamOrder');
  if (!teamOrder) return;
  
  const teamCount = teamOrder.length;
  if (order.length !== teamCount) return;
  
  // Build description of reorder for history
  const orderedTeams = getOrderedTeams(session);
  let oldNames = orderedTeams.map(t => t.data.get('name'));
  let newNames = order.map(idx => oldNames[Number(idx) - 1]);
  
  sessionDoc.transact(() => {
    // Build new order of UUIDs
    const oldUUIDs = [];
    for (let i = 0; i < teamOrder.length; i++) {
      oldUUIDs.push(teamOrder.get(i));
    }
    
    const newUUIDs = order.map(idx => oldUUIDs[Number(idx) - 1]);
    
    // Clear and repopulate teamOrder (CRDT-safe: just array reorder)
    teamOrder.delete(0, teamOrder.length);
    teamOrder.push(newUUIDs);
    
    // Update sortOrder on each team
    for (let i = 0; i < newUUIDs.length; i++) {
      const team = getTeamById(session, newUUIDs[i]);
      if (team) {
        team.set('sortOrder', i);
      }
    }
    
    add_history_entry('edit_log.actions.reorder_teams', 'edit_log.details_templates.new_order', { order: newNames.join(', ') });
  }, 'local');
}

function reorder_blocks(order) {
  const session = get_current_session();
  if (!session) return;

  const sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) return;

  if (!isUUIDSession(session)) {
    ensureSessionIsV5(sessionDoc);
  }
  if (!isUUIDSession(session)) return;

  const blockOrder = session.get('blockOrder');
  if (!blockOrder) return;
  
  // Note: order is 1-based from UI but blockOrder is 0-based
  // Need to account for block 0 ("No Block") being at index 0
  // The UI reorder only affects blocks 1+ (non-default blocks)
  const blockCount = blockOrder.length - 1;  // Exclude default block
  if (order.length !== blockCount) return;
  
  // Build description of reorder for history
  const orderedBlocks = getOrderedBlocks(session);
  let oldNames = orderedBlocks.slice(1).map(b => b.data.get('name'));  // Skip default block
  let newNames = order.map(idx => oldNames[Number(idx) - 1]);
  
  sessionDoc.transact(() => {
    // Get current UUIDs (skip first one which is default block)
    const defaultBlockId = blockOrder.get(0);
    const oldUUIDs = [];
    for (let i = 1; i < blockOrder.length; i++) {
      oldUUIDs.push(blockOrder.get(i));
    }
    
    const newUUIDs = order.map(idx => oldUUIDs[Number(idx) - 1]);
    
    // Clear and repopulate blockOrder (keep default block first)
    blockOrder.delete(0, blockOrder.length);
    blockOrder.push([defaultBlockId]);
    blockOrder.push(newUUIDs);
    
    // Update sortOrder on each block
    for (let i = 0; i < blockOrder.length; i++) {
      const block = getBlockById(session, blockOrder.get(i));
      if (block) {
        block.set('sortOrder', i);
      }
    }
    
    add_history_entry('edit_log.actions.reorder_blocks', 'edit_log.details_templates.new_order', { order: newNames.join(', ') });
  }, 'local');
}

// Note: detectAndMergeDuplicateQuestions and mergeQuestionDuplicates removed in v5.0
// With deterministic question IDs (q-1, q-2), duplicate questions cannot occur
// because both peers will create the same ID and Yjs will merge at the CRDT level
