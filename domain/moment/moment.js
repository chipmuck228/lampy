const { SCHEMA_VERSION } = require('../shared/identity')
const { toIso } = require('../shared/time')
const { clone } = require('../shared/clone')
const { fail, ERROR_CODES } = require('./moment.errors')
const { validateMoment, hasActiveContent } = require('./moment.validator')

function defaultDeps(dependencies) {
  const deps = dependencies || {}
  return {
    now: deps.now || (() => new Date()),
    id: deps.id || (() => `moment_${Date.now()}`),
    ownerId: deps.ownerId,
  }
}

function isoNow(nowFn) {
  const iso = toIso(nowFn())
  if (!iso) fail(ERROR_CODES.MOMENT_INVALID_TIME, 'now() must return a valid time')
  return iso
}

function assertOwner(moment, actorId) {
  if (!actorId || moment.ownerId !== actorId) {
    fail(ERROR_CODES.MOMENT_FORBIDDEN, 'only the owner can change this moment')
  }
}

function assertNotTrashed(moment) {
  if (moment.lifecycle.status === 'trashed') {
    fail(ERROR_CODES.MOMENT_TRASHED, 'trashed moment must be restored before edit')
  }
}

const TRANSITIONS = {
  'draft:active': true,
  'active:archived': true,
  'archived:active': true,
  'active:trashed': true,
  'archived:trashed': true,
  'trashed:active': true,
}

function assertTransition(from, to) {
  if (!TRANSITIONS[`${from}:${to}`]) {
    fail(ERROR_CODES.MOMENT_INVALID_TRANSITION, `cannot change ${from} to ${to}`)
  }
}

function bump(moment, nowIso) {
  const next = clone(moment)
  next.revision += 1
  next.audit.updatedAt = nowIso
  const result = validateMoment(next)
  if (!result.ok) {
    fail(result.errors[0].code, result.errors[0].message)
  }
  return next
}

function buildOrigin(input) {
  const origin = (input && input.origin) || { type: 'created' }
  if (origin.type === 'imported' && origin.importedAt && input && input.time && !input.time.occurredAt) {
    // keep importedAt off occurredAt
  }
  return clone(origin)
}

/**
 * @param {object} input
 * @param {object} [dependencies]
 */
