const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildTimerSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 8,
      rounding: false,
      timerFirstPointSeconds: 20,
      timerSubsequentPointSeconds: 5,
      timerWarningFlashSeconds: 10,
      teams: ['Alpha'],
      blocks: ['No Block/Group'],
      questions: [{
        name: 'Q1',
        score: 2,
        block: 0,
        ignore: false,
        teamScores: [{ score: 0, extraCredit: 0 }]
      }],
      currentQuestion: 1
    }]
  });
}

function installManualInterval(context) {
  let callback = null;
  context.setInterval = (fn) => {
    callback = fn;
    return 1;
  };
  context.clearInterval = () => {
    callback = null;
  };
  return {
    tick(count = 1) {
      for (let i = 0; i < count; i++) {
        assert.equal(typeof callback, 'function', 'expected active timer callback');
        callback();
      }
    },
    hasActiveInterval() {
      return typeof callback === 'function';
    }
  };
}

function installManualTimeout(context) {
  let nextTimeoutId = 1;
  const pending = new Map();
  context.setTimeout = (fn, delay) => {
    const timeoutId = nextTimeoutId++;
    pending.set(timeoutId, { fn, delay });
    return timeoutId;
  };
  context.clearTimeout = (timeoutId) => {
    pending.delete(timeoutId);
  };
  return {
    flush(delay) {
      const timeoutIds = [];
      pending.forEach((value, timeoutId) => {
        if (delay === undefined || value.delay === delay) {
          timeoutIds.push(timeoutId);
        }
      });
      timeoutIds.forEach((timeoutId) => {
        const timeout = pending.get(timeoutId);
        if (!timeout) {
          return;
        }
        pending.delete(timeoutId);
        timeout.fn();
      });
    },
    count() {
      return pending.size;
    }
  };
}

test('timer settings update session config values', () => {
  const { context, localStorage } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const config = session.get('config');
  const sessionId = session.get('id');

  context.$('#timer_enabled').prop('checked', true);
  context.update_data_element('timer_enabled');
  context.$('#timer_auto_start').prop('checked', true);
  context.update_data_element('timer_auto_start');
  context.update_data_element('timer_first_point_seconds', '11');
  context.update_data_element('timer_subsequent_point_seconds', '3');
  context.update_data_element('timer_warning_flash_seconds', '7');

  assert.equal(localStorage.getItem('pbe_timer_enabled_' + sessionId), 'true');
  assert.equal(localStorage.getItem('pbe_timer_auto_start_' + sessionId), 'true');
  assert.equal(config.get('timerEnabled'), undefined);
  assert.equal(config.get('timerFirstPointSeconds'), 11);
  assert.equal(config.get('timerSubsequentPointSeconds'), 3);
  assert.equal(config.get('timerWarningFlashSeconds'), 7);
});

test('timer enabled toggle options update local-only enabled state', () => {
  const { context, localStorage } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const sessionId = session.get('id');

  context.update_data_element('timer_enabled_yes');
  assert.equal(localStorage.getItem('pbe_timer_enabled_' + sessionId), 'true');
  assert.equal(context.$('#timer_enabled').prop('checked'), true);
  assert.equal(context.$('#timer_enabled_yes').prop('checked'), true);
  assert.equal(context.$('#timer_enabled_no').prop('checked'), false);

  context.update_data_element('timer_enabled_no');
  assert.equal(localStorage.getItem('pbe_timer_enabled_' + sessionId), 'false');
  assert.equal(context.$('#timer_enabled').prop('checked'), false);
  assert.equal(context.$('#timer_enabled_yes').prop('checked'), false);
  assert.equal(context.$('#timer_enabled_no').prop('checked'), true);
});

test('timer auto-start defaults off and can be toggled locally', () => {
  const { context, localStorage } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const sessionId = session.get('id');

  context.sync_data_to_display();
  assert.equal(context.get_local_timer_auto_start(sessionId), false);
  assert.equal(context.$('#timer_auto_start').prop('checked'), false);

  context.$('#timer_auto_start').prop('checked', true);
  context.update_data_element('timer_auto_start');

  assert.equal(context.get_local_timer_auto_start(sessionId), true);
  assert.equal(localStorage.getItem('pbe_timer_auto_start_' + sessionId), 'true');
});

test('question points start timer when auto-start is enabled', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('question_score_4', '4');

  assert.equal(context.question_timer_running, true);
  assert.equal(context.question_timer_duration_seconds, 35);
  assert.equal(context.question_timer_remaining_seconds, 35);
  assert.equal(context.$('#question_timer_display').text(), '35');
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-expired'), false);
});

