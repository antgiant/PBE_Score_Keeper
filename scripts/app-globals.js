// Active question index - transient app state (not synced, lost on page reload)
// Each session loads at its last question; each tab navigates independently
var current_question_index = 1;
var TIMER_DEFAULT_FIRST_POINT_SECONDS = 10;
var TIMER_DEFAULT_SUBSEQUENT_POINT_SECONDS = 5;
var TIMER_DEFAULT_WARNING_FLASH_SECONDS = 10;

// Question timer runtime state (local only)
var question_timer_interval = null;
var question_timer_running = false;
var question_timer_remaining_seconds = 0;
var question_timer_duration_seconds = 0;
var question_timer_question_id = null;
var question_timer_expired = false;
var question_timer_warning_flash_timeout = null;
var question_timer_warning_flash_trigger_seconds = TIMER_DEFAULT_WARNING_FLASH_SECONDS;

// Embedding API configuration. Standalone mode keeps this disabled unless
// ?embedded=1 is present or a host explicitly enables it before app startup.
var EMBEDDING_CONFIG = {
  enabled: false,
  apiVersion: 1,
  hostOrigin: null,
  allowedOrigins: ["*"],
  allowedHosts: [],
  readyTimeoutMs: 10000,
  maxPayloadBytes: 524288,
  rateLimit: {
    enabled: true,
    windowMs: 1000,
    maxMessages: 80,
    maxCommands: 40
  }
};

//Setup heml escape variables
var DOMtext = document.createTextNode("test");
var DOMnative = document.createElement("span");
DOMnative.appendChild(DOMtext);

//main work for each case
function HTMLescape(html){
  DOMtext.nodeValue = html;
  return DOMnative.innerHTML
}
