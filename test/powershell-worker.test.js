'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const test = require('node:test');
const { PowerShellWorker, toAsciiJson } = require('../src/main/powershell-worker');

// Fake PowerShell process: `respond(request)` returns the answer to write
// back, or undefined to stay silent.
function createFakeSpawn(respond) {
  const children = [];
  const spawn = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      setImmediate(() => child.emit('exit', null, 'SIGTERM'));
    };
    let buffer = '';
    child.stdin.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const request = JSON.parse(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        const answer = respond(request, child);
        if (answer) {
          child.stdout.write(`${JSON.stringify({ id: request.id, ...answer })}\n`);
        }
        newline = buffer.indexOf('\n');
      }
    });
    children.push(child);
    return child;
  };
  return { spawn, children };
}

test('requests are answered in order by a single process', async () => {
  const fake = createFakeSpawn(request => ({ ok: true, output: `done:${request.path}` }));
  const worker = new PowerShellWorker({ script: '', spawn: fake.spawn });

  const results = await Promise.all([
    worker.request({ op: 'echo', path: 'a' }),
    worker.request({ op: 'echo', path: 'b' }),
    worker.request({ op: 'echo', path: 'c' })
  ]);

  assert.deepEqual(results, ['done:a', 'done:b', 'done:c']);
  assert.equal(fake.children.length, 1);
  worker.stop();
});

test('a failed request is reported without stopping the worker', async () => {
  const fake = createFakeSpawn(request => (
    request.path === 'bad'
      ? { ok: false, error: 'Explorer refused' }
      : { ok: true, output: 'fine' }
  ));
  const worker = new PowerShellWorker({ script: '', spawn: fake.spawn });

  await assert.rejects(worker.request({ path: 'bad' }), /Explorer refused/);
  assert.equal(await worker.request({ path: 'good' }), 'fine');
  assert.equal(fake.children.length, 1);
  worker.stop();
});

test('a stuck request times out, kills the process and the next one restarts it', async () => {
  const fake = createFakeSpawn((request, child) => (
    fake.children.indexOf(child) === 0 ? undefined : { ok: true, output: 'recovered' }
  ));
  const worker = new PowerShellWorker({ script: '', spawn: fake.spawn });

  await assert.rejects(worker.request({ path: 'x' }, { timeoutMs: 20 }), /timed out/);
  assert.equal(fake.children[0].killed, true);
  assert.equal(await worker.request({ path: 'x' }), 'recovered');
  assert.equal(fake.children.length, 2);
  worker.stop();
});

test('a crashing process rejects the pending request', async () => {
  const fake = createFakeSpawn((request, child) => {
    child.stderr.write('Add-Type failed');
    setImmediate(() => child.emit('exit', 1, null));
    return undefined;
  });
  const worker = new PowerShellWorker({ script: '', spawn: fake.spawn });

  await assert.rejects(worker.request({ path: 'x' }), /exited \(1\)/);
  assert.equal(worker.running, false);
});

test('an idle worker stops by itself', async () => {
  const fake = createFakeSpawn(() => ({ ok: true, output: '' }));
  const worker = new PowerShellWorker({ script: '', spawn: fake.spawn, idleTimeoutMs: 20 });

  worker.start();
  assert.equal(worker.running, true);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(worker.running, false);
  assert.equal(fake.children[0].killed, true);
});

test('requests are sent as ASCII so console code pages cannot alter paths', () => {
  const line = toAsciiJson({ path: "C:\\Projets\\Plan d'exécution – 🏭" });

  assert.match(line, /^[\x20-\x7e]+$/);
  assert.equal(JSON.parse(line).path, "C:\\Projets\\Plan d'exécution – 🏭");
});
