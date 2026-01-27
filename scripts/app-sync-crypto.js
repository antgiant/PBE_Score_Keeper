/**
 * Encryption utilities for y-websocket large event sync
 * Ports y-webrtc's crypto functions for end-to-end encryption
 * 
 * Uses Web Crypto API:
 * - PBKDF2 for key derivation (100,000 iterations, SHA-256)
 * - AES-256-GCM for encryption
 */

/* global WebsocketProvider */

/**
 * Derive encryption key from password using PBKDF2
 * Uses room name as salt (same approach as y-webrtc)
 * @param {string} password - User-provided password
 * @param {string} roomName - Room name used as salt
 * @returns {Promise<CryptoKey>} Derived AES-GCM key
 */
async function deriveEncryptionKey(password, roomName) {
  var encoder = new TextEncoder();
  var secretBuffer = encoder.encode(password);
  var salt = encoder.encode(roomName);
  
  var keyMaterial = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with AES-256-GCM
 * @param {Uint8Array} data - Data to encrypt
 * @param {CryptoKey} key - AES-GCM key from deriveEncryptionKey
 * @returns {Promise<Uint8Array>} Encrypted data with IV prepended
 */
async function encryptData(data, key) {
  if (!key) return data;
  
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );
  
  // Format: [iv_length (1 byte)][iv (12 bytes)][ciphertext]
  var result = new Uint8Array(1 + iv.length + cipher.byteLength);
  result[0] = iv.length;
  result.set(iv, 1);
  result.set(new Uint8Array(cipher), 1 + iv.length);
  
  return result;
}

/**
 * Decrypt data with AES-256-GCM
 * @param {Uint8Array} data - Encrypted data with IV prepended
 * @param {CryptoKey} key - AES-GCM key from deriveEncryptionKey
 * @returns {Promise<Uint8Array>} Decrypted data
 */
async function decryptData(data, key) {
  if (!key) return data;
  
  var ivLength = data[0];
  var iv = data.slice(1, 1 + ivLength);
  var ciphertext = data.slice(1 + ivLength);
  
  var plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    ciphertext
  );
  
  return new Uint8Array(plaintext);
}

/**
 * Encrypted WebSocket provider wrapper
 * Wraps y-websocket's WebsocketProvider with server authentication
 * 
 * Note: Full E2E encryption would require forking y-websocket to intercept
 * the binary protocol. For now, server auth + TLS provides transport security.
 * The password is used for both server authentication and key derivation
 * (for future E2E encryption enhancement).
 */
class EncryptedWebsocketProvider {
  /**
   * @param {string} serverUrl - WebSocket server URL (e.g., wss://y-sync-pbe.fly.dev)
   * @param {string} roomPath - Room path including /ws/ prefix (e.g., /ws/pbe-ws-ABC123)
   * @param {Y.Doc} doc - Yjs document
   * @param {Object} options - Provider options
   * @param {string} options.password - Room password (required)
   * @param {string} options.action - 'create' or 'join'
   */
  constructor(serverUrl, roomPath, doc, options) {
    var self = this;
    this.doc = doc;
    this.roomPath = roomPath;
    this.password = options.password;
    this.action = options.action || 'join';
    this.key = null;
    this.provider = null;
    this.awareness = null;
    this._destroyed = false;
    this.onStatusChange = null;
    this.onSync = null;
    
    // Extract room name from path for key derivation
    this.roomName = roomPath.replace(/^\/ws\//, '');
    
    // Derive key and create provider
    this._init(serverUrl, options);
  }
  
  async _init(serverUrl, options) {
    var self = this;
    
    // Derive encryption key (for future E2E enhancement)
    this.key = await deriveEncryptionKey(this.password, this.roomName);
    
    if (this._destroyed) return;
    
    // Check if WebsocketProvider is available
    if (typeof WebsocketProvider === 'undefined') {
      throw new Error('WebsocketProvider not available - rebuild yjs-bundle.min.js with y-websocket');
    }
    
    // Create provider with params for server authentication
    // The password and action are sent as query parameters
    this.provider = new WebsocketProvider(serverUrl, this.roomName, this.doc, {
      params: {
        password: this.password,
        action: this.action
      }
    });
    
    this.awareness = this.provider.awareness;
    
    // Forward connection events
    this.provider.on('status', function(event) {
      if (self.onStatusChange) {
        self.onStatusChange(event);
      }
    });
    
    this.provider.on('sync', function(isSynced) {
      if (self.onSync) {
        self.onSync(isSynced);
      }
    });
  }
  
  /**
   * Destroy the provider and clean up
   */
  destroy() {
    this._destroyed = true;
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    this.key = null;
    this.awareness = null;
  }
  
  /**
   * Check if connected
   * @returns {boolean}
   */
  get connected() {
    return this.provider && this.provider.wsconnected;
  }
}

// Export for use in app-sync.js
window.EncryptedWebsocketProvider = EncryptedWebsocketProvider;
window.deriveEncryptionKey = deriveEncryptionKey;
window.encryptData = encryptData;
window.decryptData = decryptData;
