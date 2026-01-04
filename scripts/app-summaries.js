function get_team_score_summary(temp_question_count = -1) {
  if (temp_question_count == -1) {
    var question_count = JSON.parse(get_element("session_"+current_session+"_question_names")).length - 1;
  } else {
    var question_count = temp_question_count;
  }
  let team_names = JSON.parse(get_element("session_"+current_session+"_team_names"));
  let team_count = team_names.length - 1;
  let rounding = JSON.parse(get_element("session_"+current_session+"_rounding"));

  //Create empty summary array
  let team_score_summary = new Array();
  team_score_summary.push(["Team Name","Percent","Score","Placement","Earned Points","Total Points", "Total Points (Rounded)", "Percent (Rounded)", "Score (Rounded)", "Placement (Rounded)"]);
  for (var i=0; i < team_count; i++) {
    team_score_summary.push([team_names[i + 1],,,,,,,,,]);
  }
  //Fill in Team Scores
  let highest_team_score = 0;
  for (let i=1; i <= team_count; i++) {
    let team_earned = 0;
    let team_earned_without_extra_credit = 0;
    let team_possible = 0;
    for (let j=1; j <= question_count; j++) {
      let temp_ignore_question = JSON.parse(get_element("session_"+current_session+"_question_"+j+"_ignore"));
      if (temp_ignore_question === "false") {
        team_earned += Number(get_element("session_"+current_session+"_question_"+j+"_team_"+i+"_score"));
        team_earned += Number(get_element("session_"+current_session+"_question_"+j+"_team_"+i+"_extra_credit"));
        team_earned_without_extra_credit += Number(get_element("session_"+current_session+"_question_"+j+"_team_"+i+"_score"));
        team_possible += Number(get_element("session_"+current_session+"_question_"+j+"_score"));
      }
    }
    team_score_summary[i][4] = team_earned;
    team_score_summary[i][5] = team_possible;
    team_score_summary[i][1] = ((team_score_summary[i][4]/team_score_summary[i][5])*100).toFixed(2)+"%";
    team_score_summary[i][2] = team_score_summary[i][4]+"/"+team_score_summary[i][5];
    if (team_earned_without_extra_credit > highest_team_score) {
      highest_team_score = team_earned_without_extra_credit;
    }
  }
  for (let i=1; i <= team_count; i++) {
    team_score_summary[i][6] = highest_team_score;
    team_score_summary[i][7] = ((team_score_summary[i][4]/team_score_summary[i][6])*100).toFixed(2)+"%";
    team_score_summary[i][8] = team_score_summary[i][4]+"/"+team_score_summary[i][6];
    if (team_score_summary[i][4]/team_score_summary[i][5] >= 0.9) {
      team_score_summary[i][3] = "First Place";
    } else if (team_score_summary[i][4]/team_score_summary[i][5] >= 0.8) {
      team_score_summary[i][3] = "Second Place";
    } else {
      team_score_summary[i][3] = "Third Place";
    }
    if (team_score_summary[i][4]/highest_team_score >= 0.9) {
      team_score_summary[i][9] = "First Place";
    } else if (team_score_summary[i][4]/highest_team_score >= 0.8) {
      team_score_summary[i][9] = "Second Place";
    } else {
      team_score_summary[i][9] = "Third Place";
    }
  }
  return team_score_summary;
}
function get_block_score_summary(temp_question_count = -1) {
  if (temp_question_count == -1) {
    var question_count = JSON.parse(get_element("session_"+current_session+"_question_names")).length - 1;
  } else {
    var question_count = temp_question_count;
  }
  let team_count = JSON.parse(get_element("session_"+current_session+"_team_names")).length - 1;
  let block_names = JSON.parse(get_element("session_"+current_session+"_block_names"));
  let block_count = block_names.length - 1;

  //Create empty summary array
  let block_score_summary = new Array();
  block_score_summary.push(["Block/Group Name","Percent","Score","Earned Points","Total Points"]);
  for (let i=0; i <= block_count; i++) {
    block_score_summary.push([block_names[i],,,,]);
  }
  //Fill in Block/Group Scores
  for (let i=0; i <= block_count; i++) {
    let block_earned = 0;
    let block_possible = 0;
    for (let j=1; j <= question_count; j++) {
      let temp_ignore_question = JSON.parse(get_element("session_"+current_session+"_question_"+j+"_ignore"));
      if (Number(get_element("session_"+current_session+"_question_"+j+"_block")) == i && temp_ignore_question === "false") {
        for (let k=1; k <= team_count; k++) {
          block_earned += Number(get_element("session_"+current_session+"_question_"+j+"_team_"+k+"_score"));
          block_earned += Number(get_element("session_"+current_session+"_question_"+j+"_team_"+k+"_extra_credit"));
          block_possible += Number(get_element("session_"+current_session+"_question_"+j+"_score"));
        }
      }
    }
    block_score_summary[i + 1][3] = block_earned;
    block_score_summary[i + 1][4] = block_possible;
    block_score_summary[i + 1][1] = ((block_earned/block_possible)*100).toFixed(2)+"%";
    block_score_summary[i + 1][2] = block_earned+"/"+block_possible;
  }
  return block_score_summary;
}
function get_team_and_block_score_summary(temp_question_count = -1) {
  if (temp_question_count == -1) {
    var question_count = JSON.parse(get_element("session_"+current_session+"_question_names")).length - 1;
  } else {
    var question_count = temp_question_count;
  }
  let team_names = JSON.parse(get_element("session_"+current_session+"_team_names"));
  let team_count = team_names.length - 1;
  let block_names = JSON.parse(get_element("session_"+current_session+"_block_names"));
  let block_count = block_names.length - 1;

  //Create empty summary array
  let team_and_block_score_summary = new Array();
  team_and_block_score_summary.push(["Team Name","Block/Group Name","Percent","Score","Earned Points","Total Points"]);
  for (let i=1; i <= team_count; i++) {
    for (let j=0; j <= block_count; j++) {
      team_and_block_score_summary.push([team_names[i],block_names[j],,,0,0]);
    }
  }
  //Fill in Team and Block/Group Scores
  for (let i=1; i <= team_count; i++) {
    let temp_team_start = (i - 1)*(block_count + 1) + 1;
    for (let j=1; j <= question_count; j++) {
      let temp_ignore_question = JSON.parse(get_element("session_"+current_session+"_question_"+j+"_ignore"));
      if (temp_ignore_question === "false") {
        let current_selected_block = Number(get_element("session_"+current_session+"_question_"+j+"_block"));
        let temp_row_number = temp_team_start + current_selected_block;
        team_and_block_score_summary[temp_row_number][4] += Number(get_element("session_"+current_session+"_question_"+j+"_team_"+i+"_score"));
        team_and_block_score_summary[temp_row_number][4] += Number(get_element("session_"+current_session+"_question_"+j+"_team_"+i+"_extra_credit"));
        team_and_block_score_summary[temp_row_number][5] +=  Number(get_element("session_"+current_session+"_question_"+j+"_score"));
        team_and_block_score_summary[temp_row_number][2] = ((team_and_block_score_summary[temp_row_number][4]/team_and_block_score_summary[temp_row_number][5])*100).toFixed(2)+"%";;
        team_and_block_score_summary[temp_row_number][3] = team_and_block_score_summary[temp_row_number][4]+"/"+team_and_block_score_summary[temp_row_number][5];
      }
    }
  }
  return team_and_block_score_summary;
}
function get_question_log(temp_question_count = -1) {
  var question_names = JSON.parse(get_element("session_"+current_session+"_question_names"));
  if (temp_question_count == -1) {
    var question_count = question_names.length - 1;
  } else {
    var question_count = temp_question_count;
  }
  if (Number(get_element("session_"+current_session+"_question_"+question_count+"_score")) == 0) {
    question_count--;
  }
  let team_names = JSON.parse(get_element("session_"+current_session+"_team_names"));
  let team_count = team_names.length - 1;
  let block_names = JSON.parse(get_element("session_"+current_session+"_block_names"));
  let block_count = block_names.length - 1;

  //Create empty summary array
  let temp_row = new Array();
  temp_row.push("Question");
  temp_row.push("Block/Group");
  temp_row.push("Possible Points");
  temp_row.push("Ignore Question");
  for (let i=1; i <= team_count; i++) {
    temp_row.push(team_names[i]);
  }
  let question_log_summary = Array()
  question_log_summary.push(temp_row);
  
  for (let i=1; i <= question_count; i++) {
    temp_row = Array();
    temp_row.push(question_names[i]);
    temp_row.push(block_names[Number(get_element("session_"+current_session+"_question_"+i+"_block"))]);
    temp_row.push(Number(get_element("session_"+current_session  +"_question_"+i+"_score")));
    temp_row.push(JSON.parse(get_element("session_"+current_session+"_question_"+i+"_ignore")))
    for (let j=1; j <= team_count; j++) {
      let extra_credit = Number(get_element("session_"+current_session+"_question_"+i+"_team_"+j+"_extra_credit"));
      if (extra_credit > 0) {
        temp_row.push(Number(get_element("session_"+current_session+"_question_"+i+"_team_"+j+"_score"))+" + "+Number(get_element("session_"+current_session+"_question_"+i+"_team_"+j+"_extra_credit")));
      } else {
        temp_row.push(Number(get_element("session_"+current_session+"_question_"+i+"_team_"+j+"_score")));
      }
    }
    question_log_summary.push(temp_row);
  }
  return question_log_summary;
}
