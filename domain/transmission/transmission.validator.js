const { isIso } = require('../shared/time')
const { ERROR_CODES } = require('../moment/moment.errors')

const STATUSES = ['created', 'sent', 'received', 'declined', 'expired', 'revoked']

function issue(code, message, path) {
  return { code, message, path }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateTransmission(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: [issue(ERROR_CODES.TRANSMISSION_INVALID, 'transmission is required')] }
  }
  if (!isNonEmptyString(raw.id)) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'id is required', 'id'))
  }
  if (!isNonEmptyString(raw.sourceMomentId)) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'sourceMomentId is required', 'sourceMomentId'))
  }
  if (!Number.isInteger(raw.sourceRevision) || raw.sourceRevision < 1) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'sourceRevision must be >= 1', 'sourceRevision'))
  }
  if (!isNonEmptyString(raw.senderId)) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'senderId is required', 'senderId'))
  }
  if (raw.recipientId !== undefined && typeof raw.recipientId !== 'string') {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'recipientId must be string', 'recipientId'))
  }
  if (STATUSES.indexOf(raw.status) === -1) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'invalid status', 'status'))
  }
  if (raw.message !== undefined && typeof raw.message !== 'string') {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'message must be string', 'message'))
  }
  if (!isIso(raw.createdAt)) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'createdAt must be ISO', 'createdAt'))
  }
  if (raw.sentAt !== undefined && !isIso(raw.sentAt)) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'sentAt must be ISO', 'sentAt'))
  }
  if (raw.receivedAt !== undefined && !isIso(raw.receivedAt)) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'receivedAt must be ISO', 'receivedAt'))
  }
  if (raw.legacy !== undefined && typeof raw.legacy !== 'boolean') {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'legacy must be boolean', 'legacy'))
  }
  if (raw.legacySource !== undefined && typeof raw.legacySource !== 'string') {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'legacySource must be string', 'legacySource'))
  }
  if (raw.status === 'sent' && !isIso(raw.sentAt)) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'sent transmission needs sentAt', 'sentAt'))
  }
  if (raw.status === 'received' && !isIso(raw.receivedAt)) {
    errors.push(issue(ERROR_CODES.TRANSMISSION_INVALID, 'received transmission needs receivedAt', 'receivedAt'))
  }
  return { ok: errors.length === 0, errors }
}

module.exports = {
  validateTransmission,
}
