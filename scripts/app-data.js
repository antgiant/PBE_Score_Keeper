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
  var current_question = Number(get_element("session_"+current_session+"_current_question"));

  //Update Session Name
  if (updated_id == "session_name") {
    let new_value = $("#session_name").text();
    let session_names = JSON.parse(get_element("session_names"));
    session_names[current_session] = new_value;
    set_element("session_names", JSON.stringify(session_names));
    $("#session_quick_nav").focus();
  }
  //Goto next session
  else if (updated_id == "new_session") {
    let question_names = JSON.parse(get_element("session_"+current_session+"_question_names"));
    let question_count = question_names.length - 1;
    if (Number(get_element("session_"+current_session+"_question_"+question_count+"_score")) == 0) {
      question_count--;
    }
    if (question_count > 1) {
      let session_names = JSON.parse(get_element("session_names"));
      //Get current settings to copy them forward
      let temp_max_points = Number(get_element("session_"+current_session+"_max_points_per_question"));
      let temp_rounding = JSON.parse(get_element("session_"+current_session+"_rounding"));
      let temp_block_names = JSON.parse(get_element("session_"+current_session+"_block_names"));
      let temp_team_names = JSON.parse(get_element("session_"+current_session+"_team_names"));
      let mythical_option = false;

      //Move Current session forward one
      current_session = session_names.length;
      set_element("current_session", current_session);

      //Set up session defaults since there isn't one for this
      var d = new Date();
      var date = d.toLocaleString();
      session_names.push("Session "+date);
      set_element("session_names", JSON.stringify(session_names));
      set_element("session_"+current_session+"_max_points_per_question", (mythical_option?JSON.stringify(12):temp_max_points));
      set_element("session_"+current_session+"_rounding", (mythical_option?JSON.stringify("false"):JSON.stringify(temp_rounding)));
      set_element("session_"+current_session+"_block_names", (mythical_option?JSON.stringify(["No Block/Group", "Block/Group 1"]):JSON.stringify(temp_block_names)));
      set_element("session_"+current_session+"_team_names", (mythical_option?JSON.stringify(["", "Team 1"]):JSON.stringify(temp_team_names)));
      set_element("session_"+current_session+"_question_names", JSON.stringify(["", "Question 1"]));
      set_element("session_"+current_session+"_current_question", JSON.stringify(1));
      set_element("session_"+current_session+"_question_1_score", JSON.stringify(0));
      set_element("session_"+current_session+"_question_1_ignore", JSON.stringify("false"));
      set_element("session_"+current_session+"_question_1_block", JSON.stringify(0));
      set_element("session_"+current_session+"_question_1_team_1_score", JSON.stringify(0));
    }
  }

  //Jump to specific session
  else if (updated_id == "session_quick_nav") {
    set_element("current_session", new_value);
    current_session = new_value;
  }
  
  //Increase total teams count
  else if (updated_id == "total_teams_increase") {
    let team_names = JSON.parse(get_element("session_"+current_session+"_team_names"));
    team_names.push("Team "+team_names.length);
    set_element("session_"+current_session+"_team_names", JSON.stringify(team_names));
    for (let i = 1; i < JSON.parse(get_element("session_"+current_session+"_question_names")).length; i++) {
      //Add an empty placeholder score
      set_element("session_"+current_session+"_question_"+i+"_team_"+(team_names.length - 1)+"_score", 0);
    }
  } 
  //Decrease total teams count
  else if (updated_id == "total_teams_decrease") {
    let team_names = JSON.parse(get_element("session_"+current_session+"_team_names"));
    if (team_names.length > 2) {
      if (window.confirm("Do you really want Delete "+team_names.pop()+"?")) {
        set_element("session_"+current_session+"_team_names", JSON.stringify(team_names));
        for (let i = 1; i < JSON.parse(get_element("session_"+current_session+"_question_names")).length; i++) {
          //Remove deleted Team's score(s)
          remove_element("session_"+current_session+"_question_"+i+"_team_"+team_names.length+"_score");
        }
      }
    }
  } 
  //Update Team Name
  else if (updated_id.search(team_name_check) > -1) {
    let team_names = JSON.parse(get_element("session_"+current_session+"_team_names"));
    let updated_team_number = updated_id.match(team_name_check)[1];
    team_names[updated_team_number] = new_value;
    set_element("session_"+current_session+"_team_names", JSON.stringify(team_names))
  }
  //Increase total Block/Group Count
  if (updated_id == "total_blocks_increase") {
    let block_names = JSON.parse(get_element("session_"+current_session+"_block_names"));
    block_names.push("Block/Group "+block_names.length);
    set_element("session_"+current_session+"_block_names", JSON.stringify(block_names));
  } 
  //Decrease total Blocks/Groups count
  else if (updated_id == "total_blocks_decrease") {
    let block_names = JSON.parse(get_element("session_"+current_session+"_block_names"));
    //Don't allow deleting of blocks that are in use
    let question_names = JSON.parse(get_element("session_"+current_session+"_question_names"));
    let question_count = question_names.length - 1;
    let smallest_valid_number_of_blocks = 1;
    for (let i = 1; i <= question_count; i++) {
      let temp_max_blocks = Number(get_element("session_"+current_session+"_question_"+i+"_block"));
      if (smallest_valid_number_of_blocks < temp_max_blocks) {
        smallest_valid_number_of_blocks = temp_max_blocks;
      }
    }
    if (block_names.length > (smallest_valid_number_of_blocks + 1)) {
      block_names.pop();
      set_element("session_"+current_session+"_block_names", JSON.stringify(block_names));
    }
  } 
  //Update Block/Group Name
  else if (updated_id.search(block_name_check) > -1) {
    let block_names = JSON.parse(get_element("session_"+current_session+"_block_names"));
    let updated_block_number = updated_id.match(block_name_check)[1];
    block_names[updated_block_number] = new_value;
    set_element("session_"+current_session+"_block_names", JSON.stringify(block_names))
  }
  //Increase Max Points per Question
  if (updated_id == "max_points_increase") {
    let max_points = Number(get_element("session_"+current_session+"_max_points_per_question"));
    max_points++;
    set_element("session_"+current_session+"_max_points_per_question", max_points);
  } 
  //Decrease Max Points per Question
  else if (updated_id == "max_points_decrease") {
    let max_points = Number(get_element("session_"+current_session+"_max_points_per_question"));

    //Find largest actual max points and prevent max per question from going below that number
    let question_names = JSON.parse(get_element("session_"+current_session+"_question_names"));
    let question_count = question_names.length - 1;
    let smallest_valid_max_points = 1;
    for (let i = 1; i <= question_count; i++) {
      let temp_max_points = Number(get_element("session_"+current_session+"_question_"+i+"_score"));
      if (smallest_valid_max_points < temp_max_points) {
        smallest_valid_max_points = temp_max_points;
      }
    }
    if (max_points > smallest_valid_max_points) {
      max_points--;
      set_element("session_"+current_session+"_max_points_per_question", max_points);
    }
  }
  //Update Question Title
  else if (updated_id == "current_question_title") {
    let new_value = $("#current_question_title").text();
    let question_names = JSON.parse(get_element("session_"+current_session+"_question_names"));
    question_names[current_question] = new_value;
    set_element("session_"+current_session+"_question_names", JSON.stringify(question_names));
    $("#question_quick_nav").focus();
  }
  //Update Rounding Status to Yes
  else if (updated_id == "rounding_yes") {
      set_element("session_"+current_session+"_rounding", JSON.stringify("true"));
  }
  //Update Rounding Status to No
  else if (updated_id == "rounding_no") {
      set_element("session_"+current_session+"_rounding", JSON.stringify("false"));
  }
  //Update Ignore Question Status
  else if (updated_id == "ignore_question") {
      let temp = $("#ignore_question").prop("checked");
      set_element("session_"+current_session+"_question_"+current_question+"_ignore", JSON.stringify(temp+""));
  }
  //Delete Extra Credit
  else if (updated_id == "extra_credit") {
    //Nothing to do if allowing extra credit
    if (!$("#extra_credit").prop("checked")) {
      let temp_extra_credit = 0;
      let temp = 0;
      let team_count = (JSON.parse(get_element("session_"+current_session+"_team_names"))).length - 1;
      for (let i=1;i<=team_count;i++) {
        temp = Number(get_element("session_"+current_session+"_question_"+current_question+"_team_"+i+"_extra_credit"));
        if (temp == undefined) {
          temp = 0;
        }
        $('#team_'+i+'_extra_credit').text(temp);
        temp_extra_credit += temp;
      }
      //Only display warning if there actualy is extra credit to delete
      if (temp_extra_credit > 0 && window.confirm("Are you sure you want to irreversably delete this question's extra credit?")) {        
        let team_count = (JSON.parse(get_element("session_"+current_session+"_team_names"))).length - 1;
        for (let i = 1; i <= team_count; i++) {
          set_element("session_"+current_session+"_question_"+current_question+"_team_"+i+"_extra_credit", 0);
        }
      }
    }
  }
  //increase team extra credit
  else if (updated_id.search(increase_team_extra_credit_check) > -1) {
    let team_number = updated_id.match(increase_team_extra_credit_check)[1];
    let team_extra_credit = Number(get_element("session_"+current_session+"_question_"+current_question+"_team_"+team_number+"_extra_credit"));
    team_extra_credit++;
    set_element("session_"+current_session+"_question_"+current_question+"_team_"+team_number+"_extra_credit", team_extra_credit);
  }
  //decrease team extra credit
  else if (updated_id.search(decrease_team_extra_credit_check) > -1) {
    let team_number = updated_id.match(decrease_team_extra_credit_check)[1];
    let team_extra_credit = Number(get_element("session_"+current_session+"_question_"+current_question+"_team_"+team_number+"_extra_credit"));
    if (team_extra_credit > 0) {
      team_extra_credit--;
      set_element("session_"+current_session+"_question_"+current_question+"_team_"+team_number+"_extra_credit", team_extra_credit);
    }
  }
  //Update Current Question Max Possible Score
  else if (updated_id.search(question_max_points_check) > -1) {
    //Disable selecting max possible score lower than already earned score
    let team_count = (JSON.parse(get_element("session_"+current_session+"_team_names"))).length - 1;
    let temp_max = 0;
    for (let i = 1; i <= team_count; i++) {
      if (temp_max < Number(get_element("session_"+current_session+"_question_"+current_question+"_team_"+i+"_score"))) {
        temp_max = Number(get_element("session_"+current_session+"_question_"+current_question+"_team_"+i+"_score"));
      }
    }
    if (new_value >= temp_max) {
      set_element("session_"+current_session+"_question_"+current_question+"_score", new_value);
    }
  }
  //Update Current Question's Block/Group
  else if (updated_id.search(question_block_check) > -1) {
    set_element("session_"+current_session+"_question_"+current_question+"_block", new_value);
  }
  //Update score for a team on the current question
  else if (updated_id.search(team_question_score_check) > -1) {
    let team_number = updated_id.match(team_question_score_check)[1];
    set_element("session_"+current_session+"_question_"+current_question+"_team_"+team_number+"_score", new_value);
  }
  //Go forward one question
  else if (updated_id == "next_question" || updated_id == "next_question_2") {
    let question_names = JSON.parse(get_element("session_"+current_session+"_question_names"));
    let question_count = question_names.length - 1;
    if (current_question == question_count) {
      //Only move forward if current question has a max possible score set
      let question_max_points = Number(get_element("session_"+current_session+"_question_"+current_question+"_score"));
      if (question_max_points > 0) {
        //Add a new question

        //Move current Question forward one
        current_question++;
        set_element("session_"+current_session+"_current_question", current_question);

        //Add new question name
        question_names.push("Question "+current_question);
        set_element("session_"+current_session+"_question_names", JSON.stringify(question_names));

        //Set new question possible score to 0
        set_element("session_"+current_session+"_question_"+current_question+"_score", 0);

        //Set new question block/group to 0 (aka none)
        set_element("session_"+current_session+"_question_"+current_question+"_block", 0);

        //Set new question to not be ignored
        set_element("session_"+current_session+"_question_"+current_question+"_ignore", JSON.stringify("false"));

        //Set default score for all teams on this question to 0
        let team_count = (JSON.parse(get_element("session_"+current_session+"_team_names"))).length - 1;
        for (let i = 1; i <= team_count; i++) {
          set_element("session_"+current_session+"_question_"+current_question+"_team_"+i+"_score", 0);
          set_element("session_"+current_session+"_question_"+current_question+"_team_"+i+"_extra_credit", 0);
        }
      }
    } else {
      //Move forward to existing quesiton
      current_question++;
      set_element("session_"+current_session+"_current_question", current_question);
    }
  }
  //Go to previous question
  else if (updated_id == "previous_question" || updated_id == "previous_question_2") {
    if (current_question > 1) {
      current_question--;
      set_element("session_"+current_session+"_current_question", current_question);
    }
  }
  //Jump to specific question
  else if (updated_id == "question_quick_nav") {
    set_element("session_"+current_session+"_current_question", new_value);
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
  //Export session to JSON
  else if (updated_id == "export_session_json") {
    downloadBlob(JSON.stringify(get_all_data(), filter_to_current_session, 2).replaceAll(" \"session_"+current_session+"_", " \"session_1_"), 'pbe_session_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
  }
  //Export all to JSON
  else if (updated_id == "export_all_json") {
    downloadBlob(JSON.stringify(get_all_data(), null, 2), 'all_pbe_score_data_' + (new Date().toJSON().slice(0,10)) + '.json', 'application/json; charset=utf-8;');
  }
  //Import Replacing Everything
  else if (updated_id == "import_json_replace") {
    import_status = "replace";
  }
  //Import Appending Everything
  else if (updated_id == "import_json_append") {
    import_status = "append"
  }
  //Delete current session
  else if (updated_id == "session_delete") {
    //Only Delete if more than one session exists
    let session_names = JSON.parse(get_element("session_names"));
    if (session_names.length > 2) {
      if (window.confirm("Are you sure you want to irreversably delete this Session (Round/Game)?")) {
        //Use loop starting with current session number to prevent accidental overwriting
        for (let i = current_session; i < session_names.length; i++) {
          let session_check = new RegExp(`session_${i}_(.*)`);
          let new_session = i - 1;
          for (let key of Object.keys(get_all_data())) {
            if (key.search(session_check) > -1) {
              if (i == current_session) {
              //Erase Current Session's data
                remove_element(key);
              } else {
                //Renumber all sessions after current session
                let temp = key.replace(session_check,"session_"+(new_session)+"_$1")
                set_element(temp, get_element(key));
                remove_element(key);
              }
            }
          }
        }
        //Delete the current session
        session_names.splice(current_session, 1);
        set_element("session_names", JSON.stringify(session_names));

        if (current_session > session_names.length - 1) {
          current_session--;
          set_element("current_session", current_session);
        }
      }
      alert("Deleted")
    }
    else {
      alert("You may not delete the only Session (Round/Game)");
    }
  }
}

