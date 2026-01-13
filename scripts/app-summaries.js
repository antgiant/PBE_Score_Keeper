function get_team_score_summary(temp_question_count = -1) {
  const session = get_current_session();
  if (!session) return [[t('table.team_name'),t('table.percent'),t('table.score'),t('table.placement'),t('table.earned_points'),t('table.total_points'), t('table.total_points_rounded'), t('table.percent_rounded'), t('table.score_rounded'), t('table.placement_rounded')]];

  const questions = session.get('questions');
  if (temp_question_count == -1) {
    var question_count = questions.length - 1;
  } else {
    var question_count = temp_question_count;
  }
  let team_names = get_team_names();
  let team_count = team_names.length - 1;
  let rounding = session.get('config').get('rounding');

  //Create empty summary array
  let team_score_summary = new Array();
  team_score_summary.push([t('table.team_name'),t('table.percent'),t('table.score'),t('table.placement'),t('table.earned_points'),t('table.total_points'), t('table.total_points_rounded'), t('table.percent_rounded'), t('table.score_rounded'), t('table.placement_rounded')]);
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
      const question = questions.get(j);
      let temp_ignore_question = question.get('ignore');
      if (temp_ignore_question === false) {
        const questionTeams = question.get('teams');
        team_earned += questionTeams.get(i).get('score');
        team_earned += questionTeams.get(i).get('extraCredit');
        team_earned_without_extra_credit += questionTeams.get(i).get('score');
        team_possible += question.get('score');
      }
    }
    team_score_summary[i][4] = team_earned;
    team_score_summary[i][5] = team_possible;
    team_score_summary[i][1] = format_percent(team_score_summary[i][4]/team_score_summary[i][5], 2);
    team_score_summary[i][2] = format_score(team_score_summary[i][4], team_score_summary[i][5]);
    if (team_earned_without_extra_credit > highest_team_score) {
      highest_team_score = team_earned_without_extra_credit;
    }
  }
  for (let i=1; i <= team_count; i++) {
    team_score_summary[i][6] = highest_team_score;
    team_score_summary[i][7] = format_percent(team_score_summary[i][4]/team_score_summary[i][6], 2);
    team_score_summary[i][8] = format_score(team_score_summary[i][4], team_score_summary[i][6]);
    if (team_score_summary[i][4]/team_score_summary[i][5] >= 0.9) {
      team_score_summary[i][3] = t('placements.first');
    } else if (team_score_summary[i][4]/team_score_summary[i][5] >= 0.8) {
      team_score_summary[i][3] = t('placements.second');
    } else {
      team_score_summary[i][3] = t('placements.third');
    }
    if (team_score_summary[i][4]/highest_team_score >= 0.9) {
      team_score_summary[i][9] = t('placements.first');
    } else if (team_score_summary[i][4]/highest_team_score >= 0.8) {
      team_score_summary[i][9] = t('placements.second');
    } else {
      team_score_summary[i][9] = t('placements.third');
    }
  }
  return team_score_summary;
}
function get_block_score_summary(temp_question_count = -1) {
  const session = get_current_session();
  if (!session) return [[t('table.block_name'),t('table.percent'),t('table.score'),t('table.earned_points'),t('table.total_points')]];

  const questions = session.get('questions');
  if (temp_question_count == -1) {
    var question_count = questions.length - 1;
  } else {
    var question_count = temp_question_count;
  }
  let team_count = get_team_names().length - 1;
  let block_names = get_block_names();
  let block_count = block_names.length - 1;

  //Create empty summary array
  let block_score_summary = new Array();
  block_score_summary.push([t('table.block_name'),t('table.percent'),t('table.score'),t('table.earned_points'),t('table.total_points')]);
  for (let i=0; i <= block_count; i++) {
    block_score_summary.push([block_names[i],,,,]);
  }
  //Fill in Block/Group Scores
  for (let i=0; i <= block_count; i++) {
    let block_earned = 0;
    let block_possible = 0;
    for (let j=1; j <= question_count; j++) {
      const question = questions.get(j);
      let temp_ignore_question = question.get('ignore');
      if (question.get('block') == i && temp_ignore_question === false) {
        const questionTeams = question.get('teams');
        for (let k=1; k <= team_count; k++) {
          block_earned += questionTeams.get(k).get('score');
          block_earned += questionTeams.get(k).get('extraCredit');
          block_possible += question.get('score');
        }
      }
    }
    block_score_summary[i + 1][3] = block_earned;
    block_score_summary[i + 1][4] = block_possible;
    block_score_summary[i + 1][1] = format_percent(block_earned/block_possible, 2);
    block_score_summary[i + 1][2] = format_score(block_earned, block_possible);
  }
  
  //Remove blocks with no questions (where total points = 0)
  block_score_summary = block_score_summary.filter((row, index) => index === 0 || row[4] > 0);
  
  return block_score_summary;
}
function get_team_and_block_score_summary(temp_question_count = -1) {
  const session = get_current_session();
  if (!session) return [[t('table.team_name'),t('table.block_name'),t('table.percent'),t('table.score'),t('table.earned_points'),t('table.total_points')]];

  const questions = session.get('questions');
  if (temp_question_count == -1) {
    var question_count = questions.length - 1;
  } else {
    var question_count = temp_question_count;
  }
  let team_names = get_team_names();
  let team_count = team_names.length - 1;
  let block_names = get_block_names();
  let block_count = block_names.length - 1;

  //Create empty summary array
  let team_and_block_score_summary = new Array();
  team_and_block_score_summary.push([t('table.team_name'),t('table.block_name'),t('table.percent'),t('table.score'),t('table.earned_points'),t('table.total_points')]);
  for (let i=1; i <= team_count; i++) {
    for (let j=0; j <= block_count; j++) {
      team_and_block_score_summary.push([team_names[i],block_names[j],,,0,0]);
    }
  }
  //Fill in Team and Block/Group Scores
  for (let i=1; i <= team_count; i++) {
    let temp_team_start = (i - 1)*(block_count + 1) + 1;
    for (let j=1; j <= question_count; j++) {
      const question = questions.get(j);
      let temp_ignore_question = question.get('ignore');
      if (temp_ignore_question === false) {
        let current_selected_block = question.get('block');
        let temp_row_number = temp_team_start + current_selected_block;
        const questionTeams = question.get('teams');
        team_and_block_score_summary[temp_row_number][4] += questionTeams.get(i).get('score');
        team_and_block_score_summary[temp_row_number][4] += questionTeams.get(i).get('extraCredit');
        team_and_block_score_summary[temp_row_number][5] += question.get('score');
        team_and_block_score_summary[temp_row_number][2] = format_percent(team_and_block_score_summary[temp_row_number][4]/team_and_block_score_summary[temp_row_number][5], 2);
        team_and_block_score_summary[temp_row_number][3] = format_score(team_and_block_score_summary[temp_row_number][4], team_and_block_score_summary[temp_row_number][5]);
      }
    }
  }
  
  //Remove team-block combinations with no questions (where total points = 0)
  team_and_block_score_summary = team_and_block_score_summary.filter((row, index) => index === 0 || row[5] > 0);
  
  return team_and_block_score_summary;
}
function get_question_log(temp_question_count = -1) {
  const session = get_current_session();
  if (!session) return [[t('table.question'), t('score_entry.block_group'), t('table.possible_points'), t('table.ignore_question')]];

  var question_names = get_question_names();
  const questions = session.get('questions');
  if (temp_question_count == -1) {
    var question_count = question_names.length - 1;
  } else {
    var question_count = temp_question_count;
  }
  if (questions.get(question_count).get('score') == 0) {
    question_count--;
  }
  let team_names = get_team_names();
  let team_count = team_names.length - 1;
  let block_names = get_block_names();
  let block_count = block_names.length - 1;

  //Create empty summary array
  let temp_row = new Array();
  temp_row.push(t('table.question'));
  temp_row.push(t('score_entry.block_group'));
  temp_row.push(t('table.possible_points'));
  temp_row.push(t('table.ignore_question'));
  for (let i=1; i <= team_count; i++) {
    temp_row.push(team_names[i]);
  }
  let question_log_summary = Array()
  question_log_summary.push(temp_row);

  for (let i=1; i <= question_count; i++) {
    temp_row = Array();
    const question = questions.get(i);
    temp_row.push(question_names[i]);
    temp_row.push(block_names[question.get('block')]);
    temp_row.push(question.get('score'));
    temp_row.push(question.get('ignore'))
    const questionTeams = question.get('teams');
    for (let j=1; j <= team_count; j++) {
      let extra_credit = questionTeams.get(j).get('extraCredit');
      if (extra_credit > 0) {
        temp_row.push(questionTeams.get(j).get('score')+" + "+extra_credit);
      } else {
        temp_row.push(questionTeams.get(j).get('score'));
      }
    }
    question_log_summary.push(temp_row);
  }
  return question_log_summary;
}
