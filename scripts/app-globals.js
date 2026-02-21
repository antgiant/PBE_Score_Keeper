// Active question index - transient app state (not synced, lost on page reload)
// Each session loads at its last question; each tab navigates independently
var current_question_index = 1;
var TIMER_DEFAULT_FIRST_POINT_SECONDS = 10;
var TIMER_DEFAULT_SUBSEQUENT_POINT_SECONDS = 5;

// Question timer runtime state (local only)
var question_timer_interval = null;
var question_timer_running = false;
var question_timer_remaining_seconds = 0;
var question_timer_duration_seconds = 0;
var question_timer_question_id = null;
var question_timer_expired = false;

//Setup heml escape variables
var DOMtext = document.createTextNode("test");
var DOMnative = document.createElement("span");
DOMnative.appendChild(DOMtext);

//main work for each case
function HTMLescape(html){
  DOMtext.nodeValue = html;
  return DOMnative.innerHTML
}
