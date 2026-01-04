function arrayToCsv(data){
  return data.map(row =>
    row
    .map(String)  // convert every value to String
    .map(v => v.replaceAll('"', '""'))  // escape double quotes
    .map(v => `"${v}"`)  // quote it
    .join(',')  // comma-separated
  ).join('\r\n');  // rows starting on new lines
}
function filter_to_current_session(key, value) {    
  let current_session = Number(get_element("current_session"));
  let session_names = JSON.parse(get_element("session_names"));

  if (key.substring(0,8) == "session_") {
    let temp = "session_" + current_session;
    if (key == "session_names") {
      return JSON.stringify(["", session_names[current_session]]);
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
          //Note: This is a very basic validation. It is only check for existence of required elements. It is not validating those elements to be safe.
          if (validate_data(temp_import_data)) {
            
            //Upgrade the data structure to the current version
            let data_version = JSON.parse(get_element("data_version", temp_import_data));
            temp_import_data = data_upgrades(data_version, temp_import_data);
            
            if (import_status == "replace" 
                && window.confirm("Are you sure you want to irreversably delete all of your current data and replace it with this import?")) {

              //Clear existing data
              localStorage.clear();
              //Import new data
              Object.keys(temp_import_data).forEach(function (k) {
                //No need to parse and then stringify as it is already stringified
                set_element(k, temp_import_data[k]);
              });
              //Force a refresh of the display
              sync_data_to_display();
              //Change the on screen display to the Configuration screen
              $( '#accordion' ).accordion({active: 0});
            } else if (import_status == "append") {
              //delete data version as it is already right
              delete temp_import_data['data_version'];

              //Merge Session Names and then delete from import
              let old_session_count = JSON.parse(get_element("session_names")).length - 1;
              let temp = JSON.parse(get_element("session_names", temp_import_data));
              //Remove initial empty element
              temp.splice(0, 1);
              set_element("session_names", JSON.stringify(JSON.parse(get_element("session_names")).concat(temp)));
              delete temp_import_data['session_names'];

              //Set current session to last of merged in sessions and then delete from import
              set_element("current_session", JSON.parse(get_element("session_names")).length - 1);
              current_session = Number(JSON.parse(get_element("current_session")));
              delete temp_import_data['current_session'];

              //renumber sessions to be merged in
              const session_locator = /^(.*session_)([0-9]+)(_.*)$/;
              for (let key in temp_import_data){
                let session_number = key.match(session_locator)[2];
                let temp_key = key.match(session_locator)[1]+(Number(key.match(session_locator)[2]) + Number(old_session_count))+key.match(session_locator)[3];
                set_element(temp_key, get_element(key, temp_import_data));
                delete temp_import_data[key];
              }

              //Merge in the new data
              Object.keys(temp_import_data).forEach(function (k) {
                //No need to parse and then stringify as it is already stringified
                set_element(k, temp_import_data[k]);
              });

              //Force a refresh of the display
              sync_data_to_display();
              //Change the on screen display to the Configuration screen
              $( '#accordion' ).accordion({active: 0});
            }
            else {
              //Do nothing
            }
          } else {
            alert("Selected imported data is not valid.");
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
  
