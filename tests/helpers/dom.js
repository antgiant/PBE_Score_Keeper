const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createStorage } = require('./storage');

function extractScripts(html) {
  const matches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  return matches.map((match) => {
    const srcMatch = match[0].match(/src=["']([^"']+)["']/);
    return {
      src: srcMatch ? srcMatch[1] : null,
      inline: match[1] ? match[1].trim() : '',
    };
  });
}

function buildContext(seed = {}) {
  const localStorage = createStorage(seed);
  const elements = new Map();

  function getElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        children: [],
        props: {},
        styles: {},
        textContent: '',
        htmlContent: '',
        value: '',
      });
    }
    return elements.get(id);
  }

  function createChild(parent) {
    const child = {
      remove() {
        const index = parent.children.indexOf(child);
        if (index > -1) {
          parent.children.splice(index, 1);
        }
      },
    };
    parent.children.push(child);
  }

  function parseIds(markup) {
    if (typeof markup !== 'string') {
      return;
    }
    const idRegex = /id=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g;
    let match = idRegex.exec(markup);
    while (match) {
      const id = match[1] || match[2] || match[3];
      if (id) {
        getElement(id);
      }
      match = idRegex.exec(markup);
    }
  }

  function wrap(element) {
    return {
      append(content) {
        parseIds(content);
        createChild(element);
        return this;
      },
      children() {
        return element.children;
      },
      html(value) {
        if (value === undefined) {
          return element.htmlContent;
        }
        element.htmlContent = String(value);
        return this;
      },
      text(value) {
        if (value === undefined) {
          return element.textContent;
        }
        element.textContent = String(value);
        return this;
      },
      val(value) {
        if (value === undefined) {
          return element.value;
        }
        element.value = String(value);
        return this;
      },
      prop(name, value) {
        if (value === undefined) {
          return element.props[name];
        }
        element.props[name] = value;
        return this;
      },
      controlgroup() {
        return this;
      },
      accordion() {
        return this;
      },
      keypress() {
        return this;
      },
      css() {
        if (arguments.length === 1) {
          return element.styles[arguments[0]];
        }
        if (arguments.length >= 2) {
          element.styles[arguments[0]] = arguments[1];
        }
        return this;
      },
      show() {
        element.styles.display = 'block';
        return this;
      },
      hide() {
        element.styles.display = 'none';
        return this;
      },
      trigger() {
        return this;
      },
      focus() {
        return this;
      },
    };
  }

  const document = {
    createTextNode(text) {
      return { nodeValue: text };
    },
    createElement() {
      return {
        _child: null,
        appendChild(node) {
          this._child = node;
        },
        get innerHTML() {
          return this._child ? String(this._child.nodeValue ?? '') : '';
        },
      };
    },
  };

  const noop = () => {};
  const jqueryStub = (selector) => {
    if (selector === document) {
      return { ready: noop };
    }
    if (typeof selector === 'string' && selector.startsWith('#')) {
      return wrap(getElement(selector.slice(1)));
    }
    return { ready: noop };
  };

  const windowStub = {
    confirm: () => true,
    alert: noop,
    File: function File() {},
    FileReader: function FileReader() {},
    FileList: function FileList() {},
    Blob: function Blob() {},
    Event: function Event() {},
    dispatchEvent: noop,
    indexedDB: undefined, // Force fallback to localStorage
    yjsModulesLoaded: true, // Pretend Yjs loaded
  };

  // Create a test-friendly setTimeout that executes immediately
  const immediateSetTimeout = (fn) => {
    fn();
    return 1;
  };

  const context = {
    console,
    JSON,
    localStorage,
    document,
    window: windowStub,
    Blob: function Blob() {},
    URL: {
      createObjectURL: () => 'blob:fake',
    },
    $: jqueryStub,
    crypto,
    Event: function Event() {},
    setTimeout: immediateSetTimeout,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
    alert: noop,
    confirm: () => true,
  };

  windowStub.window = windowStub;
  windowStub.document = document;
  windowStub.addEventListener = noop;
  windowStub.removeEventListener = noop;

  return { context, localStorage };
}

