const test = require('node:test');
const assert = require('node:assert/strict');
const { socraticNextTurn } = require('../services/ai.js');

test('socraticNextTurn requires messages', async () => {
  await assert.rejects(
    () => socraticNextTurn({ messages: [] }),
    /messages array is required/
  );
});
