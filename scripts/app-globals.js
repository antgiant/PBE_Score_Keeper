// Active question index - transient app state (not synced, lost on page reload)
// Each session loads at its last question; each tab navigates independently
var current_question_index = 1;

//Setup heml escape variables
var DOMtext = document.createTextNode("test");
var DOMnative = document.createElement("span");
DOMnative.appendChild(DOMtext);

//main work for each case
function HTMLescape(html){
  DOMtext.nodeValue = html;
  return DOMnative.innerHTML
}
