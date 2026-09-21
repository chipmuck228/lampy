const { LOCAL_OWNER_ID } = require('../domain/shared/identity.js')
const {
  createDraftMoment,
  updateMomentContent,
  activateMoment,
  attachAsset,
} = require('../domain/moment/index.js')
const { createAsset } = require('../domain/asset/index.js')
const { createLocalPassTransmission } = require('../domain/transmission/index.js')
const { ERROR_CODES, fail } = require('../domain/moment/moment.errors.js')
const { KEYS } = require('../repositories/keys.js')
const { getRuntime } = require('./runtime.js')

function readDraft(storage) {
  return storage.get(KEYS.draftMoment, null)
}

function writeDraft(storage, moment) {
  if (!moment) storage.remove(KEYS.draftMoment)
  else storage.set(KEYS.draftMoment, moment)
}

function ensureDraft(input, runtime) {
  const existing = readDraft(runtime.storage)
  if (existing && existing.id) return existing
  const draft = createDraftMoment({
    ownerId: LOCAL_OWNER_ID,
    content: {
      note: input && input.text || '',
      emotion: input && input.emotion || '',
    },
    time: {
      occurredAt: new Date().toISOString(),
      occurredAtPrecision: 'exact',
      recordedAt: new Date().toISOString(),
    },
    origin: { type: 'created' },
  })
  writeDraft(runtime.storage, draft)
  return draft
}

function saveDraftFromForm(form, storage) {
  const runtime = getRuntime(storage)
  if (!form || (!form.text && !form.imagePath && !form.emotion && !form.voicePath)) {
    writeDraft(runtime.storage, null)
    runtime.storage.remove(KEYS.legacyDraft)
    return null
  }
  let draft = ensureDraft(form, runtime)
  draft = updateMomentContent(draft, {
    content: {
      note: form.text || '',
      emotion: form.emotion || '',
    },
  }, LOCAL_OWNER_ID, new Date())
  writeDraft(runtime.storage, draft)
  runtime.storage.set(KEYS.legacyDraft, {
    text: form.text || '',
    imagePath: form.imagePath || '',
    voicePath: form.voicePath || '',
    emotion: form.emotion || '',
  })
  return draft
}

function loadDraftForm(storage) {
  const runtime = getRuntime(storage)
  const draft = readDraft(runtime.storage)
  const legacy = runtime.storage.get(KEYS.legacyDraft, null) || {}
  if (draft) {
    return {
      text: draft.content && draft.content.note || '',
      emotion: draft.content && draft.content.emotion || '',
      imagePath: legacy.imagePath || '',
      voicePath: legacy.voicePath || '',
    }
  }
  if (legacy && typeof legacy === 'object' && (legacy.text || legacy.imagePath || legacy.emotion || legacy.voicePath)) {
    return {
      text: legacy.text || '',
      emotion: legacy.emotion || '',
      imagePath: legacy.imagePath || '',
      voicePath: legacy.voicePath || '',
    }
  }
  return null
}

function submitRecord(form, storage) {
  const runtime = getRuntime(storage)
  const now = new Date()
  let moment = ensureDraft(form, runtime)
  moment = updateMomentContent(moment, {
    content: {
      note: (form.text || '').trim(),
      emotion: form.emotion || '',
    },
    time: {
      occurredAt: now.toISOString(),
      occurredAtPrecision: 'exact',
      recordedAt: now.toISOString(),
    },
  }, LOCAL_OWNER_ID, now)

  if (form.imagePath) {
    const asset = createAsset({
      id: `asset:${moment.id}:image`,
      ownerId: LOCAL_OWNER_ID,
      type: 'image',
      localUri: form.imagePath,
      storage: { status: 'local' },
    }, { now: () => now })
    runtime.assets.save(asset)
    moment = attachAsset(moment, asset.id, LOCAL_OWNER_ID, now)
  }
  if (form.voicePath) {
    const asset = createAsset({
      id: `asset:${moment.id}:audio`,
      ownerId: LOCAL_OWNER_ID,
      type: 'audio',
      localUri: form.voicePath,
      storage: { status: 'local' },
    }, { now: () => now })
    runtime.assets.save(asset)
    moment = attachAsset(moment, asset.id, LOCAL_OWNER_ID, now)
  }

  moment = activateMoment(moment, LOCAL_OWNER_ID, now)
  runtime.moments.save(moment)
  writeDraft(runtime.storage, null)
  runtime.storage.remove(KEYS.legacyDraft)
  return moment
}

/**
 * 为指定 Moment 记录本地分享意图。不是真实送达。
 * 同 momentId+revision 重复调用只更新同一条 Transmission。
 */
function passMoment(momentId, storage, actorId) {
  if (!momentId || typeof momentId !== 'string') {
    fail(ERROR_CODES.MOMENT_INVALID_ID, 'momentId is required')
  }
  const runtime = getRuntime(storage)
  const moment = runtime.moments.getById(momentId)
  if (!moment) {
    fail(ERROR_CODES.MOMENT_INVALID_ID, 'moment not found')
  }
  const actor = actorId || LOCAL_OWNER_ID
  if (moment.ownerId !== actor) {
    fail(ERROR_CODES.MOMENT_FORBIDDEN, 'only the owner can pass this moment')
  }
  if (moment.lifecycle.status !== 'active') {
    fail(ERROR_CODES.MOMENT_INVALID_TRANSITION, 'only an active moment can be passed')
  }
  const transmission = createLocalPassTransmission(moment, { now: () => new Date() })
  runtime.transmissions.save(transmission)
  return transmission
}

function passLatestMoment(momentId, storage, actorId) {
  return passMoment(momentId, storage, actorId)
}

module.exports = {
  saveDraftFromForm,
  loadDraftForm,
  submitRecord,
  passMoment,
  passLatestMoment,
}
