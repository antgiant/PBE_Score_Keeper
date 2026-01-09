var import_status = "append";

//Setup heml escape variables
var DOMtext = document.createTextNode("test");
var DOMnative = document.createElement("span");
DOMnative.appendChild(DOMtext);

//main work for each case
function HTMLescape(html){
  DOMtext.nodeValue = html;
  return DOMnative.innerHTML
}
