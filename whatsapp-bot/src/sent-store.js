'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

/*
 * سجل المعرّفات اللي اتبعتت — يتجنب إرسال نفس الإعلان تكراري.
 * يخزن في sent.json — يعتمد على set كبيرة، نحتفظ بأحدث 2000 ID فقط.
 */

const STORE_SIZE_CAP = 2000;

class SentStore {
  constructor() {
    this._set = new Set();
    this._loadFromDisk();
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(config.sentStorePath)) return;
      const raw = fs.readFileSync(config.sentStorePath, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) for (const id of arr) this._set.add(String(id));
      logger.debug(`تحميل ${this._set.size} ID من سجل الإرسال`);
    } catch (err) {
      logger.warn('sent.json فاسد أو مش موجود — هنبدأ سجل جديد');
    }
  }

  _saveToDisk() {
    try {
      const arr = Array.from(this._set).slice(-STORE_SIZE_CAP);
      fs.writeFileSync(config.sentStorePath, JSON.stringify(arr, null, 0), 'utf8');
    } catch (err) {
      logger.warn('تعذر حفظ سجل الإرسال:', err.message);
    }
  }

  has(id) {
    return this._set.has(String(id));
  }

  isEmpty() {
    return this._set.size === 0;
  }

  /* bulk-seed (first run) — saves only once */
  addAll(ids) {
    for (const id of ids) this._set.add(String(id));
    if (this._set.size > STORE_SIZE_CAP) {
      const arr = Array.from(this._set);
      this._set = new Set(arr.slice(-STORE_SIZE_CAP));
    }
    this._saveToDisk();
    return this._set.size;
  }

  add(id) {
    this._set.add(String(id));
    /* trim if too big — keep the latest inserted */
    if (this._set.size > STORE_SIZE_CAP) {
      const arr = Array.from(this._set);
      this._set = new Set(arr.slice(-STORE_SIZE_CAP));
    }
    this._saveToDisk();
  }
}

module.exports = SentStore;
