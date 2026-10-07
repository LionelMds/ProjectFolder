'use strict';

const childProcess = require('child_process');
const readline = require('readline');

const POWERSHELL_ARGS = Object.freeze([
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-Sta',
  '-ExecutionPolicy',
  'Bypass',
  '-Command'
]);
const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 1000;

// Keeps one PowerShell process alive so its assemblies and compiled helpers
// are loaded once. The script must answer each JSON line read on stdin with a
// JSON line {id, ok, output|error} on stdout. Requests run one at a time.
class PowerShellWorker {
  constructor(options) {
    this.script = options.script;
    this.logger = options.logger || null;
    this.spawn = options.spawn || childProcess.spawn;
    this.executable = options.executable || 'powershell.exe';
    this.idleTimeoutMs = options.idleTimeoutMs ?? 0;
    this.child = null;
    this.pending = null;
    this.queue = Promise.resolve();
    this.nextId = 0;
    this.idleTimer = null;
    this.stderrTail = '';
  }

  get running() {
    return Boolean(this.child);
  }

  start() {
    if (this.child) {
      this.scheduleIdleStop();
      return;
    }

    const child = this.spawn(this.executable, [...POWERSHELL_ARGS, this.script], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.child = child;
    this.stderrTail = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    readline.createInterface({ input: child.stdout })
      .on('line', line => this.handleLine(child, line));
    child.stderr.on('data', chunk => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-2000);
    });
    // Writing to a dead process fails with EPIPE; 'exit' reports the cause.
    child.stdin.on('error', () => {});
    child.on('error', error => this.handleExit(child, error));
    child.on('exit', (code, signal) => {
      const details = this.stderrTail.trim();
      this.handleExit(child, new Error(
        `PowerShell worker exited (${code ?? signal})${details ? `: ${details}` : ''}`
      ));
    });

    this.log('info', 'PowerShell worker started');
    this.scheduleIdleStop();
  }

  request(payload, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const run = this.queue.then(() => this.send(payload, timeoutMs));
    this.queue = run.catch(() => {});
    return run;
  }

  send(payload, timeoutMs) {
    this.start();
    const child = this.child;
    const id = ++this.nextId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.failPending(new Error(`PowerShell worker timed out after ${timeoutMs} ms`));
        // The automation may be stuck: the next request starts a fresh process.
        this.stop();
      }, timeoutMs);
      this.pending = { id, resolve, reject, timer };
      child.stdin.write(`${toAsciiJson({ ...payload, id })}\n`);
    }).finally(() => this.scheduleIdleStop());
  }

  handleLine(child, line) {
    if (child !== this.child) {
      return;
    }

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.log('warn', 'Unexpected PowerShell worker output', { line: line.slice(0, 200) });
      return;
    }

    const pending = this.pending;
    if (!pending || !message || message.id !== pending.id) {
      return;
    }

    this.pending = null;
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(String(message.output ?? ''));
    } else {
      pending.reject(new Error(message.error || 'PowerShell worker request failed'));
    }
  }

  handleExit(child, error) {
    if (child !== this.child) {
      return;
    }

    this.child = null;
    this.clearIdleTimer();
    this.failPending(error);
    this.log('warn', 'PowerShell worker stopped', { error: error.message });
  }

  failPending(error) {
    const pending = this.pending;
    if (!pending) {
      return;
    }

    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  scheduleIdleStop() {
    this.clearIdleTimer();
    if (!this.child || !this.idleTimeoutMs) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      if (!this.pending) {
        this.log('info', 'PowerShell worker idle, stopping');
        this.stop();
      }
    }, this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  stop() {
    this.clearIdleTimer();
    const child = this.child;
    if (!child) {
      return;
    }

    this.child = null;
    this.failPending(new Error('PowerShell worker stopped'));
    try {
      child.stdin.end();
    } catch {
      // The process is being killed anyway.
    }
    child.kill();
  }

  log(level, message, details = null) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](message, details);
    }
  }
}

function toAsciiJson(value) {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

module.exports = {
  PowerShellWorker,
  toAsciiJson
};
