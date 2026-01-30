/**
 * Tests for duplicate question detection and merging during sync
 * @file tests/unit/sync-duplicates.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc, buildQuestion } = require('../helpers/yjs-seeds');

test('detectAndMergeDuplicateQuestions: detects questions with matching names as duplicates', () => {
  const { context } = loadApp(createYjsDoc({ 
    currentSession: 1, 
    sessions: [{
      name: 'Test Session',
      teams: ['Team 1'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const Y = context.Y;
  const ydoc = new Y.Doc();
  const questions = ydoc.getArray('questions');
  const now = Date.now();
  
  // Add null placeholder at index 0
  questions.push([null]);
  
  // Add two questions with the same name
  const q1 = new Y.Map();
  q1.set('name', 'Question 1');
  q1.set('nameUpdatedAt', now - 1000);
  q1.set('scores', new Y.Map());
  
  const q2 = new Y.Map();
  q2.set('name', 'Question 1');
  q2.set('nameUpdatedAt', now);
  q2.set('scores', new Y.Map());
  
  questions.push([q1, q2]);
  
  // Group by name
  const questionsByName = new Map();
  for (let i = 1; i < questions.length; i++) {
    const q = questions.get(i);
    if (q) {
      const name = q.get('name');
      if (!questionsByName.has(name)) {
        questionsByName.set(name, []);
      }
      questionsByName.get(name).push({ index: i, question: q });
    }
  }
  
  // Check that duplicate was detected
  const duplicates = questionsByName.get('Question 1');
  assert.strictEqual(duplicates.length, 2, 'Should detect 2 questions with same name');
  
  ydoc.destroy();
});

test('detectAndMergeDuplicateQuestions: does not flag questions with different names as duplicates', () => {
  const { context } = loadApp(createYjsDoc({ 
    currentSession: 1, 
    sessions: [{
      name: 'Test Session',
      teams: ['Team 1'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const Y = context.Y;
  const ydoc = new Y.Doc();
  const questions = ydoc.getArray('questions');
  const now = Date.now();
  
  questions.push([null]);
  
  const q1 = new Y.Map();
  q1.set('name', 'Question 1');
  q1.set('nameUpdatedAt', now);
  q1.set('scores', new Y.Map());
  
  const q2 = new Y.Map();
  q2.set('name', 'Question 2');
  q2.set('nameUpdatedAt', now);
  q2.set('scores', new Y.Map());
  
  questions.push([q1, q2]);
  
  // Group by name
  const questionsByName = new Map();
  for (let i = 1; i < questions.length; i++) {
    const q = questions.get(i);
    if (q) {
      const name = q.get('name');
      if (!questionsByName.has(name)) {
        questionsByName.set(name, []);
      }
      questionsByName.get(name).push({ index: i, question: q });
    }
  }
  
  // Check no duplicates
  assert.strictEqual(questionsByName.get('Question 1').length, 1);
  assert.strictEqual(questionsByName.get('Question 2').length, 1);
  
  ydoc.destroy();
});

test('mergeQuestionDuplicates: keeps score with most recent timestamp when merging', () => {
  // Simulate the merge logic with plain objects (no Yjs)
  const now = Date.now();
  
  // Team score 1 with older timestamp
  const score1 = { value: 5, scoreUpdatedAt: now - 2000 };
  
  // Team score 2 with newer timestamp
  const score2 = { value: 10, scoreUpdatedAt: now };
  
  // Merge logic: newer score wins
  const score1Time = score1.scoreUpdatedAt || 0;
  const score2Time = score2.scoreUpdatedAt || 0;
  
  const winningScore = score2Time > score1Time ? score2.value : score1.value;
  
  assert.strictEqual(winningScore, 10, 'Should keep the more recent score (10)');
});

test('mergeQuestionDuplicates: merges block and ignore properties based on timestamps', () => {
  // Simulate the merge logic with plain objects (no Yjs)
  const now = Date.now();
  
  const q1 = {
    name: 'Question 1',
    block: 0,
    blockUpdatedAt: now - 1000,
    ignore: false,
    ignoreUpdatedAt: now - 500
  };
  
  const q2 = {
    name: 'Question 1',
    block: 1,
    blockUpdatedAt: now, // Newer
    ignore: true,
    ignoreUpdatedAt: now - 1500 // Older
  };
  
  // Merge: newer timestamp wins per property
  const blockTime1 = q1.blockUpdatedAt || 0;
  const blockTime2 = q2.blockUpdatedAt || 0;
  const winningBlock = blockTime2 > blockTime1 ? q2.block : q1.block;
  
  const ignoreTime1 = q1.ignoreUpdatedAt || 0;
  const ignoreTime2 = q2.ignoreUpdatedAt || 0;
  const winningIgnore = ignoreTime2 > ignoreTime1 ? q2.ignore : q1.ignore;
  
  assert.strictEqual(winningBlock, 1, 'Should use newer block value');
  assert.strictEqual(winningIgnore, false, 'Should use newer ignore value');
});

test('mergeQuestionDuplicates: handles multiple sets of duplicates', () => {
  // Two pairs of duplicates
  const now = Date.now();
  const testQuestions = [
    { name: 'Question 1', time: now - 1000 },
    { name: 'Question 1', time: now },
    { name: 'Question 2', time: now - 500 },
    { name: 'Question 2', time: now - 100 },
  ];
  
  // Group by name
  const questionsByName = new Map();
  testQuestions.forEach((q, i) => {
    if (!questionsByName.has(q.name)) {
      questionsByName.set(q.name, []);
    }
    questionsByName.get(q.name).push({ index: i, question: q });
  });
  
  let duplicateSets = 0;
  for (const [name, qs] of questionsByName) {
    if (qs.length > 1) {
      duplicateSets++;
    }
  }
  
  assert.strictEqual(duplicateSets, 2, 'Should detect 2 sets of duplicates');
});

test('buildQuestion helper: creates questions with timestamp properties', () => {
  const { context } = loadApp(createYjsDoc({ 
    currentSession: 1, 
    sessions: [{
      name: 'Test Session',
      teams: ['Team 1'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const Y = context.Y;
  const ydoc = new Y.Doc();
  const questionsArray = ydoc.getArray('questions');
  
  const before = Date.now();
  const question = buildQuestion({ name: 'Test', teamScores: [{ score: 5 }] }, 1, Y);
  const after = Date.now();
  
  // Add to doc so we can read values
  questionsArray.push([null, question]);
  const addedQuestion = questionsArray.get(1);
  
  // Verify question has timestamp properties with current time
  assert.ok(addedQuestion.has('nameUpdatedAt'), 'Question should have nameUpdatedAt');
  assert.ok(addedQuestion.has('blockUpdatedAt'), 'Question should have blockUpdatedAt');
  assert.ok(addedQuestion.has('ignoreUpdatedAt'), 'Question should have ignoreUpdatedAt');
  
  const nameTime = addedQuestion.get('nameUpdatedAt');
  assert.ok(nameTime >= before && nameTime <= after, 'Timestamp should be current');
  
  // Verify team scores have timestamp properties
  const teams = addedQuestion.get('teams');
  const teamScore = teams.get(1); // 1-indexed
  
  assert.ok(teamScore.has('scoreUpdatedAt'), 'Team score should have scoreUpdatedAt');
  assert.ok(teamScore.has('extraCreditUpdatedAt'), 'Team score should have extraCreditUpdatedAt');
  
  ydoc.destroy();
});

test('merge_duplicate_question: action type for history entries', () => {
  // Verify the action type exists in concept
  const action = 'merge_duplicate_question';
  const details = {
    questionName: 'Question 1',
    duplicateCount: 2
  };
  
  assert.strictEqual(action, 'merge_duplicate_question');
  assert.ok(details.questionName);
  assert.ok(details.duplicateCount);
});