function loadApp(seed = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

  // Check if seed is a Yjs config object (has _yjsConfig marker)
  const isYjsSeed = seed && seed._yjsConfig === true;

  if (isYjsSeed) {
    // New Yjs-based test - load app with Yjs config
    const { context, localStorage } = buildContext({});
    vm.createContext(context);

    const scripts = extractScripts(html);
    if (!scripts.length) {
      throw new Error('Inline script or script source not found in index.html');
    }

    // Load all scripts (skip auto-init)
    scripts.forEach((script) => {
      if (script.src) {
        if (script.src.includes('jquery')) {
          return;
        }
        const content = fs.readFileSync(path.join(__dirname, '..', '..', script.src), 'utf8');

        // Load yjs bundle first
        if (script.src.includes('yjs-bundle')) {
          vm.runInContext(content, context);
          // After loading yjs, Y should be on window - expose it globally in the context
          vm.runInContext('Y = window.Y;', context);
          return;
        }

        // Always load app-globals.js (contains global variable declarations)
        // and all app-*.js files but not app.js (which auto-initializes)
        if (script.src.includes('app-globals') || script.src.includes('app-')) {
          vm.runInContext(content, context);
        }
        return;
      }
      if (script.inline) {
        // Skip inline scripts that might auto-initialize
      }
    });

    // Build the Yjs doc inside the VM context using the config
    if (context.Y) {
      // Pass the config to the VM and create the doc there
      context._seedConfig = seed;

      // Create Y.Doc using the Y instance in the VM
      const buildScript = `
        setYdoc(new Y.Doc());
        ydoc.transact(() => {
          const meta = ydoc.getMap('meta');
          meta.set('dataVersion', 2.0);
          meta.set('currentSession', _seedConfig.currentSession || 1);

          const sessions = ydoc.getArray('sessions');
          sessions.push([null]); // 1-indexed placeholder

          if (_seedConfig.sessions) {
            _seedConfig.sessions.forEach(sessionConfig => {
              const session = new Y.Map();
              session.set('name', sessionConfig.name || 'Test Session');

              // Config
              const configMap = new Y.Map();
              configMap.set('maxPointsPerQuestion', sessionConfig.maxPointsPerQuestion || 12);
              configMap.set('rounding', sessionConfig.rounding || false);
              session.set('config', configMap);

              // Teams (1-indexed)
              const teams = new Y.Array();
              teams.push([null]);
              const teamNames = sessionConfig.teams || ['Team 1'];
              teamNames.forEach(teamName => {
                const team = new Y.Map();
                team.set('name', teamName);
                teams.push([team]);
              });
              session.set('teams', teams);

              // Blocks (0-indexed, no placeholder)
              const blocks = new Y.Array();
              const blockNames = sessionConfig.blocks || ['No Block/Group'];
              blockNames.forEach(blockName => {
                const block = new Y.Map();
                block.set('name', blockName);
                blocks.push([block]);
              });
              session.set('blocks', blocks);

              // Questions (1-indexed)
              const questions = new Y.Array();
              questions.push([null]);
              const questionConfigs = sessionConfig.questions || [];
              questionConfigs.forEach(qConfig => {
                const question = new Y.Map();
                question.set('name', qConfig.name || 'Question 1');
                question.set('score', qConfig.score || 0);
                question.set('block', qConfig.block || 0);
                question.set('ignore', qConfig.ignore || false);

                // Question teams (1-indexed)
                const questionTeams = new Y.Array();
                questionTeams.push([null]);
                for (let i = 0; i < teamNames.length; i++) {
                  const teamScore = new Y.Map();
                  const scoreData = qConfig.teamScores && qConfig.teamScores[i] ? qConfig.teamScores[i] : {};
                  teamScore.set('score', scoreData.score || 0);
                  teamScore.set('extraCredit', scoreData.extraCredit || 0);
                  questionTeams.push([teamScore]);
                }
                question.set('teams', questionTeams);

                questions.push([question]);
              });
              session.set('questions', questions);
              session.set('currentQuestion', sessionConfig.currentQuestion || 1);

              sessions.push([session]);
            });
          }
        }, 'test');
        yjsReady = true;
      `;

      vm.runInContext(buildScript, context);
      vm.runInContext('load_from_yjs();', context);
      // Manually set current_session in the global scope since load_from_yjs sets it on window
      vm.runInContext('current_session = window.current_session;', context);
      vm.runInContext('window.stateInitialized = true;', context);
    }

    return { context, localStorage, ydoc: context.ydoc };
  } else {
    // Legacy localStorage-based test - keep existing behavior
    const { context, localStorage } = buildContext(seed);
    vm.createContext(context);

    const scripts = extractScripts(html);
    if (!scripts.length) {
      throw new Error('Inline script or script source not found in index.html');
    }

    scripts.forEach((script) => {
      if (script.src) {
        if (script.src.includes('jquery')) {
          return;
        }
        const content = fs.readFileSync(path.join(__dirname, '..', '..', script.src), 'utf8');

        // Load yjs bundle first (needed for migration from localStorage to Yjs)
        if (script.src.includes('yjs-bundle')) {
          vm.runInContext(content, context);
          // After loading yjs, Y should be on window - expose it globally in the context
          vm.runInContext('Y = window.Y;', context);
          return;
        }

        // Load all app-*.js files but not app.js (which auto-initializes)
        if (script.src.includes('app-') || !script.src.includes('app.js')) {
          vm.runInContext(content, context);
        }
        return;
      }
      if (script.inline) {
        // Skip inline scripts that might auto-initialize
      }
    });

    // Force synchronous initialization for tests
    // Since IndexedDB is not available, we need to manually set up Yjs
    // The scripts define global variables ydoc and yjsReady
    if (context.Y) {
      // Set up Yjs manually for tests - use setter functions to sync with DocManager
      vm.runInContext('setYdoc(new Y.Doc()); setYjsReady(true);', context);

      // Now manually run initialization which will trigger migration from localStorage
      vm.runInContext('initialize_state();', context);

      // For tests, we need to sync Yjs changes back to localStorage so tests can verify
      // that data was properly updated
      vm.runInContext(`
        // After each transaction, sync Yjs state back to localStorage
        if (typeof ydoc !== 'undefined' && ydoc) {
          ydoc.on('update', function() {
            // Sync current session data back to localStorage for test verification
            const meta = ydoc.getMap('meta');
            const currentSessionNum = meta.get('currentSession');
            const sessions = ydoc.getArray('sessions');
            
            if (currentSessionNum && sessions && sessions.get(currentSessionNum)) {
              const session = sessions.get(currentSessionNum);
              
              // Sync team extra credit data
              const teams = session.get('teams');
              if (teams) {
                for (let t = 1; t < teams.length; t++) {
                  const team = teams.get(t);
                  if (team && team.get('name')) {
                    localStorage.setItem('session_' + currentSessionNum + '_team_' + t + '_name', JSON.stringify(team.get('name')));
                  }
                }
              }
              
              // Sync question data
              const questions = session.get('questions');
              if (questions) {
                for (let q = 1; q < questions.length; q++) {
                  const question = questions.get(q);
                  if (question) {
                    localStorage.setItem('session_' + currentSessionNum + '_question_' + q + '_score', JSON.stringify(question.get('score')));
                    localStorage.setItem('session_' + currentSessionNum + '_question_' + q + '_block', JSON.stringify(question.get('block')));
                    localStorage.setItem('session_' + currentSessionNum + '_question_' + q + '_ignore', JSON.stringify(question.get('ignore')));
                    
                    const questionTeams = question.get('teams');
                    if (questionTeams) {
                      for (let qt = 1; qt < questionTeams.length; qt++) {
                        const teamScore = questionTeams.get(qt);
                        if (teamScore) {
                          localStorage.setItem('session_' + currentSessionNum + '_question_' + q + '_team_' + qt + '_score', JSON.stringify(teamScore.get('score')));
                          localStorage.setItem('session_' + currentSessionNum + '_question_' + q + '_team_' + qt + '_extra_credit', JSON.stringify(teamScore.get('extraCredit')));
                        }
                      }
                    }
                  }
                }
              }
            }
          });
        }
      `, context);
    }

    return { context, localStorage, ydoc: context.ydoc };
  }
}

