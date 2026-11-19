'use strict';

const fs = require('fs');
const path = require('path');

const config = require('./config');

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  info: '\x1b[36m',
  ok: '\x1b[32m',
  warn: '\x1b[33m',
  err: '\x1b[31m',
};

function ensureLogDir() {
  try { fs.mkdirSync(config.logsDir, { recursive: true }); } catch { /* ok */ }
}

function logLine(level, color, arg, logFile) {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] [${level}] ${String(arg)}`;
  console.log(`${color}${line}${COLORS.reset}`);
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch { /* ok */ }
  }
}

function logFilePath() {
  const d = new Date();
  const name = `bot-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.log`;
  return path.join(config.logsDir, name);
}

const logger = {
  info: (msg) => { ensureLogDir(); logLine('INFO', COLORS.info, msg, logFilePath()); },
  ok:   (msg) => { ensureLogDir(); logLine(' OK ', COLORS.ok,   msg, logFilePath()); },
  warn: (msg) => { ensureLogDir(); logLine('WARN', COLORS.warn, msg, logFilePath()); },
  err:  (msg) => { ensureLogDir(); logLine('FAIL', COLORS.err,  msg, logFilePath()); },
  debug: (msg) => {
    if (process.env.DEBUG) {
      ensureLogDir();
      logLine('DBG', COLORS.dim, msg, logFilePath());
    }
  }
};

module.exports = logger;