test('question points do not auto-start timer when auto-start is off', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), false);

  context.update_data_element('question_score_4', '4');
  context.sync_data_to_display();

  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_duration_seconds, 35);
  assert.equal(context.question_timer_remaining_seconds, 35);
});

test('timer restart action resets timer state without auto-playing', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const interval = installManualInterval(context);
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('question_score_4', '4');
  interval.tick(2);
  assert.equal(context.question_timer_remaining_seconds, 33);
  assert.equal(interval.hasActiveInterval(), true);

  context.update_data_element('question_timer_play_pause');
  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_remaining_seconds, 33);
  assert.equal(interval.hasActiveInterval(), false);

  context.update_data_element('question_timer_restart');

  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_duration_seconds, 35);
  assert.equal(context.question_timer_remaining_seconds, 35);
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-expired'), false);
  assert.equal(context.$('#question_timer_play_pause').text(), '▶️');
  assert.equal(interval.hasActiveInterval(), false);
});

test('timer play/pause toggle pauses and resumes countdown', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const interval = installManualInterval(context);
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('question_score_4', '4');
  assert.equal(context.question_timer_running, true);
  interval.tick(1);
  assert.equal(context.question_timer_remaining_seconds, 34);

  context.update_data_element('question_timer_play_pause');
  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_remaining_seconds, 34);
  assert.equal(context.$('#question_timer_play_pause').text(), '▶️');
  assert.equal(interval.hasActiveInterval(), false);

  context.update_data_element('question_timer_play_pause');
  assert.equal(context.question_timer_running, true);
  assert.equal(context.question_timer_remaining_seconds, 34);
  assert.equal(context.$('#question_timer_play_pause').text(), '⏸️');
  assert.equal(interval.hasActiveInterval(), true);
});

test('question points do not start timer when disabled', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  context.set_local_timer_enabled(session.get('id'), false);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('question_score_4', '4');

  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_duration_seconds, 0);
  assert.equal(context.question_timer_remaining_seconds, 0);
});

test('changing timer numbers updates duration for current question', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('question_score_4', '4');
  context.update_data_element('question_timer_play_pause');

  context.update_data_element('timer_first_point_seconds', '9');
  context.update_data_element('timer_subsequent_point_seconds', '4');
  context.sync_data_to_display();

  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_duration_seconds, 21);
  assert.equal(context.question_timer_remaining_seconds, 21);

  context.update_data_element('question_timer_restart');
  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_duration_seconds, 21);
  assert.equal(context.question_timer_remaining_seconds, 21);
});

test('timer adjustment buttons update timer and persist to question Yjs data', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), false);

  context.update_data_element('question_score_4', '4');
  context.sync_data_to_display();
  assert.equal(context.question_timer_duration_seconds, 35);
  assert.equal(context.question_timer_remaining_seconds, 35);
  assert.equal(context.question_timer_running, false);

  context.update_data_element('question_timer_increase');
  context.sync_data_to_display();
  let question = context.getOrderedQuestions(session)[0];
  assert.equal(question.data.get('timerAdjustmentSeconds'), 1);
  assert.equal(context.question_timer_duration_seconds, 36);
  assert.equal(context.question_timer_remaining_seconds, 36);

  context.update_data_element('question_timer_decrease');
  context.sync_data_to_display();
  question = context.getOrderedQuestions(session)[0];
  assert.equal(question.data.get('timerAdjustmentSeconds'), undefined);
  assert.equal(context.question_timer_duration_seconds, 35);
  assert.equal(context.question_timer_remaining_seconds, 35);

  context.update_data_element('question_timer_decrease');
  context.sync_data_to_display();
  question = context.getOrderedQuestions(session)[0];
  assert.equal(question.data.get('timerAdjustmentSeconds'), -1);
  assert.equal(context.question_timer_duration_seconds, 34);
  assert.equal(context.question_timer_remaining_seconds, 34);
});

test('timer decrease is clamped and cannot reduce total duration below zero', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), false);

  context.update_data_element('question_score_4', '4');
  context.sync_data_to_display();
  assert.equal(context.question_timer_duration_seconds, 35);

  for (let i = 0; i < 40; i++) {
    context.update_data_element('question_timer_decrease');
    context.sync_data_to_display();
  }

  const question = context.getOrderedQuestions(session)[0];
  assert.equal(question.data.get('timerAdjustmentSeconds'), -35);
  assert.equal(context.question_timer_duration_seconds, 0);
  assert.equal(context.question_timer_remaining_seconds, 0);
});

