import { ValidationError } from './lib/errors.js';

const TASK_TYPES = new Set(['prospect_research', 'outreach_draft']);

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function validateTaskSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Send a JSON object with a task type and input.');
  }
  const type = clean(body.type);
  if (!TASK_TYPES.has(type)) {
    throw new ValidationError('Unknown task type.', { allowed: [...TASK_TYPES] });
  }

  if (type === 'prospect_research') {
    const input = body.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ValidationError('Research input must include a niche, city and count.');
    }
    const niche = clean(input.niche);
    const city = clean(input.city);
    const count = input.count === undefined ? 3 : Number(input.count);
    if (niche.length < 2 || niche.length > 80) {
      throw new ValidationError('Niche must be between 2 and 80 characters.');
    }
    if (city.length < 2 || city.length > 100) {
      throw new ValidationError('City must be between 2 and 100 characters.');
    }
    if (!Number.isInteger(count) || count < 1 || count > 5) {
      throw new ValidationError('Count must be a whole number from 1 to 5.');
    }
    const requestedBy = clean(input.requestedBy) || 'HQ operator';
    return {
      type,
      input: { niche, city, count, requestedBy: requestedBy.slice(0, 80) }
    };
  }

  const input = body.input;
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Outreach input must reference a research task and prospect.');
  }
  const researchTaskId = clean(input.researchTaskId);
  const prospectId = clean(input.prospectId);
  if (!/^tsk_[a-f0-9]{12}$/.test(researchTaskId)) {
    throw new ValidationError('A valid research task ID is required.');
  }
  if (!/^prospect_[a-z0-9_]+$/i.test(prospectId) || prospectId.length > 80) {
    throw new ValidationError('A valid prospect ID is required.');
  }
  return { type, input: { researchTaskId, prospectId } };
}

export function validateApprovalDecision(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Send a decision of approve or reject.');
  }
  const decision = clean(body.decision).toLowerCase();
  if (!['approve', 'reject'].includes(decision)) {
    throw new ValidationError('Decision must be approve or reject.');
  }
  return {
    decision,
    note: clean(body.note).slice(0, 500)
  };
}
