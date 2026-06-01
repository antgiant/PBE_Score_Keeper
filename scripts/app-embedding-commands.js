/**
 * Embedding command handlers for iframe host integrations.
 *
 * The transport lives in app-embedding-api.js. This module registers the app
 * command surface and translates host payloads into existing Yjs app updates.
 */

var EmbeddingCommands = {
  initialized: false,
  commandNames: [
    "session:list",
    "session:getCurrent",
    "session:create",
    "session:switch",
    "session:rename",
    "session:delete",
    "session:reorder",
    "session:export",
    "session:import",
    "question:next",
    "question:previous",
    "question:goto",
    "question:create",
    "question:rename",
    "question:setMaxPoints",
    "question:setBlock",
    "question:ignore",
    "question:delete",
    "score:set",
    "score:setExtraCredit",
    "score:getMaxPoints",
    "score:getTotalPoints",
    "block:create",
    "block:rename",
    "block:setDefault",
    "block:delete",
    "block:list",
    "timer:enable",
    "timer:disable",
    "timer:setDuration",
    "timer:setAutoStart",
    "timer:play",
    "timer:pause",
    "timer:restart",
    "sync:connect",
    "sync:disconnect",
    "sync:getState",
    "sync:getRoomCode",
    "sync:joinRoom",
    "sync:createRoom",
    "sync:setPassword",
    "sync:setDisplayName",
    "sync:getPeers",
    "ui:setTheme",
    "ui:setLanguage",
    "ui:show",
    "ui:hide",
    "ui:focus"
  ],

  init: function() {
    if (this.initialized) {
      return true;
    }
    if (typeof EmbeddingAPI === "undefined" || !EmbeddingAPI || typeof EmbeddingAPI.registerCommand !== "function") {
      return false;
    }

    var self = this;
    var handlers = this.getHandlers();
    this.commandNames.forEach(function(commandName) {
      EmbeddingAPI.registerCommand(commandName, handlers[commandName].bind(self));
    });

    this.initialized = true;
    return true;
  },

  resetForTests: function() {
    this.initialized = false;
  },

  getHandlers: function() {
    return {
      "session:list": this.sessionList,
      "session:getCurrent": this.sessionGetCurrent,
      "session:create": this.sessionCreate,
      "session:switch": this.sessionSwitch,
      "session:rename": this.sessionRename,
      "session:delete": this.sessionDelete,
      "session:reorder": this.sessionReorder,
      "session:export": this.sessionExport,
      "session:import": this.sessionImport,
      "question:next": this.questionNext,
      "question:previous": this.questionPrevious,
      "question:goto": this.questionGoto,
      "question:create": this.questionCreate,
      "question:rename": this.questionRename,
      "question:setMaxPoints": this.questionSetMaxPoints,
      "question:setBlock": this.questionSetBlock,
      "question:ignore": this.questionIgnore,
      "question:delete": this.questionDelete,
      "score:set": this.scoreSet,
      "score:setExtraCredit": this.scoreSetExtraCredit,
      "score:getMaxPoints": this.scoreGetMaxPoints,
      "score:getTotalPoints": this.scoreGetTotalPoints,
      "block:create": this.blockCreate,
      "block:rename": this.blockRename,
      "block:setDefault": this.blockSetDefault,
      "block:delete": this.blockDelete,
      "block:list": this.blockList,
      "timer:enable": this.timerEnable,
      "timer:disable": this.timerDisable,
      "timer:setDuration": this.timerSetDuration,
      "timer:setAutoStart": this.timerSetAutoStart,
      "timer:play": this.timerPlay,
      "timer:pause": this.timerPause,
      "timer:restart": this.timerRestart,
      "sync:connect": this.syncConnect,
      "sync:disconnect": this.syncDisconnect,
      "sync:getState": this.syncGetState,
      "sync:getRoomCode": this.syncGetRoomCode,
      "sync:joinRoom": this.syncJoinRoom,
      "sync:createRoom": this.syncCreateRoom,
      "sync:setPassword": this.syncSetPassword,
      "sync:setDisplayName": this.syncSetDisplayName,
      "sync:getPeers": this.syncGetPeers,
      "ui:setTheme": this.uiSetTheme,
      "ui:setLanguage": this.uiSetLanguage,
      "ui:show": this.uiShow,
      "ui:hide": this.uiHide,
      "ui:focus": this.uiFocus
    };
  },

  getGlobal: function(name) {
    var root = (typeof globalThis !== "undefined") ? globalThis : (typeof window !== "undefined" ? window : null);
    if (root && root[name] !== undefined) {
      return root[name];
    }
    if (typeof window !== "undefined" && window[name] !== undefined) {
      return window[name];
    }
    return undefined;
  },

  callGlobal: function(name, args) {
    var fn = this.getGlobal(name);
    if (typeof fn !== "function") {
      return undefined;
    }
    return fn.apply((typeof window !== "undefined" ? window : null), args || []);
  },

  error: function(code, message) {
    if (typeof EmbeddingAPI !== "undefined" && EmbeddingAPI && typeof EmbeddingAPI.createError === "function") {
      return EmbeddingAPI.createError(code, message || code);
    }
    var err = new Error(message || code);
    err.code = code;
    return err;
  },

  requireFunction: function(name, code) {
    var fn = this.getGlobal(name);
    if (typeof fn !== "function") {
      throw this.error(code || "feature_unavailable", name + " is unavailable");
    }
    return fn;
  },

  ensureFeature: function(featureName) {
    var ensure = this.getGlobal("ensure_feature_loaded");
    if (typeof ensure !== "function") {
      return Promise.resolve();
    }
    return ensure(featureName);
  },

  isFiniteNumber: function(value) {
    return typeof value === "number" && Number.isFinite(value);
  },

  getString: function(payload, keys, options) {
    options = options || {};
    payload = payload || {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (payload[key] === undefined || payload[key] === null) {
        continue;
      }
      if (typeof payload[key] !== "string") {
        throw this.error("invalid_parameter", key + " must be a string");
      }
      var value = options.trim === false ? payload[key] : payload[key].trim();
      if (options.sanitize !== false) {
        value = this.sanitizeString(value);
      }
      if (!options.allowEmpty && value.length === 0) {
        throw this.error("invalid_parameter", key + " is required");
      }
      if (options.maxLength && value.length > options.maxLength) {
        value = value.substring(0, options.maxLength);
      }
      return value;
    }
    if (options.required) {
      throw this.error("missing_parameter", keys[0] + " is required");
    }
    return options.defaultValue;
  },

  sanitizeString: function(value) {
    return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  },

  getNumber: function(payload, keys, options) {
    options = options || {};
    payload = payload || {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (payload[key] === undefined || payload[key] === null || payload[key] === "") {
        continue;
      }
      var value = Number(payload[key]);
      if (!Number.isFinite(value)) {
        throw this.error("invalid_parameter", key + " must be a number");
      }
      if (options.integer) {
        value = Math.floor(value);
      }
      if (options.min !== undefined && value < options.min) {
        throw this.error("invalid_parameter", key + " is below the allowed minimum");
      }
      if (options.max !== undefined && value > options.max) {
        throw this.error("invalid_parameter", key + " is above the allowed maximum");
      }
      return value;
    }
    if (options.required) {
      throw this.error("missing_parameter", keys[0] + " is required");
    }
    return options.defaultValue;
  },

  getBoolean: function(payload, keys, options) {
    options = options || {};
    payload = payload || {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (payload[key] === undefined || payload[key] === null) {
        continue;
      }
      if (typeof payload[key] === "boolean") {
        return payload[key];
      }
      if (payload[key] === "true" || payload[key] === "1" || payload[key] === 1) {
        return true;
      }
      if (payload[key] === "false" || payload[key] === "0" || payload[key] === 0) {
        return false;
      }
      throw this.error("invalid_parameter", key + " must be a boolean");
    }
    if (options.required) {
      throw this.error("missing_parameter", keys[0] + " is required");
    }
    return options.defaultValue;
  },

  getActiveContext: function(options) {
    options = options || {};
    var getSession = this.getGlobal("get_current_session");
    var getDoc = this.getGlobal("getActiveSessionDoc");
    var session = typeof getSession === "function" ? getSession() : null;
    var sessionDoc = typeof getDoc === "function" ? getDoc() : null;

    if ((!session || !sessionDoc) && options.allowMissing) {
      return null;
    }
    if (!session || !sessionDoc) {
      throw this.error("state_unavailable", "Active session is unavailable");
    }

    var isUUID = this.getGlobal("isUUIDSession");
    if (typeof isUUID === "function" && !isUUID(session)) {
      var ensureV5 = this.getGlobal("ensureSessionIsV5");
      if (typeof ensureV5 === "function") {
        ensureV5(sessionDoc);
      }
    }

    var getSessionId = this.getGlobal("get_current_session_id");
    var getSessionIndex = this.getGlobal("get_current_session_index");
    return {
      session: session,
      sessionDoc: sessionDoc,
      sessionId: typeof getSessionId === "function" ? getSessionId() : session.get("id"),
      sessionIndex: typeof getSessionIndex === "function" ? getSessionIndex() : null
    };
  },

  getSessions: function() {
    var getAll = this.getGlobal("getAllSessions");
    var sessions = typeof getAll === "function" ? getAll() : [];
    var currentId = this.callGlobal("get_current_session_id") || null;
    var currentIndex = this.callGlobal("get_current_session_index") || null;
    return {
      sessions: sessions.map(function(session) {
        return {
          id: session.id,
          index: session.index,
          name: session.name,
          current: session.id === currentId
        };
      }),
      currentSessionId: currentId,
      currentSessionIndex: currentIndex
    };
  },

  resolveSessionId: function(payload, options) {
    options = options || {};
    payload = payload || {};
    var id = payload.sessionId || payload.id;
    if (id) {
      return String(id);
    }
    var index = this.getNumber(payload, ["sessionIndex", "index", "number"], { integer: true, min: 1 });
    if (index !== undefined) {
      var sessions = this.getSessions().sessions;
      for (var i = 0; i < sessions.length; i++) {
        if (sessions[i].index === index) {
          return sessions[i].id;
        }
      }
      throw this.error("not_found", "Session not found");
    }
    if (options.allowCurrent) {
      return this.callGlobal("get_current_session_id");
    }
    throw this.error("missing_parameter", "sessionId is required");
  },

  resolveQuestion: function(payload, context, options) {
    options = options || {};
    payload = payload || {};
    var questions = this.requireFunction("getOrderedQuestions")(context.session);
    var questionId = payload.questionId || payload.id;
    var index = null;

    if (questionId) {
      var getIndex = this.getGlobal("getDisplayIndexByQuestionId");
      index = typeof getIndex === "function" ? getIndex(context.session, String(questionId)) : 0;
    } else {
      index = this.getNumber(payload, ["questionNumber", "number", "questionIndex", "index"], { integer: true, min: 1 });
    }

    if (index === undefined || index === null) {
      index = options.defaultToCurrent === false ? null : current_question_index;
    }
    if (!index || index < 1 || index > questions.length) {
      throw this.error("not_found", "Question not found");
    }

    return {
      id: questions[index - 1].id,
      index: index,
      item: questions[index - 1]
    };
  },

  resolveTeam: function(payload, context) {
    payload = payload || {};
    var teams = this.requireFunction("getOrderedTeams")(context.session);
    var teamId = payload.teamId || payload.id;
    var index = null;

    if (teamId) {
      var getIndex = this.getGlobal("getDisplayIndexByTeamId");
      index = typeof getIndex === "function" ? getIndex(context.session, String(teamId)) : 0;
    } else {
      index = this.getNumber(payload, ["teamNumber", "teamIndex", "index", "number"], { integer: true, min: 1, required: true });
    }

    if (!index || index < 1 || index > teams.length) {
      throw this.error("not_found", "Team not found");
    }

    return {
      id: teams[index - 1].id,
      index: index,
      item: teams[index - 1]
    };
  },

  resolveBlock: function(payload, context, options) {
    options = options || {};
    payload = payload || {};
    var blocks = this.requireFunction("getOrderedBlocks")(context.session);
    var blockId = payload.blockId || payload.id;
    var index = null;

    if (blockId) {
      var getIndex = this.getGlobal("getDisplayIndexByBlockId");
      index = typeof getIndex === "function" ? getIndex(context.session, String(blockId)) : -1;
    } else {
      index = this.getNumber(payload, ["blockIndex", "index"], { integer: true, min: 0 });
      if (index === undefined) {
        var number = this.getNumber(payload, ["blockNumber", "number"], { integer: true, min: 1 });
        if (number !== undefined) {
          index = number - 1;
        }
      }
    }

    if ((index === undefined || index === null) && options.defaultToFirst) {
      index = 0;
    }
    if (index === undefined || index === null || index < 0 || index >= blocks.length) {
      throw this.error("not_found", "Block not found");
    }

    return {
      id: blocks[index].id,
      index: index,
      item: blocks[index]
    };
  },

  setCurrentQuestionIndex: function(context, index) {
    if (context && context.sessionDoc && typeof context.sessionDoc.transact === "function") {
      context.sessionDoc.transact(function() {
        current_question_index = index;
      }, "local");
    } else {
      current_question_index = index;
    }
  },

  refreshDisplay: function() {
    var syncDisplay = this.getGlobal("sync_data_to_display");
    if (typeof syncDisplay === "function") {
      syncDisplay();
    }
  },

  emit: function(eventType, data) {
    if (typeof EmbeddingEvents !== "undefined" && EmbeddingEvents && typeof EmbeddingEvents.markCommandMutation === "function") {
      EmbeddingEvents.markCommandMutation();
    }
    if (typeof EmbeddingAPI !== "undefined" && EmbeddingAPI && typeof EmbeddingAPI.emit === "function") {
      return EmbeddingAPI.emit(eventType, data || {});
    }
    return 0;
  },

  emitStateChanged: function(extra) {
    if (typeof EmbeddingEvents !== "undefined" && EmbeddingEvents && typeof EmbeddingEvents.markCommandMutation === "function") {
      EmbeddingEvents.markCommandMutation();
    }
    var state = this.serializeActiveState();
    if (extra) {
      Object.keys(extra).forEach(function(key) {
        state[key] = extra[key];
      });
    }
    this.emit("session:stateChanged", state);
    return state;
  },

  serializeActiveState: function() {
    var current = this.serializeCurrentQuestion();
    var sessions = this.getSessions();
    return {
      sessionId: sessions.currentSessionId,
      sessionIndex: sessions.currentSessionIndex,
      currentQuestion: current,
      sessions: sessions.sessions
    };
  },

  serializeTeam: function(team, index) {
    if (!team) {
      return null;
    }
    var data = team.data || team;
    return {
      id: team.id || data.get("id"),
      index: index,
      name: data.get("name") || "",
      deleted: data.get("deleted") === true
    };
  },

  serializeBlock: function(block, index) {
    if (!block) {
      return null;
    }
    var data = block.data || block;
    return {
      id: block.id || data.get("id"),
      index: index,
      number: index + 1,
      name: data.get("name") || "",
      isDefault: data.get("isDefault") === true,
      deleted: data.get("deleted") === true
    };
  },

  serializeQuestion: function(question, index, session) {
    if (!question) {
      return null;
    }
    var data = question.data || question;
    var blockId = data.get("blockId") || null;
    var blockIndex = null;
    var getBlockIndex = this.getGlobal("getDisplayIndexByBlockId");
    if (typeof getBlockIndex === "function" && session && blockId) {
      blockIndex = getBlockIndex(session, blockId);
    }
    return {
      id: question.id || data.get("id"),
      index: index,
      number: index,
      name: data.get("name") || "",
      maxPoints: Number(data.get("score") || 0),
      blockId: blockId,
      blockIndex: blockIndex,
      ignore: data.get("ignore") === true,
      timerAdjustmentSeconds: Number(data.get("timerAdjustmentSeconds") || 0)
    };
  },

  serializeCurrentQuestion: function() {
    var context = this.getActiveContext({ allowMissing: true });
    if (!context) {
      return null;
    }
    var questions = this.requireFunction("getOrderedQuestions")(context.session);
    if (current_question_index < 1 || current_question_index > questions.length) {
      return null;
    }
    return this.serializeQuestion(questions[current_question_index - 1], current_question_index, context.session);
  },

  serializeScore: function(context, questionRef, teamRef) {
    var getScore = this.requireFunction("getTeamScore");
    var score = getScore(context.session, questionRef.id, teamRef.id) || { score: 0, extraCredit: 0 };
    return {
      questionId: questionRef.id,
      questionIndex: questionRef.index,
      teamId: teamRef.id,
      teamIndex: teamRef.index,
      score: Number(score.score || 0),
      extraCredit: Number(score.extraCredit || 0),
      total: Number(score.score || 0) + Number(score.extraCredit || 0)
    };
  },

  serializeTimerState: function() {
    var context = this.getActiveContext({ allowMissing: true });
    var session = context ? context.session : null;
    var config = session ? session.get("config") : null;
    var sessionId = context ? context.sessionId : null;
    var enabled = true;
    var autoStart = false;

    var getEnabled = this.getGlobal("get_local_timer_enabled");
    var getAutoStart = this.getGlobal("get_local_timer_auto_start");
    if (typeof getEnabled === "function") {
      enabled = getEnabled(sessionId);
    }
    if (typeof getAutoStart === "function") {
      autoStart = getAutoStart(sessionId);
    }

    return {
      enabled: enabled,
      autoStart: autoStart,
      firstPointSeconds: config ? Number(config.get("timerFirstPointSeconds") || 0) : null,
      subsequentPointSeconds: config ? Number(config.get("timerSubsequentPointSeconds") || 0) : null,
      warningFlashSeconds: config ? Number(config.get("timerWarningFlashSeconds") || 0) : null,
      running: question_timer_running === true,
      remainingSeconds: Number(question_timer_remaining_seconds || 0),
      durationSeconds: Number(question_timer_duration_seconds || 0),
      questionId: question_timer_question_id || null,
      expired: question_timer_expired === true
    };
  },

  serializeSyncState: function() {
    var getState = this.getGlobal("getSyncState");
    var getRoomCode = this.getGlobal("getSyncRoomCode");
    var getName = this.getGlobal("getSyncDisplayName");
    var getPeers = this.getGlobal("getSyncPeers");
    return {
      state: typeof getState === "function" ? getState() : "offline",
      roomCode: typeof getRoomCode === "function" ? getRoomCode() : null,
      displayName: typeof getName === "function" ? getName() : null,
      peers: typeof getPeers === "function" ? getPeers() : []
    };
  },

  bytesToBase64: function(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === "function") {
      return btoa(binary);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(binary, "binary").toString("base64");
    }
    return null;
  },

  base64ToBytes: function(base64) {
    var binary;
    if (typeof atob === "function") {
      binary = atob(base64);
    } else if (typeof Buffer !== "undefined") {
      binary = Buffer.from(base64, "base64").toString("binary");
    } else {
      throw this.error("feature_unavailable", "Base64 decoding is unavailable");
    }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  normalizeImportData: function(payload) {
    payload = payload || {};
    var data = payload.data || payload.binary || payload.bytes || payload.update || null;
    if (data instanceof Uint8Array) {
      return data;
    }
    if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (Array.isArray(data)) {
      return new Uint8Array(data);
    }
    if (payload.base64) {
      return this.base64ToBytes(String(payload.base64));
    }
    if (typeof data === "string") {
      return data;
    }
    if (data && typeof data === "object") {
      return data;
    }
    throw this.error("missing_parameter", "Import data is required");
  },

  createFallbackSession: async function(name) {
    var currentContext = this.getActiveContext({ allowMissing: true });
    var generateSessionId = this.requireFunction("generateSessionId");
    var initSessionDoc = this.requireFunction("initSessionDoc");
    var createNewSessionV4 = this.requireFunction("createNewSessionV4");
    var getGlobalDoc = this.requireFunction("getGlobalDoc");
    var sessionId = generateSessionId();
    var sessionDoc = await initSessionDoc(sessionId);
    var currentConfig = currentContext && currentContext.session ? currentContext.session.get("config") : null;
    var teams = currentContext && currentContext.session ? this.requireFunction("getOrderedTeams")(currentContext.session) : [];
    var blocks = currentContext && currentContext.session ? this.requireFunction("getOrderedBlocks")(currentContext.session) : [];
    var sessionName = name || (typeof t === "function" ? t("defaults.session_name") : "New Session");

    createNewSessionV4(sessionDoc, {
      id: sessionId,
      name: sessionName,
      maxPointsPerQuestion: currentConfig ? currentConfig.get("maxPointsPerQuestion") : 4,
      rounding: currentConfig ? currentConfig.get("rounding") === true : false,
      timerFirstPointSeconds: currentConfig ? currentConfig.get("timerFirstPointSeconds") : TIMER_DEFAULT_FIRST_POINT_SECONDS,
      timerSubsequentPointSeconds: currentConfig ? currentConfig.get("timerSubsequentPointSeconds") : TIMER_DEFAULT_SUBSEQUENT_POINT_SECONDS,
      timerWarningFlashSeconds: currentConfig ? currentConfig.get("timerWarningFlashSeconds") : TIMER_DEFAULT_WARNING_FLASH_SECONDS,
      teamNames: teams.length ? teams.map(function(team) { return team.data.get("name"); }) : undefined,
      blockNames: blocks.length ? blocks.map(function(block) { return block.data.get("name"); }) : undefined
    });

    var globalDoc = getGlobalDoc();
    var meta = globalDoc.getMap("meta");
    var sessionOrder = meta.get("sessionOrder") || [];
    globalDoc.transact(function() {
      var nextOrder = sessionOrder.slice();
      nextOrder.push(sessionId);
      meta.set("sessionOrder", nextOrder);
      meta.set("currentSession", sessionId);

      var sessionNames = meta.get("sessionNames");
      if (!sessionNames) {
        sessionNames = new Y.Map();
        meta.set("sessionNames", sessionNames);
      }
      sessionNames.set(sessionId, sessionName);
    }, "local");

    if (typeof DocManager !== "undefined" && DocManager && typeof DocManager.setActiveSession === "function") {
      DocManager.setActiveSession(sessionId);
    }
    current_question_index = 1;
    return sessionId;
  },

  sessionList: function() {
    return this.getSessions();
  },

  sessionGetCurrent: function() {
    var sessions = this.getSessions();
    var current = null;
    for (var i = 0; i < sessions.sessions.length; i++) {
      if (sessions.sessions[i].id === sessions.currentSessionId) {
        current = sessions.sessions[i];
        break;
      }
    }
    return {
      session: current,
      currentQuestion: this.serializeCurrentQuestion()
    };
  },

  sessionCreate: async function(payload) {
    var name = this.getString(payload, ["name"], { allowEmpty: false });
    var sessionId = await this.createFallbackSession(name);
    this.refreshDisplay();
    var result = this.sessionGetCurrent();
    this.emit("session:created", result.session);
    this.emit("session:switched", result.session);
    this.emitStateChanged({ reason: "session:create" });
    return result;
  },

  sessionSwitch: async function(payload) {
    var sessionId = this.resolveSessionId(payload);
    var switchSession = this.requireFunction("switchSession");
    var switched = await switchSession(sessionId);
    if (!switched) {
      throw this.error("command_failed", "Session switch failed");
    }
    this.refreshDisplay();
    var result = this.sessionGetCurrent();
    this.emit("session:switched", result.session);
    this.emitStateChanged({ reason: "session:switch" });
    return result;
  },

  sessionRename: async function(payload) {
    var sessionId = this.resolveSessionId(payload, { allowCurrent: true });
    var name = this.getString(payload, ["name"], { required: true, allowEmpty: false });
    this.requireFunction("renameSession")(sessionId, name);
    this.refreshDisplay();
    var result = this.getSessions();
    this.emit("session:renamed", { sessionId: sessionId, name: name });
    this.emitStateChanged({ reason: "session:rename" });
    return result;
  },

  sessionDelete: async function(payload) {
    var sessionId = this.resolveSessionId(payload);
    var deleteSession = this.requireFunction("deleteSession");
    var deleted = await deleteSession(sessionId, true);
    if (!deleted) {
      throw this.error("command_failed", "Session delete failed");
    }
    this.refreshDisplay();
    var result = this.getSessions();
    this.emit("session:deleted", { sessionId: sessionId });
    this.emitStateChanged({ reason: "session:delete" });
    return result;
  },

  sessionReorder: function(payload) {
    payload = payload || {};
    var order = payload.order || payload.sessionIds;
    if (!Array.isArray(order) || order.length === 0) {
      throw this.error("missing_parameter", "order is required");
    }
    this.requireFunction("reorderSessions")(order);
    this.refreshDisplay();
    var result = this.getSessions();
    this.emitStateChanged({ reason: "session:reorder" });
    return result;
  },

  sessionExport: function(payload) {
    payload = payload || {};
    var sessionId = this.resolveSessionId(payload, { allowCurrent: true });
    var sessionDoc = this.requireFunction("getSessionDoc")(sessionId);
    if (!sessionDoc) {
      throw this.error("not_found", "Session not found");
    }
    if (typeof Y === "undefined" || !Y || typeof Y.encodeStateAsUpdate !== "function") {
      throw this.error("feature_unavailable", "Yjs export is unavailable");
    }
    var update = Y.encodeStateAsUpdate(sessionDoc);
    return {
      sessionId: sessionId,
      format: "yjs-update",
      binary: update,
      bytes: Array.prototype.slice.call(update),
      base64: this.bytesToBase64(update),
      byteLength: update.length
    };
  },

  sessionImport: async function(payload) {
    await this.ensureFeature("importExport");
    var importSessionData = this.requireFunction("importSessionData");
    var data = this.normalizeImportData(payload);
    var result = await importSessionData(data);
    this.refreshDisplay();
    this.emit("session:created", { imported: true, result: result });
    this.emitStateChanged({ reason: "session:import" });
    return {
      import: result,
      sessions: this.getSessions().sessions
    };
  },

  questionNext: function(payload) {
    payload = payload || {};
    var context = this.getActiveContext();
    var questions = this.requireFunction("getOrderedQuestions")(context.session);
    if (current_question_index < questions.length) {
      this.setCurrentQuestionIndex(context, current_question_index + 1);
    } else {
      var createIfNeeded = this.getBoolean(payload, ["createIfNeeded", "create"], { defaultValue: true });
      if (!createIfNeeded) {
        throw this.error("out_of_range", "Already at the last question");
      }
      var createdId = this.requireFunction("createQuestion")(context.sessionDoc, context.session, {
        name: this.getString(payload, ["name"], {
          allowEmpty: true,
          defaultValue: typeof t === "function" ? t("defaults.question_name", { number: current_question_index + 1 }) : ""
        }),
        score: this.getNumber(payload, ["maxPoints", "score"], { min: 0, defaultValue: 0 }),
        blockId: payload.blockId || null
      });
      questions = this.requireFunction("getOrderedQuestions")(context.session);
      var newIndex = this.getGlobal("getDisplayIndexByQuestionId")(context.session, createdId);
      this.setCurrentQuestionIndex(context, newIndex || questions.length);
    }
    this.refreshDisplay();
    var current = this.serializeCurrentQuestion();
    this.emit("question:changed", current);
    this.emitStateChanged({ reason: "question:next" });
    return current;
  },

  questionPrevious: function() {
    var context = this.getActiveContext();
    if (current_question_index <= 1) {
      throw this.error("out_of_range", "Already at the first question");
    }
    this.setCurrentQuestionIndex(context, current_question_index - 1);
    this.refreshDisplay();
    var current = this.serializeCurrentQuestion();
    this.emit("question:changed", current);
    this.emitStateChanged({ reason: "question:previous" });
    return current;
  },

  questionGoto: function(payload) {
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context, { defaultToCurrent: false });
    this.setCurrentQuestionIndex(context, question.index);
    this.refreshDisplay();
    var current = this.serializeCurrentQuestion();
    this.emit("question:changed", current);
    this.emitStateChanged({ reason: "question:goto" });
    return current;
  },

  questionCreate: function(payload) {
    payload = payload || {};
    var context = this.getActiveContext();
    var blockId = payload.blockId || null;
    if (!blockId && (payload.blockIndex !== undefined || payload.blockNumber !== undefined)) {
      blockId = this.resolveBlock(payload, context).id;
    }
    var questionId = this.requireFunction("createQuestion")(context.sessionDoc, context.session, {
      name: this.getString(payload, ["name"], { allowEmpty: true, defaultValue: "" }),
      score: this.getNumber(payload, ["maxPoints", "score"], { min: 0, defaultValue: 0 }),
      blockId: blockId
    });
    var questionIndex = this.getGlobal("getDisplayIndexByQuestionId")(context.session, questionId);
    if (payload.activate !== false) {
      this.setCurrentQuestionIndex(context, questionIndex);
    }
    this.refreshDisplay();
    var result = this.resolveQuestion({ questionId: questionId }, context);
    var serialized = this.serializeQuestion(result.item, result.index, context.session);
    this.emit("question:changed", serialized);
    this.emitStateChanged({ reason: "question:create" });
    return serialized;
  },

  questionRename: function(payload) {
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context);
    var name = this.getString(payload, ["name"], { required: true, allowEmpty: true, trim: false });
    context.sessionDoc.transact(function() {
      question.item.data.set("name", name);
    }, "local");
    this.refreshDisplay();
    var serialized = this.serializeQuestion(question.item, question.index, context.session);
    this.emit("question:changed", serialized);
    this.emitStateChanged({ reason: "question:rename" });
    return serialized;
  },

  questionSetMaxPoints: function(payload) {
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context);
    var maxPoints = this.getNumber(payload, ["maxPoints", "points", "score"], { required: true, min: 0 });
    var teams = this.requireFunction("getOrderedTeams")(context.session);
    var getTeamScore = this.requireFunction("getTeamScore");
    var highestScore = 0;
    for (var i = 0; i < teams.length; i++) {
      var score = getTeamScore(context.session, question.id, teams[i].id);
      highestScore = Math.max(highestScore, score ? Number(score.score || 0) : 0);
    }
    if (maxPoints < highestScore) {
      throw this.error("invalid_parameter", "maxPoints cannot be lower than an existing team score");
    }
    var updated = this.requireFunction("updateQuestionScore")(context.sessionDoc, context.session, question.id, maxPoints);
    if (!updated) {
      throw this.error("command_failed", "Question update failed");
    }
    this.refreshDisplay();
    var serialized = this.serializeQuestion(question.item, question.index, context.session);
    this.emit("question:changed", serialized);
    this.emitStateChanged({ reason: "question:setMaxPoints" });
    return serialized;
  },

  questionSetBlock: function(payload) {
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context);
    var block = this.resolveBlock(payload, context);
    var updated = this.requireFunction("updateQuestionBlock")(context.sessionDoc, context.session, question.id, block.id);
    if (!updated) {
      throw this.error("command_failed", "Question block update failed");
    }
    this.refreshDisplay();
    var serialized = this.serializeQuestion(question.item, question.index, context.session);
    this.emit("question:block-changed", { question: serialized, block: this.serializeBlock(block.item, block.index) });
    this.emitStateChanged({ reason: "question:setBlock" });
    return serialized;
  },

  questionIgnore: function(payload) {
    payload = payload || {};
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context);
    var nextValue = payload.ignore === undefined ? !(question.item.data.get("ignore") === true) : this.getBoolean(payload, ["ignore"], { required: true });
    var updated = this.requireFunction("updateQuestionIgnore")(context.sessionDoc, context.session, question.id, nextValue);
    if (!updated) {
      throw this.error("command_failed", "Question ignore update failed");
    }
    this.refreshDisplay();
    var serialized = this.serializeQuestion(question.item, question.index, context.session);
    this.emit("question:ignored", serialized);
    this.emitStateChanged({ reason: "question:ignore" });
    return serialized;
  },

  questionDelete: function(payload) {
    payload = payload || {};
    payload.ignore = true;
    var result = this.questionIgnore(payload);
    result.deleted = false;
    result.deleteMode = "ignored";
    return result;
  },

  scoreSet: function(payload) {
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context);
    var team = this.resolveTeam(payload, context);
    var score = this.getNumber(payload, ["score", "points", "value"], { required: true, min: 0 });
    var maxPoints = Number(question.item.data.get("score") || 0);
    if (score > maxPoints) {
      throw this.error("invalid_parameter", "score cannot exceed maxPoints");
    }
    var updated = this.requireFunction("setTeamScore")(context.sessionDoc, context.session, question.id, team.id, score);
    if (!updated) {
      throw this.error("command_failed", "Score update failed");
    }
    this.refreshDisplay();
    var serialized = this.serializeScore(context, question, team);
    this.emit("question:scored", serialized);
    this.emitStateChanged({ reason: "score:set" });
    return serialized;
  },

  scoreSetExtraCredit: function(payload) {
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context);
    var team = this.resolveTeam(payload, context);
    var extraCredit = this.getNumber(payload, ["extraCredit", "points", "value"], { required: true, min: 0 });
    var updated = this.requireFunction("setTeamExtraCredit")(context.sessionDoc, context.session, question.id, team.id, extraCredit);
    if (!updated) {
      throw this.error("command_failed", "Extra credit update failed");
    }
    this.refreshDisplay();
    var serialized = this.serializeScore(context, question, team);
    this.emit("question:scored", serialized);
    this.emitStateChanged({ reason: "score:setExtraCredit" });
    return serialized;
  },

  scoreGetMaxPoints: function(payload) {
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context);
    return {
      questionId: question.id,
      questionIndex: question.index,
      maxPoints: Number(question.item.data.get("score") || 0)
    };
  },

  scoreGetTotalPoints: function(payload) {
    var context = this.getActiveContext();
    var question = this.resolveQuestion(payload, context);
    var teams = this.requireFunction("getOrderedTeams")(context.session);
    var getTeamScore = this.requireFunction("getTeamScore");
    var teamTotals = [];
    var scoreTotal = 0;
    var extraCreditTotal = 0;

    for (var i = 0; i < teams.length; i++) {
      var team = teams[i];
      var score = getTeamScore(context.session, question.id, team.id) || { score: 0, extraCredit: 0 };
      var entry = {
        teamId: team.id,
        teamIndex: i + 1,
        teamName: team.data.get("name") || "",
        score: Number(score.score || 0),
        extraCredit: Number(score.extraCredit || 0),
        total: Number(score.score || 0) + Number(score.extraCredit || 0)
      };
      scoreTotal += entry.score;
      extraCreditTotal += entry.extraCredit;
      teamTotals.push(entry);
    }

    return {
      questionId: question.id,
      questionIndex: question.index,
      maxPoints: Number(question.item.data.get("score") || 0),
      scoreTotal: scoreTotal,
      extraCreditTotal: extraCreditTotal,
      total: scoreTotal + extraCreditTotal,
      teams: teamTotals
    };
  },

  blockList: function() {
    var context = this.getActiveContext();
    var blocks = this.requireFunction("getOrderedBlocks")(context.session);
    var self = this;
    return {
      blocks: blocks.map(function(block, index) {
        return self.serializeBlock(block, index);
      })
    };
  },

  blockCreate: function(payload) {
    var context = this.getActiveContext();
    var blocks = this.requireFunction("getOrderedBlocks")(context.session);
    var name = this.getString(payload, ["name"], {
      defaultValue: typeof t === "function" ? t("defaults.block_name", { number: blocks.length }) : "Block"
    });
    var blockId = this.requireFunction("createBlock")(context.sessionDoc, context.session, name, false);
    this.refreshDisplay();
    var block = this.resolveBlock({ blockId: blockId }, context);
    var serialized = this.serializeBlock(block.item, block.index);
    this.emitStateChanged({ reason: "block:create" });
    return serialized;
  },

  blockRename: function(payload) {
    var context = this.getActiveContext();
    var block = this.resolveBlock(payload, context);
    var name = this.getString(payload, ["name"], { required: true, allowEmpty: false });
    var updated = this.requireFunction("updateBlockName")(context.sessionDoc, context.session, block.id, name);
    if (!updated) {
      throw this.error("command_failed", "Block rename failed");
    }
    this.refreshDisplay();
    var serialized = this.serializeBlock(block.item, block.index);
    this.emitStateChanged({ reason: "block:rename" });
    return serialized;
  },

  blockSetDefault: function(payload) {
    var context = this.getActiveContext();
    var block = this.resolveBlock(payload, context);
    var blocks = this.requireFunction("getOrderedBlocks")(context.session);
    context.sessionDoc.transact(function() {
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].data.set("isDefault", blocks[i].id === block.id);
      }
    }, "local");
    this.refreshDisplay();
    var serialized = this.serializeBlock(block.item, block.index);
    this.emitStateChanged({ reason: "block:setDefault" });
    return serialized;
  },

  blockDelete: function(payload) {
    var context = this.getActiveContext();
    var block = this.resolveBlock(payload, context);
    var deleted = this.requireFunction("softDeleteBlock")(context.sessionDoc, context.session, block.id);
    if (!deleted) {
      throw this.error("command_failed", "Block delete failed");
    }
    this.refreshDisplay();
    this.emitStateChanged({ reason: "block:delete" });
    return this.blockList();
  },

  timerEnable: function() {
    var context = this.getActiveContext();
    this.requireFunction("set_local_timer_enabled")(context.sessionId, true);
    this.refreshDisplay();
    var state = this.serializeTimerState();
    this.emitStateChanged({ reason: "timer:enable" });
    return state;
  },

  timerDisable: function() {
    var context = this.getActiveContext();
    this.requireFunction("set_local_timer_enabled")(context.sessionId, false);
    var stopTimer = this.getGlobal("stop_question_timer_from_user");
    if (typeof stopTimer === "function") {
      stopTimer();
    }
    this.refreshDisplay();
    var state = this.serializeTimerState();
    this.emitStateChanged({ reason: "timer:disable" });
    return state;
  },

  timerSetDuration: function(payload) {
    payload = payload || {};
    var context = this.getActiveContext();
    var config = context.session.get("config");
    if (!config) {
      throw this.error("state_unavailable", "Timer configuration is unavailable");
    }

    var totalSeconds = this.getNumber(payload, ["totalSeconds", "durationSeconds"], { integer: true, min: 0 });
    if (totalSeconds === undefined) {
      var minutes = this.getNumber(payload, ["minutes"], { integer: true, min: 0, defaultValue: 0 });
      var seconds = this.getNumber(payload, ["seconds"], { integer: true, min: 0, max: 59, defaultValue: 0 });
      if (payload.minutes !== undefined || payload.seconds !== undefined) {
        totalSeconds = (minutes * 60) + seconds;
      }
    }
    var firstPointSeconds = this.getNumber(payload, ["firstPointSeconds"], { integer: true, min: 0 });
    var subsequentPointSeconds = this.getNumber(payload, ["subsequentPointSeconds"], { integer: true, min: 0 });
    var warningFlashSeconds = this.getNumber(payload, ["warningFlashSeconds"], { integer: true, min: 0 });

    if (firstPointSeconds === undefined && totalSeconds === undefined && subsequentPointSeconds === undefined && warningFlashSeconds === undefined) {
      throw this.error("missing_parameter", "Timer duration is required");
    }

    context.sessionDoc.transact(function() {
      if (firstPointSeconds !== undefined) {
        config.set("timerFirstPointSeconds", firstPointSeconds);
      } else if (totalSeconds !== undefined) {
        config.set("timerFirstPointSeconds", totalSeconds);
        if (subsequentPointSeconds === undefined) {
          config.set("timerSubsequentPointSeconds", 0);
        }
      }
      if (subsequentPointSeconds !== undefined) {
        config.set("timerSubsequentPointSeconds", subsequentPointSeconds);
      }
      if (warningFlashSeconds !== undefined) {
        config.set("timerWarningFlashSeconds", warningFlashSeconds);
      }
    }, "local");

    this.refreshDisplay();
    var state = this.serializeTimerState();
    this.emitStateChanged({ reason: "timer:setDuration" });
    return state;
  },

  timerSetAutoStart: function(payload) {
    var context = this.getActiveContext();
    var autoStart = this.getBoolean(payload, ["autoStart", "enabled"], { required: true });
    this.requireFunction("set_local_timer_auto_start")(context.sessionId, autoStart);
    this.refreshDisplay();
    var state = this.serializeTimerState();
    this.emitStateChanged({ reason: "timer:setAutoStart" });
    return state;
  },

  timerPlay: function() {
    var context = this.getActiveContext();
    this.requireFunction("set_local_timer_enabled")(context.sessionId, true);
    var question = this.resolveQuestion({}, context);
    this.requireFunction("start_question_timer_from_question_points")(question.item.data.get("score") || 0, true);
    var state = this.serializeTimerState();
    this.emitStateChanged({ reason: "timer:play" });
    return state;
  },

  timerPause: function() {
    var toggle = this.requireFunction("toggle_question_timer_play_pause");
    if (question_timer_running) {
      toggle();
    }
    var state = this.serializeTimerState();
    this.emitStateChanged({ reason: "timer:pause" });
    return state;
  },

  timerRestart: function(payload) {
    payload = payload || {};
    var context = this.getActiveContext();
    this.requireFunction("set_local_timer_enabled")(context.sessionId, true);
    this.requireFunction("restart_question_timer_from_current_question")();
    if (payload.play !== false && !question_timer_running && question_timer_duration_seconds > 0) {
      this.requireFunction("toggle_question_timer_play_pause")();
    }
    var state = this.serializeTimerState();
    this.emitStateChanged({ reason: "timer:restart" });
    return state;
  },

  syncConnect: async function(payload) {
    await this.ensureFeature("sync");
    payload = payload || {};
    var displayName = this.getString(payload, ["displayName", "name"], { required: true, maxLength: 40 });
    var roomCode = this.getString(payload, ["roomCode", "code"], { allowEmpty: true });
    var password = this.getString(payload, ["password"], { allowEmpty: true });
    var joinChoice = this.getString(payload, ["joinChoice", "mode"], { defaultValue: roomCode ? "join" : "create" });
    var code = await this.requireFunction("startSync")(displayName, roomCode || null, password || null, joinChoice, payload.options || {});
    var state = this.serializeSyncState();
    state.roomCode = code || state.roomCode;
    this.emit("sync:stateChanged", state);
    return state;
  },

  syncJoinRoom: async function(payload) {
    payload = payload || {};
    payload.joinChoice = payload.joinChoice || "join";
    if (!payload.roomCode && !payload.code) {
      throw this.error("missing_parameter", "roomCode is required");
    }
    return this.syncConnect(payload);
  },

  syncCreateRoom: async function(payload) {
    payload = payload || {};
    payload.roomCode = null;
    payload.joinChoice = "create";
    return this.syncConnect(payload);
  },

  syncDisconnect: async function(payload) {
    await this.ensureFeature("sync");
    payload = payload || {};
    this.requireFunction("stopSync")(payload.clearSessionRoom !== false);
    var state = this.serializeSyncState();
    this.emit("sync:stateChanged", state);
    return state;
  },

  syncGetState: async function() {
    await this.ensureFeature("sync");
    return this.serializeSyncState();
  },

  syncGetRoomCode: async function() {
    await this.ensureFeature("sync");
    return { roomCode: this.serializeSyncState().roomCode };
  },

  syncGetPeers: async function() {
    await this.ensureFeature("sync");
    return { peers: this.serializeSyncState().peers };
  },

  syncSetPassword: async function(payload) {
    await this.ensureFeature("sync");
    var password = this.getString(payload, ["password"], { allowEmpty: true, defaultValue: null });
    if (typeof SyncManager !== "undefined" && SyncManager) {
      SyncManager.password = password || null;
      SyncManager.effectivePassword = password || null;
      SyncManager.hasCustomPassword = !!password;
    }
    var saveEffectivePassword = this.getGlobal("saveEffectivePassword");
    if (typeof saveEffectivePassword === "function") {
      saveEffectivePassword(password || null, !!password);
    }
    return this.serializeSyncState();
  },

  syncSetDisplayName: async function(payload) {
    await this.ensureFeature("sync");
    var displayName = this.getString(payload, ["displayName", "name"], { required: true, maxLength: 40 });
    var changed = false;
    var changeDisplayName = this.getGlobal("changeDisplayName");
    if (typeof changeDisplayName === "function") {
      changed = changeDisplayName(displayName);
    } else if (typeof SyncManager !== "undefined" && SyncManager) {
      SyncManager.displayName = displayName;
      changed = true;
    }
    if (!changed) {
      throw this.error("command_failed", "Display name update failed");
    }
    var state = this.serializeSyncState();
    this.emit("sync:stateChanged", state);
    return state;
  },

  uiSetTheme: function(payload) {
    var theme = this.getString(payload, ["theme", "preference"], { required: true });
    if (theme !== "light" && theme !== "dark" && theme !== "system") {
      throw this.error("invalid_parameter", "theme must be light, dark, or system");
    }
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem("theme_preference", theme);
    }
    var setGlobal = this.getGlobal("set_global_theme_preference");
    if (typeof setGlobal === "function") {
      setGlobal(theme);
    }
    this.requireFunction("apply_theme_preference")(theme);
    var result = {
      theme: theme,
      resolvedTheme: this.getGlobal("resolve_theme") ? this.requireFunction("resolve_theme")(theme) : theme
    };
    this.emit("ui:themeChanged", result);
    return result;
  },

  uiSetLanguage: function(payload) {
    var language = this.getString(payload, ["language", "code"], { required: true });
    var available = language === "auto" || this.callGlobal("is_language_available", [language]) === true;
    if (!available) {
      throw this.error("invalid_parameter", "language is unavailable");
    }
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem("language_preference", language);
    }
    var setGlobal = this.getGlobal("set_global_language_preference");
    if (typeof setGlobal === "function") {
      setGlobal(language);
    }
    this.requireFunction("apply_language_preference")(language);
    var result = {
      language: this.callGlobal("get_current_language") || language,
      preference: language,
      availableLanguages: this.callGlobal("get_available_languages") || {}
    };
    this.emit("ui:languageChanged", result);
    return result;
  },

  uiShow: function() {
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.setAttribute("data-embedding-visibility", "visible");
    }
    if (typeof document !== "undefined" && document.body && document.body.classList) {
      document.body.classList.remove("pbe-embedding-hidden");
    }
    return { visible: true };
  },

  uiHide: function() {
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.setAttribute("data-embedding-visibility", "hidden");
    }
    if (typeof document !== "undefined" && document.body && document.body.classList) {
      document.body.classList.add("pbe-embedding-hidden");
    }
    return { visible: false };
  },

  uiFocus: function() {
    if (typeof window !== "undefined" && typeof window.focus === "function") {
      window.focus();
    }
    if (typeof document !== "undefined" && document.body && typeof document.body.focus === "function") {
      document.body.focus();
    }
    return { focused: true };
  }
};

if (typeof EmbeddingAPI !== "undefined" && EmbeddingAPI) {
  EmbeddingCommands.init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = EmbeddingCommands;
}
