/**
 * Core embedding API for iframe host integrations.
 *
 * This file owns the postMessage transport, origin validation, embedded-mode
 * detection, command dispatch, and event subscription infrastructure. Concrete
 * app commands live in app-embedding-commands.js as Phase 2 expands.
 */

var EmbeddingAPI = {
  apiVersion: 1,
  initialized: false,
  embeddedModeApplied: false,
  hostOrigin: null,
  hostSource: null,
  commandHandlers: {},
  clients: [],
  eventSubscribers: {},
  rateLimitBuckets: {},
  messageTypes: {
    ready: "embedding:ready",
    hello: "embedding:hello",
    command: "embedding:command",
    response: "embedding:response",
    subscribe: "embedding:subscribe",
    unsubscribe: "embedding:unsubscribe",
    event: "embedding:event"
  },

  getConfig: function() {
    if (typeof EMBEDDING_CONFIG === "undefined" || !EMBEDDING_CONFIG) {
      EMBEDDING_CONFIG = {};
    }
    if (!EMBEDDING_CONFIG.apiVersion) {
      EMBEDDING_CONFIG.apiVersion = this.apiVersion;
    }
    if (!EMBEDDING_CONFIG.allowedOrigins) {
      EMBEDDING_CONFIG.allowedOrigins = ["*"];
    }
    if (!EMBEDDING_CONFIG.allowedHosts) {
      EMBEDDING_CONFIG.allowedHosts = [];
    }
    if (EMBEDDING_CONFIG.hostOrigin) {
      EMBEDDING_CONFIG.hostOrigin = this.normalizeOrigin(EMBEDDING_CONFIG.hostOrigin);
    }
    EMBEDDING_CONFIG.allowedOrigins = this.normalizeAllowedOrigins(EMBEDDING_CONFIG.allowedOrigins);
    EMBEDDING_CONFIG.allowedHosts = this.normalizeAllowedHosts(EMBEDDING_CONFIG.allowedHosts);
    if (!EMBEDDING_CONFIG.maxPayloadBytes) {
      EMBEDDING_CONFIG.maxPayloadBytes = 524288;
    }
    if (!EMBEDDING_CONFIG.rateLimit) {
      EMBEDDING_CONFIG.rateLimit = {
        enabled: true,
        windowMs: 1000,
        maxMessages: 80,
        maxCommands: 40
      };
    }
    return EMBEDDING_CONFIG;
  },

  configure: function(options) {
    options = options || {};
    var config = this.getConfig();
    if (options.enabled !== undefined) {
      config.enabled = options.enabled === true;
    }
    if (options.hostOrigin !== undefined) {
      config.hostOrigin = this.normalizeOrigin(options.hostOrigin);
      this.hostOrigin = config.hostOrigin;
    }
    if (options.allowedOrigins !== undefined) {
      config.allowedOrigins = this.normalizeAllowedOrigins(options.allowedOrigins);
    }
    if (options.allowedHosts !== undefined) {
      config.allowedHosts = this.normalizeAllowedHosts(options.allowedHosts);
    }
    if (Number.isFinite(Number(options.maxPayloadBytes)) && Number(options.maxPayloadBytes) > 0) {
      config.maxPayloadBytes = Math.floor(Number(options.maxPayloadBytes));
    }
    if (options.rateLimit && typeof options.rateLimit === "object") {
      config.rateLimit = Object.assign({}, config.rateLimit || {}, options.rateLimit);
    }
    return config;
  },

  detectEmbeddedMode: function() {
    if (typeof window === "undefined" || !window.location || typeof URLSearchParams === "undefined") {
      return false;
    }

    var params = new URLSearchParams(window.location.search || "");
    var embeddedParam = String(params.get("embedded") || "").toLowerCase();
    return embeddedParam === "1" || embeddedParam === "true" || embeddedParam === "yes";
  },

  isEmbeddedFrame: function() {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.parent && window.parent !== window;
    } catch (e) {
      return true;
    }
  },

  shouldInitialize: function() {
    var config = this.getConfig();
    return !!config.enabled || this.detectEmbeddedMode();
  },

  applyEmbeddedMode: function() {
    var config = this.getConfig();
    config.enabled = true;

    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.setAttribute("data-embedded", "true");
    }
    if (typeof document !== "undefined" && document.body && document.body.classList) {
      document.body.classList.add("pbe-embedded");
    }

    this.embeddedModeApplied = true;
    return true;
  },

  init: function() {
    var config = this.getConfig();
    if (!config.enabled && !this.detectEmbeddedMode()) {
      return false;
    }

    this.applyEmbeddedMode();

    if (this.initialized) {
      this.sendReady();
      return true;
    }

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("message", this.handleMessage.bind(this));
    }

    this.initialized = true;
    this.sendReady();
    this.emit("ui:ready", this.getReadyPayload(), { includeUnsubscribed: true });
    return true;
  },

  getReadyPayload: function() {
    return {
      apiVersion: this.getConfig().apiVersion || this.apiVersion,
      embedded: true,
      appVersion: this.getAppVersion()
    };
  },

  getAppVersion: function() {
    if (typeof APP_VERSION !== "undefined") {
      return APP_VERSION;
    }
    if (typeof document !== "undefined" && document.querySelector) {
      var versionElement = document.querySelector('[data-i18n="footer.version"]');
      if (versionElement && typeof versionElement.getAttribute === "function") {
        return versionElement.getAttribute("data-i18n-version") || null;
      }
    }
    return null;
  },

  sendReady: function() {
    if (typeof window === "undefined" || !window.parent || window.parent === window) {
      return false;
    }

    try {
      window.parent.postMessage({
        type: this.messageTypes.ready,
        apiVersion: this.getConfig().apiVersion || this.apiVersion,
        appVersion: this.getAppVersion()
      }, "*");
      return true;
    } catch (e) {
      return false;
    }
  },

  handleMessage: function(event) {
    if (!event || !event.data || typeof event.data !== "object") {
      return null;
    }

    if (!this.validateOrigin(event.origin)) {
      return null;
    }

    var validationError = this.getMessageValidationError(event);
    if (validationError) {
      this.sendError(event, event.data.id || null, event.data.command || event.data.type || "embedding:message", validationError);
      return true;
    }

    this.rememberClient(event.source, event.origin);

    var data = event.data;
    if (data.type === this.messageTypes.hello) {
      this.sendResponse(event, data.id || null, data.command || "embedding:hello", this.getReadyPayload());
      return true;
    }

    if (data.type === this.messageTypes.command) {
      return this.handleCommandMessage(event);
    }

    if (data.type === this.messageTypes.subscribe) {
      this.subscribe(event.source, event.origin, data.events || data.event);
      this.sendResponse(event, data.id || null, "embedding:subscribe", {
        subscribed: this.getClientSubscriptions(event.source, event.origin)
      });
      return true;
    }

    if (data.type === this.messageTypes.unsubscribe) {
      this.unsubscribe(event.source, event.origin, data.events || data.event);
      this.sendResponse(event, data.id || null, "embedding:unsubscribe", {
        subscribed: this.getClientSubscriptions(event.source, event.origin)
      });
      return true;
    }

    return null;
  },

  handleCommandMessage: function(event) {
    var data = event.data || {};
    var id = data.id || null;
    var command = data.command;
    var payload = data.payload || {};
    var self = this;

    return this.dispatchCommand(command, payload, {
      origin: event.origin,
      source: event.source,
      id: id
    }).then(function(result) {
      self.sendResponse(event, id, command, result);
      return result;
    }).catch(function(error) {
      self.sendError(event, id, command, error);
      return null;
    });
  },

  registerCommand: function(command, handler) {
    if (typeof command !== "string" || !command || typeof handler !== "function") {
      throw new Error("Invalid embedding command registration");
    }
    this.commandHandlers[command] = handler;
    return true;
  },

  unregisterCommand: function(command) {
    delete this.commandHandlers[command];
  },

  dispatchCommand: function(command, payload, context) {
    if (typeof command !== "string" || !command) {
      return Promise.reject(this.createError("invalid_command", "Command is required"));
    }

    var handler = this.commandHandlers[command];
    if (typeof handler !== "function") {
      return Promise.reject(this.createError("unknown_command", "Unknown command: " + command));
    }

    try {
      return Promise.resolve(handler(payload || {}, context || {}));
    } catch (error) {
      return Promise.reject(error);
    }
  },

  validateOrigin: function(origin) {
    var config = this.getConfig();
    if (!origin) {
      return false;
    }

    origin = this.normalizeOrigin(origin);
    if (!origin) {
      return false;
    }

    if (config.hostOrigin && origin !== config.hostOrigin) {
      return false;
    }

    var allowedOrigins = config.allowedOrigins || [];
    if (allowedOrigins.indexOf("*") !== -1 || allowedOrigins.indexOf(origin) !== -1) {
      return this.setHostOrigin(origin);
    }

    if (this.isSameOrigin(origin)) {
      return this.setHostOrigin(origin);
    }

    if (this.isAllowedHost(origin, config.allowedHosts || [])) {
      return this.setHostOrigin(origin);
    }

    return false;
  },

  setHostOrigin: function(origin) {
    var config = this.getConfig();
    origin = this.normalizeOrigin(origin);
    if (!config.hostOrigin) {
      config.hostOrigin = origin;
    }
    this.hostOrigin = config.hostOrigin;
    return origin === config.hostOrigin;
  },

  isSameOrigin: function(origin) {
    if (typeof window === "undefined" || !window.location) {
      return false;
    }
    origin = this.normalizeOrigin(origin);
    return origin === window.location.origin;
  },

  isAllowedHost: function(origin, allowedHosts) {
    if (!allowedHosts || allowedHosts.length === 0 || typeof URL === "undefined") {
      return false;
    }

    try {
      var parsed = new URL(origin);
      return allowedHosts.indexOf(parsed.host) !== -1 || allowedHosts.indexOf(parsed.hostname) !== -1;
    } catch (e) {
      return false;
    }
  },

  normalizeOrigin: function(origin) {
    if (origin === "*") {
      return "*";
    }
    if (typeof origin !== "string" || !origin) {
      return null;
    }
    if (typeof URL !== "function") {
      return origin;
    }
    try {
      return new URL(origin).origin;
    } catch (e) {
      return null;
    }
  },

  normalizeAllowedOrigins: function(origins) {
    var self = this;
    if (typeof origins === "string") {
      origins = [origins];
    }
    if (!origins || typeof origins.length !== "number") {
      return [];
    }
    return Array.prototype.slice.call(origins).map(function(origin) {
      return self.normalizeOrigin(origin);
    }).filter(function(origin, index, allOrigins) {
      return origin && allOrigins.indexOf(origin) === index;
    });
  },

  normalizeAllowedHosts: function(hosts) {
    if (typeof hosts === "string") {
      hosts = [hosts];
    }
    if (!hosts || typeof hosts.length !== "number") {
      return [];
    }
    return Array.prototype.slice.call(hosts).map(function(host) {
      if (typeof host !== "string") {
        return null;
      }
      var trimmed = host.trim().toLowerCase();
      if (!trimmed) {
        return null;
      }
      if (typeof URL === "function" && trimmed.indexOf("://") !== -1) {
        try {
          var parsed = new URL(trimmed);
          return parsed.host || parsed.hostname;
        } catch (e) {
          return null;
        }
      }
      return trimmed.replace(/\/+$/, "");
    }).filter(function(host, index, allHosts) {
      return host && allHosts.indexOf(host) === index;
    });
  },

  getMessageValidationError: function(event) {
    var config = this.getConfig();
    var payloadSize = this.estimatePayloadSize(event.data);
    if (payloadSize > config.maxPayloadBytes) {
      return this.createError("payload_too_large", "Message payload exceeds the embedding limit");
    }
    if (!this.checkRateLimit(event.origin, event.data.type)) {
      return this.createError("rate_limited", "Embedding message rate limit exceeded");
    }
    return null;
  },

  estimatePayloadSize: function(data) {
    try {
      return JSON.stringify(data).length;
    } catch (e) {
      return 0;
    }
  },

  checkRateLimit: function(origin, messageType) {
    var config = this.getConfig();
    var rateLimit = config.rateLimit || {};
    if (rateLimit.enabled === false) {
      return true;
    }

    var windowMs = Math.max(100, Math.floor(Number(rateLimit.windowMs) || 1000));
    var maxMessages = Math.max(1, Math.floor(Number(rateLimit.maxMessages) || 80));
    var maxCommands = Math.max(1, Math.floor(Number(rateLimit.maxCommands) || 40));
    var now = Date.now();
    var bucketKey = origin || "unknown";
    var bucket = this.rateLimitBuckets[bucketKey];

    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = {
        windowStart: now,
        messages: 0,
        commands: 0
      };
      this.rateLimitBuckets[bucketKey] = bucket;
    }

    bucket.messages += 1;
    if (messageType === this.messageTypes.command) {
      bucket.commands += 1;
    }

    return bucket.messages <= maxMessages && bucket.commands <= maxCommands;
  },

  rememberClient: function(source, origin) {
    if (!source || !origin) {
      return null;
    }

    var client = this.findClient(source, origin);
    if (client) {
      return client;
    }

    client = {
      source: source,
      origin: origin,
      subscriptions: {}
    };
    this.clients.push(client);
    return client;
  },

  findClient: function(source, origin) {
    for (var i = 0; i < this.clients.length; i++) {
      var client = this.clients[i];
      if (client.source === source && client.origin === origin) {
        return client;
      }
    }
    return null;
  },

  subscribe: function(source, origin, events) {
    var client = this.rememberClient(source, origin);
    if (!client) {
      return [];
    }

    var eventList = this.normalizeEventList(events);
    for (var i = 0; i < eventList.length; i++) {
      var eventName = eventList[i];
      client.subscriptions[eventName] = true;
      if (!this.eventSubscribers[eventName]) {
        this.eventSubscribers[eventName] = [];
      }
      if (this.eventSubscribers[eventName].indexOf(client) === -1) {
        this.eventSubscribers[eventName].push(client);
      }
    }

    return this.getClientSubscriptions(source, origin);
  },

  unsubscribe: function(source, origin, events) {
    var client = this.findClient(source, origin);
    if (!client) {
      return [];
    }

    var eventList = this.normalizeEventList(events);
    if (eventList.length === 0) {
      eventList = this.getClientSubscriptions(source, origin);
    }

    for (var i = 0; i < eventList.length; i++) {
      var eventName = eventList[i];
      delete client.subscriptions[eventName];
      var subscribers = this.eventSubscribers[eventName] || [];
      this.eventSubscribers[eventName] = subscribers.filter(function(candidate) {
        return candidate !== client;
      });
    }

    return this.getClientSubscriptions(source, origin);
  },

  normalizeEventList: function(events) {
    if (!events) {
      return [];
    }
    if (typeof events === "string") {
      return [events];
    }
    if (Array.isArray(events)) {
      return events.filter(function(eventName) {
        return typeof eventName === "string" && eventName.length > 0;
      });
    }
    return [];
  },

  getClientSubscriptions: function(source, origin) {
    var client = this.findClient(source, origin);
    if (!client) {
      return [];
    }
    return Object.keys(client.subscriptions);
  },

  emit: function(eventType, data, options) {
    options = options || {};
    if (typeof eventType !== "string" || !eventType) {
      return 0;
    }

    var delivered = 0;
    for (var i = 0; i < this.clients.length; i++) {
      var client = this.clients[i];
      if (!options.includeUnsubscribed && !client.subscriptions[eventType] && !client.subscriptions["*"]) {
        continue;
      }
      if (this.postToClient(client, {
        type: this.messageTypes.event,
        event: eventType,
        data: data || null,
        apiVersion: this.getConfig().apiVersion || this.apiVersion
      })) {
        delivered++;
      }
    }

    return delivered;
  },

  sendResponse: function(event, id, command, result) {
    return this.postToClient({
      source: event.source,
      origin: event.origin
    }, {
      type: this.messageTypes.response,
      id: id,
      command: command,
      ok: true,
      result: result === undefined ? null : result
    });
  },

  sendError: function(event, id, command, error) {
    var formatted = this.formatError(error);
    return this.postToClient({
      source: event.source,
      origin: event.origin
    }, {
      type: this.messageTypes.response,
      id: id,
      command: command,
      ok: false,
      error: formatted
    });
  },

  postToClient: function(client, message) {
    if (!client || !client.source || typeof client.source.postMessage !== "function") {
      return false;
    }

    try {
      client.source.postMessage(message, client.origin);
      return true;
    } catch (e) {
      return false;
    }
  },

  createError: function(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  },

  formatError: function(error) {
    if (!error) {
      return {
        code: "unknown_error",
        message: "Unknown error"
      };
    }

    return {
      code: error.code || "command_error",
      message: error.message || String(error)
    };
  },

  resetForTests: function() {
    this.initialized = false;
    this.embeddedModeApplied = false;
    this.hostOrigin = null;
    this.hostSource = null;
    this.commandHandlers = {};
    this.clients = [];
    this.eventSubscribers = {};
    this.rateLimitBuckets = {};
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = EmbeddingAPI;
}