function createDraftMoment(input, dependencies) {
  const deps = defaultDeps(dependencies)
  const ownerId = (input && input.ownerId) || deps.ownerId
  if (!ownerId) fail(ERROR_CODES.MOMENT_INVALID_OWNER, 'ownerId is required')

  const nowIso = isoNow(deps.now)
  const timeInput = (input && input.time) || {}
  const precision = timeInput.occurredAtPrecision || (timeInput.occurredAt ? 'exact' : 'unknown')
  const recordedAt = toIso(timeInput.recordedAt) || nowIso
  const occurredAt = toIso(timeInput.occurredAt)
  const importedAt = toIso(timeInput.importedAt)

  if (importedAt && occurredAt && importedAt === occurredAt && input && input.origin && input.origin.type === 'imported' && !timeInput.occurredAt) {
    fail(ERROR_CODES.MOMENT_INVALID_TIME, 'importedAt cannot be used as occurredAt')
  }

  const moment = {
    id: (input && input.id) || deps.id(),
    schemaVersion: SCHEMA_VERSION,
    revision: 1,
    ownerId,
    content: {
      note: input && input.content && input.content.note || '',
      significance: input && input.content && input.content.significance || '',
      emotion: input && input.content && input.content.emotion || '',
    },
    time: {
      occurredAt: occurredAt || undefined,
      occurredAtPrecision: precision,
      timezone: timeInput.timezone,
      recordedAt,
      importedAt: importedAt || undefined,
    },
    assetIds: Array.isArray(input && input.assetIds) ? input.assetIds.slice() : [],
    context: {
      people: (input && input.context && input.context.people) || [],
      place: input && input.context && input.context.place,
      tags: (input && input.context && input.context.tags) || [],
    },
    origin: buildOrigin(input),
    accessSummary: {
      visibility: (input && input.accessSummary && input.accessSummary.visibility) || 'private',
      futureAccessEnabled: !!(input && input.accessSummary && input.accessSummary.futureAccessEnabled),
    },
    lifecycle: {
      status: 'draft',
    },
    audit: {
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  }

  const result = validateMoment(moment)
  if (!result.ok) fail(result.errors[0].code, result.errors[0].message)
  return moment
}

function activateMoment(moment, actorId, now) {
  assertOwner(moment, actorId)
  assertNotTrashed(moment)
  assertTransition(moment.lifecycle.status, 'active')
  if (!hasActiveContent(moment)) {
    fail(ERROR_CODES.MOMENT_EMPTY, 'cannot activate an empty moment')
  }
  const next = clone(moment)
  const nowIso = toIso(now) || isoNow(() => new Date())
  next.lifecycle.status = 'active'
  next.lifecycle.activatedAt = nowIso
  return bump(next, nowIso)
}

function updateMomentContent(moment, patch, actorId, now) {
  assertOwner(moment, actorId)
  assertNotTrashed(moment)
  const next = clone(moment)
  const content = patch && patch.content ? patch.content : patch || {}
  if (typeof content.note === 'string') next.content.note = content.note
  if (typeof content.significance === 'string') next.content.significance = content.significance
  if (typeof content.emotion === 'string') next.content.emotion = content.emotion
  if (patch && patch.time) {
    if (patch.time.importedAt && !patch.time.occurredAt && next.origin.type === 'imported') {
      fail(ERROR_CODES.MOMENT_INVALID_TIME, 'importedAt cannot be used as occurredAt')
    }
    if (patch.time.occurredAt !== undefined) next.time.occurredAt = toIso(patch.time.occurredAt) || undefined
    if (patch.time.occurredAtPrecision) next.time.occurredAtPrecision = patch.time.occurredAtPrecision
    if (patch.time.timezone !== undefined) next.time.timezone = patch.time.timezone
    if (patch.time.recordedAt) next.time.recordedAt = toIso(patch.time.recordedAt) || next.time.recordedAt
  }
  if (patch && patch.accessSummary && patch.accessSummary.visibility) {
    next.accessSummary.visibility = patch.accessSummary.visibility
  }
  if (patch && patch.context) {
    if (Array.isArray(patch.context.people)) next.context.people = clone(patch.context.people)
    if (Array.isArray(patch.context.tags)) next.context.tags = clone(patch.context.tags)
    if (patch.context.place !== undefined) next.context.place = patch.context.place
  }
  return bump(next, toIso(now) || isoNow(() => new Date()))
}

function archiveMoment(moment, actorId, now) {
  assertOwner(moment, actorId)
  assertTransition(moment.lifecycle.status, 'archived')
  const next = clone(moment)
  const nowIso = toIso(now) || isoNow(() => new Date())
  next.lifecycle.status = 'archived'
  next.lifecycle.archivedAt = nowIso
  return bump(next, nowIso)
}

function restoreMoment(moment, actorId, now) {
  assertOwner(moment, actorId)
  assertTransition(moment.lifecycle.status, 'active')
  const next = clone(moment)
  const nowIso = toIso(now) || isoNow(() => new Date())
  next.lifecycle.status = 'active'
  next.lifecycle.trashedAt = undefined
  return bump(next, nowIso)
}

function trashMoment(moment, actorId, now) {
  assertOwner(moment, actorId)
  assertTransition(moment.lifecycle.status, 'trashed')
  const next = clone(moment)
  const nowIso = toIso(now) || isoNow(() => new Date())
  next.lifecycle.status = 'trashed'
  next.lifecycle.trashedAt = nowIso
  return bump(next, nowIso)
}

function attachAsset(moment, assetId, actorId, now) {
  assertOwner(moment, actorId)
  assertNotTrashed(moment)
  if (!assetId || typeof assetId !== 'string') {
    fail(ERROR_CODES.ASSET_NOT_FOUND, 'assetId is required')
  }
  const next = clone(moment)
  if (next.assetIds.indexOf(assetId) === -1) next.assetIds.push(assetId)
  return bump(next, toIso(now) || isoNow(() => new Date()))
}

function detachAsset(moment, assetId, actorId, now) {
  assertOwner(moment, actorId)
  assertNotTrashed(moment)
  const next = clone(moment)
  next.assetIds = next.assetIds.filter((id) => id !== assetId)
  return bump(next, toIso(now) || isoNow(() => new Date()))
}

module.exports = {
  createDraftMoment,
  activateMoment,
  updateMomentContent,
  archiveMoment,
  restoreMoment,
  trashMoment,
  attachAsset,
  detachAsset,
  validateMoment,
  hasActiveContent,
}
