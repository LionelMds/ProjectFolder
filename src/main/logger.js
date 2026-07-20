'use strict';

const fs = require('fs');
const path = require('path');
const { MAX_LOG_BYTES } = require('./constants');

class RotatingLogger {
  constructor(logPath, options = {}) {
    this.logPath = logPath;
    this.maxBytes = options.maxBytes || MAX_LOG_BYTES;
    this.queue = Promise.resolve();
  }

  info(message, details = null) {
    this.write('INFO', message, details);
  }

  warn(message, details = null) {
    this.write('WARN', message, details);
  }

  error(message, details = null) {
    this.write('ERROR', message, details);
  }

  write(level, message, details = null) {
    const detailText = details ? ` ${safeStringify(details)}` : '';
    const line = `[${new Date().toISOString()}] ${level} ${message}${detailText}\n`;

    this.queue = this.queue
      .then(() => this.append(line))
      .catch(error => {
        console.error('Unable to write application log:', error);
      });
  }

  async append(line) {
    await fs.promises.mkdir(path.dirname(this.logPath), { recursive: true });
    await this.rotateIfNeeded(Buffer.byteLength(line, 'utf8'));
    await fs.promises.appendFile(this.logPath, line, 'utf8');
  }

  async rotateIfNeeded(incomingBytes) {
    let currentSize = 0;

    try {
      currentSize = (await fs.promises.stat(this.logPath)).size;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (currentSize + incomingBytes <= this.maxBytes) {
      return;
    }

    const rotatedPath = `${this.logPath}.1`;
    await fs.promises.rm(rotatedPath, { force: true });
    await fs.promises.rename(this.logPath, rotatedPath);
  }

  async flush() {
    await this.queue;
  }

  createUpdaterLogger() {
    const write = (level, message) => {
      const text = message instanceof Error ? message.message : String(message || '');
      this.write(level.toUpperCase(), `electron-updater ${level}`, { message: text });
    };

    return {
      info: message => write('info', message),
      warn: message => write('warn', message),
      error: message => write('error', message),
      debug: message => write('debug', message)
    };
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

module.exports = {
  RotatingLogger,
  safeStringify
};
