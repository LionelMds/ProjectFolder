'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { RotatingLogger } = require('../src/main/logger');

test('logs rotate instead of growing without limit', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pfl-log-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const logPath = path.join(directory, 'app.log');
  const logger = new RotatingLogger(logPath, { maxBytes: 180 });

  logger.info('First event', { value: 'a'.repeat(80) });
  logger.info('Second event', { value: 'b'.repeat(80) });
  await logger.flush();

  assert.equal(fs.existsSync(logPath), true);
  assert.equal(fs.existsSync(`${logPath}.1`), true);
  assert.match(fs.readFileSync(logPath, 'utf8'), /Second event/);
});
