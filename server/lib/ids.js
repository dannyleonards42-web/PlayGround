import { randomBytes } from 'node:crypto';

export function newId(prefix) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function trimTo(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled';
}