// Helper function to export Yjs document data to localStorage-compatible format
function exportYjsToLocalStorageFormat(ydoc) {
  const result = {};
  
  if (!ydoc) return result;
  
  const meta = ydoc.getMap('meta');
  const sessions = ydoc.getArray('sessions');
  
  // Add metadata
  result.data_version = JSON.stringify(2.0);
  result.current_session = JSON.stringify(meta.get('currentSession') || 1);
  
  // Build session names array
  const sessionNames = [''];
  for (let i = 1; i < sessions.length; i++) {
    const session = sessions.get(i);
    sessionNames.push(session ? session.get('name') : '');
  }
  result.session_names = JSON.stringify(sessionNames);
  
  // Export each session
  for (let s = 1; s < sessions.length; s++) {
    const session = sessions.get(s);
    if (!session) continue;
    
    const config = session.get('config');
    const teams = session.get('teams');
    const blocks = session.get('blocks');
    const questions = session.get('questions');
    
    // Config
    if (config) {
      result[`session_${s}_max_points_per_question`] = JSON.stringify(config.get('maxPointsPerQuestion'));
      result[`session_${s}_rounding`] = JSON.stringify(config.get('rounding'));
    }
    
    // Teams
    if (teams) {
      const teamNames = [''];
      for (let t = 1; t < teams.length; t++) {
        const team = teams.get(t);
        teamNames.push(team ? team.get('name') : '');
      }
      result[`session_${s}_team_names`] = JSON.stringify(teamNames);
    }
    
    // Blocks
    if (blocks) {
      const blockNames = [];
      for (let b = 0; b < blocks.length; b++) {
        const block = blocks.get(b);
        blockNames.push(block ? block.get('name') : '');
      }
      result[`session_${s}_block_names`] = JSON.stringify(blockNames);
    }
    
    // Questions
    if (questions) {
      const questionNames = [''];
      for (let q = 1; q < questions.length; q++) {
        const question = questions.get(q);
        if (!question) continue;
        
        questionNames.push(question.get('name') || '');
        result[`session_${s}_question_${q}_score`] = JSON.stringify(question.get('score'));
        result[`session_${s}_question_${q}_block`] = JSON.stringify(question.get('block'));
        result[`session_${s}_question_${q}_ignore`] = JSON.stringify(question.get('ignore'));
        
        // Team scores for this question
        const questionTeams = question.get('teams');
        if (questionTeams) {
          for (let qt = 1; qt < questionTeams.length; qt++) {
            const teamScore = questionTeams.get(qt);
            if (teamScore) {
              result[`session_${s}_question_${q}_team_${qt}_score`] = JSON.stringify(teamScore.get('score'));
              result[`session_${s}_question_${q}_team_${qt}_extra_credit`] = JSON.stringify(teamScore.get('extraCredit'));
            }
          }
        }
      }
      result[`session_${s}_question_names`] = JSON.stringify(questionNames);
      result[`session_${s}_current_question`] = JSON.stringify(session.get('currentQuestion'));
    }
  }
  
  return result;
}

module.exports = { buildContext, loadApp, exportYjsToLocalStorageFormat };
