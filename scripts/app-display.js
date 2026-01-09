function initialize_display() {
  //Set up Accordion display
  $("#accordion").accordion({
    heightStyle: "content"
  });

  //Set up score entry buttons
  $( "#question_score" ).controlgroup();
  $( "#question_block" ).controlgroup();
  $( "#rounding" ).controlgroup();
  $( "#import" ).controlgroup();

  //Block multi-line question titles
  $("#current_question_title").keypress(function(e){ 
    if (e.which == 13) {
      $("#current_question_title").trigger("onblur");
      return false;
    } else {
      return true;
    } 
  });
  $("#session_name").keypress(function(e){ 
    if (e.which == 13) {
      $("#session_name").trigger("onblur");
      return false;
    } else {
      return true;
    } 
  });
  
  initialize_theme_controls();
  sync_data_to_display();
  initialize_reorder_controls();
  initialize_history_viewer();

  setup_file_import();
}
function sync_data_to_display() {
  //Load "Universal" DB data into variables from Yjs
  var session_names = get_session_names();
  var session_count = session_names.length - 1;
  const session = get_current_session();
  if (!session) {
    console.error('No current session found');
    return;
  }
  const config = session.get('config');
  var max_points = config.get('maxPointsPerQuestion');
  var rounding = config.get('rounding');
  var team_names = get_team_names();
  var team_count = team_names.length - 1;
  var block_names = get_block_names();
  var block_count = block_names.length - 1;
  var question_names = get_question_names();
  var question_count = question_names.length - 1;
  const questions = session.get('questions');
  if (questions.get(question_count).get('score') == 0) {
    question_count--;
  }
  var current_question = session.get('currentQuestion');
  const currentQuestionObj = questions.get(current_question);
  const currentQuestionTeams = currentQuestionObj.get('teams');
  var current_selected_block = currentQuestionObj.get('block');
  var question_max_points = currentQuestionObj.get('score');
  var ignore_question = currentQuestionObj.get('ignore');

  //Update Session name to saved name
  $("#session_name").text(session_names[current_session]);

  //Set up Session quick navigation
  var session_quick_nav = '<select name="session_quick_nav" id="session_quick_nav" onchange="local_data_update(this)"">';
  let temp_count = (current_session>session_count?current_session:session_count);
  for (let i=1; i <= temp_count; i++) {
    if (i==current_session) {
      session_quick_nav += '<option value="'+i+'" selected>'+i+" of "+session_count+'</option>';
    } else {
      session_quick_nav += '<option value="'+i+'">'+i+" of "+session_count+' - '+HTMLescape(session_names[i])+'</option>';
    }
  }
  session_quick_nav += '</select>';
  $("#session_display_count").html(session_quick_nav);

  //Disable Next Session Button if this Session has no data
  if (question_count > 1) {
    $("#new_session").prop("disabled", false);
  } else {
    $("#new_session").prop("disabled", true);
  }
  
  //Set up Summary Stats here so that those calculations can be reused elsewhere
  //Update Team Scores
  let team_score_summary = get_team_score_summary();
  
  //Fill in Team Placement and create output table
  let temp_output = "<table><thead><tr><th>Team Name</th><th>Percent</th><th>Score</th><th>Placement</th></tr></thead><tbody>";
  for (let i=1; i <= team_count; i++) {
    temp_output = temp_output+"<tr><td>"+HTMLescape(team_score_summary[i][0])+"</td>";
    temp_output = temp_output+"<td>"+team_score_summary[i][1]+"</td>";
    temp_output = temp_output+"<td>"+team_score_summary[i][2]+"</td>";
    temp_output = temp_output+"<td>"+team_score_summary[i][3]+"</td></tr>\n"
  }
  temp_output = temp_output+"</tbody></table>";

  //Update displayed Team Scores
  $("#team_scores").html(temp_output);

  //Update Rounded Team Scores  
  //Fill in Team Placement and create output table
  temp_output = "<table><thead><tr><th>Team Name</th><th>Percent</th><th>Score</th><th>Placement</th></tr></thead><tbody>";
  for (let i=1; i <= team_count; i++) {
    temp_output = temp_output+"<tr><td>"+HTMLescape(team_score_summary[i][0])+"</td>";
    temp_output = temp_output+"<td>"+team_score_summary[i][7]+"</td>";
    temp_output = temp_output+"<td>"+team_score_summary[i][8]+"</td>";
    temp_output = temp_output+"<td>"+team_score_summary[i][9]+"</td></tr>\n"
  }
  temp_output = temp_output+"</tbody></table>";

  //Update displayed Team Scores
  $("#rounded_team_scores").html(temp_output);

  //Update Block/Group Scores
  let block_score_summary = get_block_score_summary();

  //Fill in Block/Group Placement and create output table
  temp_output = "<table><thead><tr><th>Block/Group Name</th><th>Percent</th><th>Score</th></tr></thead><tbody>";
  for (let i=1; i <= block_count + 1; i++) {
    if (block_score_summary[i][4] > 0) {
      temp_output = temp_output+"<tr><td>"+HTMLescape(block_score_summary[i][0])+"</td>";
      temp_output = temp_output+"<td>"+block_score_summary[i][1]+"</td>";
      temp_output = temp_output+"<td>"+block_score_summary[i][2]+"</td></tr>\n"
    }
  }
  temp_output = temp_output+"</tbody></table>";

  //Update displayed Block/Group Scores
  $("#block_scores").html(temp_output);


  //Update Team and Block/Group Scores
  let team_and_block_score_summary = get_team_and_block_score_summary();

  //Fill in Team and Block/Group scores and create output table
  temp_output = "<table><thead><tr><th>Team Name</th><th>Block/Group Name</th><th>Percent</th><th>Score</th></tr></thead><tbody>";
  for (let i=1; i < team_and_block_score_summary.length; i++) {
    if (team_and_block_score_summary[i][5] > 0) {
      temp_output = temp_output+"<tr><td>"+HTMLescape(team_and_block_score_summary[i][0])+"</td>";
      temp_output = temp_output+"<td>"+HTMLescape(team_and_block_score_summary[i][1])+"</td>";
      temp_output = temp_output+"<td>"+team_and_block_score_summary[i][2]+"</td>";
      temp_output = temp_output+"<td>"+team_and_block_score_summary[i][3]+"</td></tr>\n";
    }
  }
  temp_output = temp_output+"</tbody></table>";

  //Update displayed Team and Block/Group Scores
  $("#team_and_block_scores").html(temp_output);

  //Update displayed Question Log
  //Create empty summary array
  let question_log_summary = get_question_log();
  
  //Fill in Team and Block/Group scores and create output table
  temp_output = "<table><thead><tr><th>Question</th><th>Block/Group</th><th>Possible Points</th>";
  for (let i=1; i <= team_count; i++) {
    temp_output = temp_output + "<th>"+HTMLescape(team_names[i])+" Score</th>";
  }
  temp_output = temp_output + "</tr></thead><tbody>";
  for (var i=1; i < question_log_summary.length; i++) {
    if (question_log_summary[i][3] === "false") {
      temp_output = temp_output+"<tr><td>"+HTMLescape(question_log_summary[i][0])+"</td>";
      temp_output = temp_output+"<td>"+HTMLescape(question_log_summary[i][1])+"</td>";
      temp_output = temp_output+"<td>"+question_log_summary[i][2]+"</td>";
      for (let j=1; j <= team_count; j++) {
        temp_output = temp_output+"<td>"+question_log_summary[i][j+3]+"</td>";
      }
    }
    temp_output = temp_output+"</tr>\n"
  }
  temp_output = temp_output+"</tbody></table>";

  //Update displayed Question Log
  $("#scores").html(temp_output);
  //Set up Teams

  //Show Team Count
  $("#total_teams").text(team_count);
  if (team_count == 1) {
    $("#total_teams_text").text("team");
    $("#total_teams_decrease").prop("disabled", true);
  } else {
    $("#total_teams_text").text("teams");
    $("#total_teams_decrease").prop("disabled", false);
  }

  //Set up Team Name Editing
  let displayed_teams_count = $("#team_names").children().length;
  if (displayed_teams_count < team_count) {
    for (let i=displayed_teams_count + 1;i<=team_count;i++) {
      //Add new
      let teamName = team_names[i] || ('Team ' + i);
      $("#team_names").append('<div class="reorder-item" data-index="'+i+'"><button type="button" class="drag-handle" draggable="true" aria-label="Drag to reorder Team '+i+'">&equiv; &#8597;</button><label><span class="reorder-label">Team '+i+' Name:</span> <input type = "text" name = "team_'+i+'_name" id = "team_'+i+'_name" onchange="local_data_update(this)" value = "'+teamName.replace('"', "&quote")+'"></label></div>');
      $("#question_teams").append('<fieldset><legend id=team_'+i+'_points_label>Team '+HTMLescape(teamName)+' Score</legend><div id="team_'+i+'_score"></div>'+
                                   '<legend id=team_'+i+'_extra_credit_label style="display:none">Extra Credit<div><button id="team_'+i+'_extra_credit_decrease" onclick="local_data_update(this)" >-</button><span id="team_'+i+'_extra_credit" class="extra_credit_amount">0</span><button id ="team_'+i+'_extra_credit_increase" onclick="local_data_update(this)" >+</button></div></legend></fieldset>');
      $("#team_"+i+"_score").append('<label><input type="radio" id="team_'+i+'_score_0" name="team_'+i+'_score" value=0 onchange="local_data_update(this)">0</label>');
      $( "#team_"+i+"_score" ).controlgroup();
    }
  } else if (displayed_teams_count > team_count) {
    //remove extra
    for (let i=displayed_teams_count;i>team_count;i--) {
      $("#team_names").children()[i - 1].remove();
      $("#question_teams").children()[i - 1].remove();
    }
  } else {
    //Already have the right number do nothing
  }

  //Update Team Names (Yes this is ineffecient but the numbers are so small it doesn't really matter)
  for (let i=1;i<=team_count;i++) {
    let team_input = $("#team_"+i+"_name");
    if (typeof team_input.closest === "function") {
      let team_item = team_input.closest(".reorder-item");
      if (team_item.length) {
        team_item.attr("data-index", i);
        team_item.find(".reorder-label").text("Team "+i+" Name:");
        team_item.find(".drag-handle").attr("aria-label", "Drag to reorder Team "+i);
        $("#team_names").append(team_item);
      }
    }
    var question_earned = 0;
    //Get total points earned for this question
    for (var j=1; j <= team_count; j++) {
      question_earned += currentQuestionTeams.get(j).get('score');
    }
    let temp_current_question_number = current_question;
    //Go back one question if no one has answered this one yet
    if (question_count == current_question && question_count > 0 && question_earned == 0) {
      temp_current_question_number--;
    }
    let temp_team_score_summary = get_team_score_summary(temp_current_question_number);
    let temp_team_and_block_score_summary = get_team_and_block_score_summary(temp_current_question_number);
    let team_and_block_row = (i - 1)*(block_count + 1) + 1 + current_selected_block;
    let temp_team_score = "";
    if (temp_team_score_summary[i][5] > 0) {
      if (rounding === true) {
        temp_team_score += " "+temp_team_score_summary[i][7];
      } else {
        temp_team_score += " "+temp_team_score_summary[i][1];
      }
    }
    if (temp_team_and_block_score_summary[team_and_block_row][5] > 0) {
      temp_team_score +=" ("+
                    block_names[current_selected_block]+" "+
                    temp_team_and_block_score_summary[team_and_block_row][2]+")";
    }
    let currentTeamName = team_names[i] || ('Team ' + i);
    if (currentTeamName.slice(-1).toLowerCase() === "s") {
      $("#team_"+i+"_points_label").text(currentTeamName+"' score"+temp_team_score);
    } else {
      $("#team_"+i+"_points_label").text(currentTeamName+"'s score"+temp_team_score);
    }
    $("#team_"+i+"_name").val(currentTeamName);
  }

  for (let i=1;i<=team_count;i++) {
    let team_score = $("#team_"+i+"_score");
    if (typeof team_score.closest === "function") {
      let team_fieldset = team_score.closest("fieldset");
      if (team_fieldset.length) {
        $("#question_teams").append(team_fieldset);
      }
    }
  }

  //Set up Blocks/Groups
  
  //Show block/group count
  $("#total_blocks").text(block_count);
  if (block_count == 1) {
    $("#total_blocks_text").text("block/group");
    $("#total_blocks_decrease").prop("disabled", true);
  } else {
    $("#total_blocks_text").text("blocks/groups");
    $("#total_blocks_decrease").prop("disabled", false);
  }

  //Set up Block/Group renaming
  let displayed_block_count = $("#block_names").children().length;
  if (displayed_block_count < block_count) {
    for (let i=displayed_block_count + 1;i<=block_count;i++) {
      //Add new
      let blockName = block_names[i] || ('Block/Group ' + i);
      $("#block_names").append('<div class="reorder-item" data-index="'+i+'"><button type="button" class="drag-handle" draggable="true" aria-label="Drag to reorder Block/Group '+i+'">&equiv; &#8597;</button><label><span class="reorder-label">Block/Group '+i+' Name:</span> <input type = "text" name = "block_'+i+'_name" id = "block_'+i+'_name" onchange="local_data_update(this)" value = "'+blockName.replace('"', "&quote")+'"></label></div>');
      $("#question_block").append('<label><input type="radio" id="question_block_'+i+'" name="question_block" value="'+i+'" onchange="local_data_update(this)"><span id="block_'+i+'_label">'+HTMLescape(blockName)+'</span></label>');
    }
  }
  else if (displayed_block_count > block_count) {
    //remove extra
    for (let i=displayed_block_count;i>block_count;i--) {
      $("#block_names").children()[i - 1].remove();
      $("#question_block").children()[i - 1].remove();
    }
  } else {
    //Already have the right number do nothing
  }

  //Update Block/Group Names (Yes this is ineffecient but the numbers are so small it doesn't really matter)
  try {
    $( "#question_block" ).controlgroup( "destroy" );
  } catch(e) {
    // Controlgroup not initialized yet, that's okay
  }
  for (let i=1;i<=block_count;i++) {
    let block_input = $("#block_"+i+"_name");
    if (typeof block_input.closest === "function") {
      let block_item = block_input.closest(".reorder-item");
      if (block_item.length) {
        block_item.attr("data-index", i);
        block_item.find(".reorder-label").text("Block/Group "+i+" Name:");
        block_item.find(".drag-handle").attr("aria-label", "Drag to reorder Block/Group "+i);
        $("#block_names").append(block_item);
      }
    }
    let currentBlockName = block_names[i] || ('Block/Group ' + i);
    $("#block_"+i+"_label").text(currentBlockName);
    let question_block = $("#question_block_"+i);
    if (typeof question_block.closest === "function") {
      $("#question_block").append(question_block.closest("label"));
    }

    $("#block_"+i+"_name").val(currentBlockName);
    //Check off saved block/group
    if (i == current_selected_block) {
      $("#question_block_"+i).prop("checked", true);
    } else {
      $("#question_block_"+i).prop("checked", false);
    }
  }
  $( "#question_block" ).controlgroup();

  //Update Question name to saved name
  $("#current_question_title").text(question_names[current_question]);

  //Set up Question quick navigation
  let question_quick_nav = '<select name="question_quick_nav" id="question_quick_nav" onchange="local_data_update(this)"">';
  temp_count = (current_question>question_count?current_question:question_count);
  for (let i=1; i <= temp_count; i++) {
    let temp_ignore_question = questions.get(i).get('ignore');
    if (i==current_question) {
      question_quick_nav += '<option value="'+i+'" selected>'+(temp_ignore_question === true?"🚫":"")+i+" of "+question_count+'</option>';
    } else {
      question_quick_nav += '<option value="'+i+'">'+(temp_ignore_question === true?"🚫":"")+i+" of "+question_count+' - '+HTMLescape(question_names[i])+'</option>';
    }
  }
  question_quick_nav += '</select>';
  $("#current_question_title_count").html(question_quick_nav);

  //Set up Max Points per Question

  //Show block/group count
  $("#max_points").text(max_points);
  if (max_points == 1) {
    $("#max_points_text").text("point");
    $("#max_points_decrease").prop("disabled", true);
  } else {
    $("#max_points_text").text("points");
    $("#max_points_decrease").prop("disabled", false);
  }

  //Set up max possible points for all questions
  let current_max_possible_points = $("#question_score").children().length;
  if (current_max_possible_points < max_points) {
    for (let i=current_max_possible_points + 1;i<=max_points;i++) {
      //Add new
      $("#question_score").append('<label><input type="radio" id="question_score_'+i+'" name="question_score" value='+i+' onchange="local_data_update(this)">'+i+'</label>');
    }
  }
  else if (current_max_possible_points > max_points) {
    //remove extra
    for (let i=current_max_possible_points;i>max_points;i--) {
      $("#question_score").children()[i - 1].remove();
    }
  } else {
    //Already have the right number do nothing
  }
  //Select actual score if possible
  for (let i=0; i<=max_points; i++) {
    if (i == question_max_points) {
      $("#question_score_" + i).prop("checked", true);
    } else {
      $("#question_score_" + i).prop("checked", false);
    }
  }

  //Disable selecting max possible score lower than already earned score
  let temp_max = 0;
  for (let i = 1; i <= team_count; i++) {
    if (temp_max < currentQuestionTeams.get(i).get('score')) {
      temp_max = currentQuestionTeams.get(i).get('score');
    }
  }
  for (let i = 0; i < max_points; i++) {
    if (i < temp_max) {
      $("#question_score_" + i).prop("disabled", true);
    } else {
      $("#question_score_" + i).prop("disabled", false);
    }
  }

  //Add fancy options to new buttons
  try {
    $( "#question_score" ).controlgroup( "refresh" );
  } catch(e) {
    // Controlgroup not initialized yet
  }

  //Set up max possible points on this question (for each team)
  for (let i=1;i<=team_count;i++) {
    let current_team_and_question_score = currentQuestionTeams.get(i).get('score');
    let current_point_count = $("#team_"+i+"_score").children().length - 1;
    if (current_point_count < question_max_points) {
      //Add new
      for (let j = current_point_count; j <= question_max_points - 1; j++) {
        $("#team_"+i+"_score").append('<label><input type="radio" id="team_'+i+'_score_'+(j + 1)+'" name="team_'+i+'_score" value='+(j + 1)+' onchange="local_data_update(this)">'+(j + 1)+'</label>');
      }
    } else if (current_point_count > question_max_points) {
      //remove extra
      for (let j = current_point_count; j > question_max_points; j--) {
        $("#team_"+i+"_score").children()[j].remove();
      }
    } else {
      //Already have the right number do nothing
    }

    //Check off saved score
    $("#team_"+i+"_score_" + current_team_and_question_score).prop("checked", true);

    //Add corrected point options
    try {
      $( "#team_"+i+"_score" ).controlgroup("refresh");
    } catch(e) {
      // Controlgroup not initialized yet
    }
  }


  //Show rounding status
  if (rounding === true) {
    $("#rounding_yes").prop("checked", true);
  } else {
    $("#rounding_no").prop("checked", true);
  }

  //Show ignore status
  if (ignore_question === true) {
    $("#ignore_question").prop("checked", true);
    $("#ignore_question_warning").show();
    $("#ignored_question").css("opacity", 0.25);
    $("#ignored_question").css("pointer-events", "none");
  } else {
    $("#ignore_question").prop("checked", false);
    $("#ignore_question_warning").hide();
    $("#ignored_question").css("opacity", 1);
    $("#ignored_question").css("pointer-events", "initial");
  }

  //Manage extra credit status
  let temp_extra_credit = 0;
  let temp = 0;
  for (let i=1;i<=team_count;i++) {
    temp = currentQuestionTeams.get(i).get('extraCredit');
    if (temp == undefined) {
      temp = 0;
    }
    $('#team_'+i+'_extra_credit').text(temp);
    temp_extra_credit += temp;
  }

  if (temp_extra_credit > 0 || $("#extra_credit").prop("checked")) {
    //Show Extra Credit
    $("#extra_credit").prop("checked", true);
    for (let i=1;i<=team_count;i++) {
      $('#team_'+i+'_extra_credit_label').show();
    }
  } else {
    //Hide Extra Credit
    $("#extra_credit").prop("checked", false);
    for (let i=1;i<=team_count;i++) {
      $('#team_'+i+'_extra_credit_label').hide();
    }
  }

  //Refresh display
  try {
    $( "#rounding" ).controlgroup("refresh");
  } catch(e) {
    // Controlgroup not initialized yet
  }

  //Disable Previous Question Button if this is the first Question
  if (current_question == 1) {
    $("#previous_question").prop("disabled", true);
    $("#previous_question_2").prop("disabled", true);
  } else {
    $("#previous_question").prop("disabled", false);
    $("#previous_question_2").prop("disabled", false);
  }

  //Change Next Question to New Question if that is reality
  if (current_question >= question_count) {
    $("#next_question").text("New Question");
    $("#next_question_2").text("New Question");
  } else {
    $("#next_question").text("Next Question");
    $("#next_question_2").text("Next Question");
  }

  //Disable Next Question Button if max possible points is not set
  if (question_max_points == 0) {
    $("#next_question").prop("disabled", true);
    $("#next_question_2").prop("disabled", true);
  } else {
    $("#next_question").prop("disabled", false);
    $("#next_question_2").prop("disabled", false);
  }
}
