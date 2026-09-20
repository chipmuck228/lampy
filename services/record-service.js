const { LOCAL_OWNER_ID } = require('../domain/shared/identity.js')
const {
  createDraftMoment,
  updateMomentContent,
  activateMoment,
  attachAsset,
} = require('../domain/moment/index.js')
const { createAsset } = require('../domain/asset/index.js')
const { createLocalPassTransmission } = require('../domain/transmission/index.js')
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

function passLatestMoment(momentId, storage) {
  const runtime = getRuntime(storage)
  const moment = runtime.moments.getById(momentId) || runtime.moments.list()[0]
  if (!moment) return null
  const transmission = createLocalPassTransmission(moment, { now: () => new Date() })
  runtime.transmissions.save(transmission)
  return transmission
}

module.exports = {
  saveDraftFromForm,
  loadDraftForm,
  submitRecord,
  passLatestMoment,
}
