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
  const delete_team_check = /delete_team_([0-9]+)/;
  const delete_block_check = /delete_block_([0-9]+)/;

  const session = get_current_session();
  if (!session) return;
  var current_question = current_question_index;

  //Goto next session
  if (updated_id == "new_session") {
    // Use multi-doc createNewSession - return promise for await support
    return createNewSession().then(function(newSessionId) {
      if (newSessionId) {
        sync_data_to_display();
        // Show confirmation modal with session name (only in browser environment)
        if (typeof showNewSessionCreatedModal === 'function' && typeof document !== 'undefined' && document.getElementById) {
          const session = get_current_session();
          if (session) {
            const sessionName = session.get('name') || t('defaults.unnamed_session');
            showNewSessionCreatedModal(sessionName);
          }
        }
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
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use createTeam helper
      const teams = getOrderedTeams(session);
      const newTeamName = t('defaults.team_name', { number: teams.length + 1 });
      createTeam(sessionDoc, session, newTeamName);
      add_history_entry('edit_log.actions.add_team', 'edit_log.details_templates.added', { name: newTeamName });
    } else {
      // V3: Index-based teams array
      const teams = session.get('teams');
      const questions = session.get('questions');
      const new_team_num = teams.length;

      sessionDoc.transact(() => {
        // Add new team
        const newTeam = new Y.Map();
        const newTeamName = t('defaults.team_name', { number: new_team_num });
        newTeam.set('name', newTeamName);
        teams.push([newTeam]);

        // Add placeholder scores for all existing questions
        const addTeamNow = Date.now();
        for (let i = 1; i < questions.length; i++) {
          const question = questions.get(i);
          const questionTeams = question.get('teams');
          const teamScore = new Y.Map();
          teamScore.set('score', 0);
          teamScore.set('scoreUpdatedAt', addTeamNow);
          teamScore.set('extraCredit', 0);
          teamScore.set('extraCreditUpdatedAt', addTeamNow);
          questionTeams.push([teamScore]);
        }

        add_history_entry('edit_log.actions.add_team', 'edit_log.details_templates.added', { name: newTeamName });
      }, 'local');
    }
  }
  //Decrease total teams count
  else if (updated_id == "total_teams_decrease") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use soft delete on last team
      const teams = getOrderedTeams(session);
      if (teams.length > 1) {
        const lastTeam = teams[teams.length - 1];
        const teamName = lastTeam.data.get('name');
        if (window.confirm(t('confirm.delete_team', { name: teamName }))) {
          softDeleteTeam(sessionDoc, session, lastTeam.id);
          add_history_entry('edit_log.actions.delete_team', 'edit_log.details_templates.deleted', { name: teamName });
        }
      }
    } else {
      // V3: Index-based teams array
      const teams = session.get('teams');
      const questions = session.get('questions');
      if (teams.length > 2) {
        const lastTeam = teams.get(teams.length - 1);
        const teamName = lastTeam.get('name');
        if (window.confirm(t('confirm.delete_team', { name: teamName }))) {
          sessionDoc.transact(() => {
            // Remove team from teams array
            teams.delete(teams.length - 1, 1);

            // Remove team scores from all questions
            for (let i = 1; i < questions.length; i++) {
              const question = questions.get(i);
              const questionTeams = question.get('teams');
              questionTeams.delete(questionTeams.length - 1, 1);
            }

            add_history_entry('edit_log.actions.delete_team', 'edit_log.details_templates.deleted', { name: teamName });
          }, 'local');
        }
      }
    }
  }
  //Update Team Name
  else if (updated_id.search(team_name_check) > -1) {
    let updated_team_number = Number(updated_id.match(team_name_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based update
      const teams = getOrderedTeams(session);
      if (updated_team_number >= 1 && updated_team_number <= teams.length) {
        const team = teams[updated_team_number - 1];
        const oldName = team.data.get('name');
        updateTeamName(sessionDoc, session, team.id, new_value);
        add_history_entry('edit_log.actions.rename_team', 'edit_log.details_templates.renamed', { old: oldName, new: new_value });
      }
    } else {
      // V3: Index-based
      const teams = session.get('teams');
      const oldName = teams.get(updated_team_number).get('name');
      sessionDoc.transact(() => {
        teams.get(updated_team_number).set('name', new_value);
        add_history_entry('edit_log.actions.rename_team', 'edit_log.details_templates.renamed', { old: oldName, new: new_value });
      }, 'local');
    }
  }
  //Delete specific team by index
  else if (updated_id.search(delete_team_check) > -1) {
    let team_to_delete = Number(updated_id.match(delete_team_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use soft delete
      const teams = getOrderedTeams(session);
      if (teams.length > 1 && team_to_delete >= 1 && team_to_delete <= teams.length) {
        const team = teams[team_to_delete - 1];
        const teamName = team.data.get('name');
        if (window.confirm(t('confirm.delete_team', { name: teamName }))) {
          softDeleteTeam(sessionDoc, session, team.id);
          add_history_entry('edit_log.actions.delete_team', 'edit_log.details_templates.deleted', { name: teamName });
        }
      }
    } else {
      // V3: Index-based deletion
      const teams = session.get('teams');
      const questions = session.get('questions');
      if (teams.length > 2) {
        const teamToDelete = teams.get(team_to_delete);
        const teamName = teamToDelete.get('name');
        if (window.confirm(t('confirm.delete_team', { name: teamName }))) {
          sessionDoc.transact(() => {
            // Remove team from teams array
            teams.delete(team_to_delete, 1);

            // Remove team scores from all questions
            for (let i = 1; i < questions.length; i++) {
              const question = questions.get(i);
              const questionTeams = question.get('teams');
              questionTeams.delete(team_to_delete, 1);
            }

            add_history_entry('edit_log.actions.delete_team', 'edit_log.details_templates.deleted', { name: teamName });
          }, 'local');
        }
      }
    }
  }
  //Increase total Block/Group Count
  if (updated_id == "total_blocks_increase") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use createBlock helper
      const blocks = getOrderedBlocks(session);
      const newBlockName = t('defaults.block_name', { number: blocks.length });
      createBlock(sessionDoc, session, newBlockName, false);
      add_history_entry('edit_log.actions.add_block', 'edit_log.details_templates.added', { name: newBlockName });
    } else {
      // V3: Index-based blocks array
      const blocks = session.get('blocks');
      const blockNum = blocks.length;
      sessionDoc.transact(() => {
        const newBlock = new Y.Map();
        const newBlockName = t('defaults.block_name', { number: blockNum });
        newBlock.set('name', newBlockName);
        blocks.push([newBlock]);
        add_history_entry('edit_log.actions.add_block', 'edit_log.details_templates.added', { name: newBlockName });
      }, 'local');
    }
  }
  //Decrease total Blocks/Groups count
  else if (updated_id == "total_blocks_decrease") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use soft delete on last non-default block
      const blocks = getOrderedBlocks(session);
      // Find last non-default block
      if (blocks.length > 1) {
        const lastBlock = blocks[blocks.length - 1];
        if (!lastBlock.data.get('isDefault')) {
          const blockName = lastBlock.data.get('name');
          softDeleteBlock(sessionDoc, session, lastBlock.id);
          add_history_entry('edit_log.actions.delete_block', 'edit_log.details_templates.deleted', { name: blockName });
        }
      }
    } else {
      // V3: Index-based blocks
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
        sessionDoc.transact(() => {
          blocks.delete(blocks.length - 1, 1);
          add_history_entry('edit_log.actions.delete_block', 'edit_log.details_templates.deleted', { name: blockName });
        }, 'local');
      }
    }
  }
  //Update Block/Group Name
  else if (updated_id.search(block_name_check) > -1) {
    let updated_block_number = Number(updated_id.match(block_name_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based update
      const blocks = getOrderedBlocks(session);
      if (updated_block_number >= 0 && updated_block_number < blocks.length) {
        const block = blocks[updated_block_number];
        const oldName = block.data.get('name');
        updateBlockName(sessionDoc, session, block.id, new_value);
        add_history_entry('edit_log.actions.rename_block', 'edit_log.details_templates.renamed', { old: oldName, new: new_value });
      }
    } else {
      // V3: Index-based
      const blocks = session.get('blocks');
      const oldName = blocks.get(updated_block_number).get('name');
      sessionDoc.transact(() => {
        blocks.get(updated_block_number).set('name', new_value);
        add_history_entry('edit_log.actions.rename_block', 'edit_log.details_templates.renamed', { old: oldName, new: new_value });
      }, 'local');
    }
  }
  //Delete specific block by index
  else if (updated_id.search(delete_block_check) > -1) {
    let block_to_delete = Number(updated_id.match(delete_block_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use soft delete
      const blocks = getOrderedBlocks(session);
      if (block_to_delete >= 0 && block_to_delete < blocks.length) {
        const block = blocks[block_to_delete];
        // Can't delete default block
        if (!block.data.get('isDefault')) {
          const blockName = block.data.get('name');
          if (window.confirm(t('confirm.delete_block', { name: blockName }))) {
            softDeleteBlock(sessionDoc, session, block.id);
            add_history_entry('edit_log.actions.delete_block', 'edit_log.details_templates.deleted', { name: blockName });
          }
        }
      }
    } else {
      // V3: Index-based blocks
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
      // Can only delete if block index is greater than the highest block in use
      if (blocks.length > 2 && block_to_delete > smallest_valid_number_of_blocks) {
        const blockToDelete = blocks.get(block_to_delete);
        const blockName = blockToDelete.get('name');
        if (window.confirm(t('confirm.delete_block', { name: blockName }))) {
          sessionDoc.transact(() => {
            blocks.delete(block_to_delete, 1);
            add_history_entry('edit_log.actions.delete_block', 'edit_log.details_templates.deleted', { name: blockName });
          }, 'local');
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
          add_history_entry('edit_log.actions.change_max_points', 'edit_log.details_templates.decreased_max_points', { old: max_points, new: max_points - 1 });
        }, 'local');
      }
    }
  }
  //Set Max Points per Question directly (from click-to-edit)
  else if (updated_id == "max_points_direct") {
    const config = session.get('config');
    const questions = session.get('questions');
    const oldValue = config.get('maxPointsPerQuestion');
    
    //Find largest actual max points - cannot go below this number
    let question_count = questions.length - 1;
    let smallest_valid_max_points = 1;
    for (let i = 1; i <= question_count; i++) {
      let temp_max_points = questions.get(i).get('score');
      if (smallest_valid_max_points < temp_max_points) {
        smallest_valid_max_points = temp_max_points;
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
  //Update Ignore Question Status
  else if (updated_id == "ignore_question") {
    let temp = $("#ignore_question").prop("checked");
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based update
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
    } else {
      // V3: Index-based
      const questions = session.get('questions');
      const questionName = questions.get(current_question).get('name');
      sessionDoc.transact(() => {
        questions.get(current_question).set('ignore', temp);
        questions.get(current_question).set('ignoreUpdatedAt', Date.now());
        if (temp) {
          add_history_entry('edit_log.actions.ignore_question', 'edit_log.details_templates.set_ignored', { name: questionName });
        } else {
          add_history_entry('edit_log.actions.include_question', 'edit_log.details_templates.set_included', { name: questionName });
        }
      }, 'local');
    }
  }
  //Toggle Extra Credit
  else if (updated_id == "extra_credit") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based operations
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
    } else {
      // V3: Index-based
      const questions = session.get('questions');
      const currentQuestionObj = questions.get(current_question);
      const questionName = currentQuestionObj.get('name');

      if ($("#extra_credit").prop("checked")) {
        // Log enabling extra credit
        sessionDoc.transact(() => {
          add_history_entry('edit_log.actions.enable_extra_credit', 'edit_log.details_templates.enabled_extra_credit', { name: questionName });
        }, 'local');
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
        if (temp_extra_credit > 0 && window.confirm(t('confirm.delete_extra_credit'))) {
          sessionDoc.transact(() => {
            const clearNow = Date.now();
            for (let i = 1; i <= team_count; i++) {
              questionTeams.get(i).set('extraCredit', 0);
              questionTeams.get(i).set('extraCreditUpdatedAt', clearNow);
            }
            add_history_entry('edit_log.actions.clear_extra_credit', 'edit_log.details_templates.cleared_extra_credit', { name: questionName });
          }, 'local');
        } else {
          // Just log disabling extra credit (no clearing needed)
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
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based update
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
    } else {
      // V3: Index-based
      const questions = session.get('questions');
      const teams = session.get('teams');
      const questionTeams = questions.get(current_question).get('teams');
      const questionName = questions.get(current_question).get('name');
      const teamName = teams.get(team_number).get('name');
      sessionDoc.transact(() => {
        let team_extra_credit = questionTeams.get(team_number).get('extraCredit');
        questionTeams.get(team_number).set('extraCredit', team_extra_credit + 1);
        questionTeams.get(team_number).set('extraCreditUpdatedAt', Date.now());
        add_history_entry('edit_log.actions.extra_credit', 'edit_log.details_templates.increased_extra_credit', { team: teamName, question: questionName, value: team_extra_credit + 1 });
      }, 'local');
    }
  }
  //decrease team extra credit
  else if (updated_id.search(decrease_team_extra_credit_check) > -1) {
    let team_number = Number(updated_id.match(decrease_team_extra_credit_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based update
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
    } else {
      // V3: Index-based
      const questions = session.get('questions');
      const teams = session.get('teams');
      const questionTeams = questions.get(current_question).get('teams');
      const questionName = questions.get(current_question).get('name');
      const teamName = teams.get(team_number).get('name');
      let team_extra_credit = questionTeams.get(team_number).get('extraCredit');
      if (team_extra_credit > 0) {
        sessionDoc.transact(() => {
          questionTeams.get(team_number).set('extraCredit', team_extra_credit - 1);
          questionTeams.get(team_number).set('extraCreditUpdatedAt', Date.now());
          add_history_entry('edit_log.actions.extra_credit', 'edit_log.details_templates.decreased_extra_credit', { team: teamName, question: questionName, value: team_extra_credit - 1 });
        }, 'local');
      }
    }
  }
  //Update Current Question Max Possible Score
  else if (updated_id.search(question_max_points_check) > -1) {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based update
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
          add_history_entry('edit_log.actions.set_question_points', 'edit_log.details_templates.set_question_points', { name: questionName, old: oldScore, new: new_value });
        }
      }
    } else {
      // V3: Index-based
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
        sessionDoc.transact(() => {
          questions.get(current_question).set('score', Number(new_value));
          questions.get(current_question).set('scoreUpdatedAt', Date.now());
          add_history_entry('edit_log.actions.set_question_points', 'edit_log.details_templates.set_question_points', { name: questionName, old: oldScore, new: new_value });
        }, 'local');
      }
    }
  }
  //Update Current Question's Block/Group
  else if (updated_id.search(question_block_check) > -1) {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based update
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
    } else {
      // V3: Index-based
      const questions = session.get('questions');
      const blocks = session.get('blocks');
      const questionName = questions.get(current_question).get('name');
      const oldBlockNum = questions.get(current_question).get('block');
      const oldBlockName = blocks.get(oldBlockNum).get('name');
      const newBlockName = blocks.get(Number(new_value)).get('name');
      sessionDoc.transact(() => {
        questions.get(current_question).set('block', Number(new_value));
        questions.get(current_question).set('blockUpdatedAt', Date.now());
        add_history_entry('edit_log.actions.change_question_block', 'edit_log.details_templates.changed_block', { question: questionName, old: oldBlockName, new: newBlockName });
      }, 'local');
    }
  }
  //Update score for a team on the current question
  else if (updated_id.search(team_question_score_check) > -1) {
    let team_number = Number(updated_id.match(team_question_score_check)[1]);
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based update
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
    } else {
      // V3: Index-based
      const questions = session.get('questions');
      const teams = session.get('teams');
      const questionName = questions.get(current_question).get('name');
      const teamName = teams.get(team_number).get('name');
      const oldScore = questions.get(current_question).get('teams').get(team_number).get('score');
      sessionDoc.transact(() => {
        questions.get(current_question).get('teams').get(team_number).set('score', Number(new_value));
        questions.get(current_question).get('teams').get(team_number).set('scoreUpdatedAt', Date.now());
        add_history_entry('edit_log.actions.score_change', 'edit_log.details_templates.score_changed', { team: teamName, question: questionName, old: oldScore, new: new_value });
      }, 'local');
    }
  }
  //Go forward one question
  else if (updated_id == "next_question" || updated_id == "next_question_2") {
    const sessionDoc = getActiveSessionDoc();
    if (!sessionDoc) return;
    
    // Check if v4 session (UUID-based)
    if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
      // V4: Use UUID-based operations
      const questions = getOrderedQuestions(session);
      const question_count = questions.length;
      
      if (current_question_index === question_count) {
        // At last question - only add new one if current has max points set
        const currentQuestion = questions[current_question_index - 1];
        const question_max_points = currentQuestion.data.get('score');
        if (question_max_points > 0) {
          // Create new question using v4 helper
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
    } else {
      // V3: Index-based
      const questions = session.get('questions');
      let question_count = questions.length - 1;
      if (current_question == question_count) {
        //Only move forward if current question has a max possible score set
        let question_max_points = questions.get(current_question).get('score');
        if (question_max_points > 0) {
          //Add a new question
          const teams = session.get('teams');
          let team_count = teams.length - 1;

          sessionDoc.transact(() => {
            //Move current Question forward one
            current_question_index = current_question + 1;

            //Create new question
            const now = Date.now();
            const newQuestion = new Y.Map();
            newQuestion.set('name', t('defaults.question_name', { number: current_question + 1 }));
            newQuestion.set('nameUpdatedAt', now);
            newQuestion.set('score', 0);
            newQuestion.set('scoreUpdatedAt', now);
            newQuestion.set('block', 0);
            newQuestion.set('blockUpdatedAt', now);
            newQuestion.set('ignore', false);
            newQuestion.set('ignoreUpdatedAt', now);

            //Set default score for all teams on this question to 0
            const newQuestionTeams = new Y.Array();
            newQuestionTeams.push([null]); // Placeholder
            for (let i = 1; i <= team_count; i++) {
              const teamScore = new Y.Map();
              teamScore.set('score', 0);
              teamScore.set('scoreUpdatedAt', now);
              teamScore.set('extraCredit', 0);
              teamScore.set('extraCreditUpdatedAt', now);
              newQuestionTeams.push([teamScore]);
            }
            newQuestion.set('teams', newQuestionTeams);

            questions.push([newQuestion]);
          }, 'local');
        }
      } else {
        //Move forward to existing question
        sessionDoc.transact(() => {
          current_question_index = current_question + 1;
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

  // v4.0 UUID-based structure: just reorder the teamOrder array
  if (isUUIDSession(session)) {
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
    
    return;
  }

  // v3.0 index-based structure (legacy)
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

  // sessionDoc already declared above for v4 check
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
        const reorderNow = Date.now();
        for (let j = 0; j < temp_score_data.length; j++) {
          const newScore = new Y.Map();
          newScore.set('score', temp_score_data[j].score);
          newScore.set('scoreUpdatedAt', reorderNow);
          newScore.set('extraCredit', temp_score_data[j].extraCredit);
          newScore.set('extraCreditUpdatedAt', reorderNow);
          questionTeams.push([newScore]);
        }
      }

      // Add history entry
      add_history_entry('edit_log.actions.reorder_teams', 'edit_log.details_templates.new_order', { order: newOrder.join(', ') });
    }, 'local');
  }
}

function reorder_blocks(order) {
  const session = get_current_session();
  if (!session) return;

  const sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) return;

  // v4.0 UUID-based structure: just reorder the blockOrder array
  if (isUUIDSession(session)) {
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
    
    return;
  }

  // v3.0 index-based structure (legacy)
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

  // sessionDoc already declared above for v4 check
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
      add_history_entry('edit_log.actions.reorder_blocks', 'edit_log.details_templates.new_order', { order: newOrder.join(', ') });
    }, 'local');
  }
}

// Note: detectAndMergeDuplicateQuestions and mergeQuestionDuplicates removed in v5.0
// With deterministic question IDs (q-1, q-2), duplicate questions cannot occur
// because both peers will create the same ID and Yjs will merge at the CRDT level