test('timer adjustment buttons update remaining time while timer is running', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const interval = installManualInterval(context);
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('question_score_4', '4');
  interval.tick(1);
  assert.equal(context.question_timer_running, true);
  assert.equal(context.question_timer_duration_seconds, 35);
  assert.equal(context.question_timer_remaining_seconds, 34);
  assert.equal(interval.hasActiveInterval(), true);

  context.update_data_element('question_timer_increase');
  context.sync_data_to_display();
  assert.equal(context.question_timer_running, true);
  assert.equal(context.question_timer_duration_seconds, 36);
  assert.equal(context.question_timer_remaining_seconds, 35);
  assert.equal(interval.hasActiveInterval(), true);

  context.update_data_element('question_timer_decrease');
  context.sync_data_to_display();
  assert.equal(context.question_timer_running, true);
  assert.equal(context.question_timer_duration_seconds, 35);
  assert.equal(context.question_timer_remaining_seconds, 34);
  assert.equal(interval.hasActiveInterval(), true);
});

test('timer adjustment buttons are no-op when timer is disabled', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  context.set_local_timer_enabled(session.get('id'), false);
  context.set_local_timer_auto_start(session.get('id'), false);

  context.update_data_element('question_score_4', '4');
  context.sync_data_to_display();
  assert.equal(context.question_timer_duration_seconds, 0);
  assert.equal(context.question_timer_remaining_seconds, 0);

  context.update_data_element('question_timer_increase');
  context.sync_data_to_display();

  const question = context.getOrderedQuestions(session)[0];
  assert.equal(question.data.get('timerAdjustmentSeconds'), undefined);
  assert.equal(context.question_timer_duration_seconds, 0);
  assert.equal(context.question_timer_remaining_seconds, 0);
});

test('changing question max points resets timer +/- adjustment to zero', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), false);

  context.update_data_element('question_score_4', '4');
  context.sync_data_to_display();
  assert.equal(context.question_timer_duration_seconds, 35);

  context.update_data_element('question_timer_increase');
  context.sync_data_to_display();
  let question = context.getOrderedQuestions(session)[0];
  assert.equal(question.data.get('timerAdjustmentSeconds'), 1);
  assert.equal(context.question_timer_duration_seconds, 36);

  context.update_data_element('question_score_5', '5');
  context.sync_data_to_display();
  question = context.getOrderedQuestions(session)[0];
  assert.equal(question.data.get('timerAdjustmentSeconds'), undefined);
  assert.equal(context.question_timer_duration_seconds, 40);
  assert.equal(context.question_timer_remaining_seconds, 40);
});

test('timer panel gets accent class at zero and clears when timer is non-zero', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const interval = installManualInterval(context);
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('question_score_4', '4');
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-expired'), false);

  interval.tick(34);
  assert.equal(context.question_timer_remaining_seconds, 1);
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-expired'), false);

  interval.tick(1);
  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_remaining_seconds, 0);
  assert.equal(context.$('#question_timer_display').text(), '0');
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-expired'), true);

  context.update_data_element('question_timer_restart');
  assert.equal(context.question_timer_running, false);
  assert.equal(context.question_timer_remaining_seconds, 35);
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-expired'), false);
});

test('timer panel flashes done color for half a second at 10 seconds', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const interval = installManualInterval(context);
  const timeout = installManualTimeout(context);
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('question_score_4', '4');
  interval.tick(25);
  assert.equal(context.question_timer_remaining_seconds, 10);
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-warning-flash'), true);
  assert.equal(timeout.count(), 1);

  timeout.flush(500);
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-warning-flash'), false);
});

test('timer warning flash threshold is configurable', () => {
  const { context } = loadApp(buildTimerSeed());
  const session = context.get_current_session();
  const interval = installManualInterval(context);
  const timeout = installManualTimeout(context);
  context.set_local_timer_enabled(session.get('id'), true);
  context.set_local_timer_auto_start(session.get('id'), true);

  context.update_data_element('timer_warning_flash_seconds', '7');
  context.update_data_element('question_score_4', '4');

  interval.tick(25);
  assert.equal(context.question_timer_remaining_seconds, 10);
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-warning-flash'), false);
  assert.equal(timeout.count(), 0);

  interval.tick(3);
  assert.equal(context.question_timer_remaining_seconds, 7);
  assert.equal(context.$('#question_timer_panel').hasClass('question-timer-panel-warning-flash'), true);
  assert.equal(timeout.count(), 1);
});
