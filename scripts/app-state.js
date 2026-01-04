function initialize_state() {

  //Get Data Version and upgrade if needed
  var data_version = JSON.parse(get_element("data_version"));
  //No data version means this is a first run. Initialize data state
  if (data_version === null) {
    var d = new Date();
    var date = d.toLocaleString();
    var initial_state = {
      "data_version": 1.5,
      "session_names": ["", "Session "+date],
      "current_session": 1,
      "session_1_max_points_per_question": 12,
      "session_1_rounding": "false",
      "session_1_block_names": ["No Block/Group", "Block/Group 1"],
      "session_1_team_names": ["", "Team 1"],
      "session_1_question_names": ["", "Question 1"],
      "session_1_current_question": 1,
      "session_1_question_1_score": 0,
      "session_1_question_1_block": 0,
      "session_1_question_1_ignore": "false",
      "session_1_question_1_team_1_score": 0,
      "session_1_question_1_team_1_extra_credit": 0
    };
    //Save it
    for (let [key, value] of Object.entries(initial_state)) {
      set_element(key, JSON.stringify(value));
    }
    
  } 
  //Make sure datasctructure is current
  data_upgrades(data_version);

  //Load current session from previously saved data
  current_session = Number(JSON.parse(get_element("current_session")));
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
        let team_names = JSON.parse(get_element("session_"+current_session+"_team_names"));
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
