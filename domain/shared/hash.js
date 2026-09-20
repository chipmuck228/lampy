function hashCode(text) {
  let h = 0
  const raw = String(text || '')
  for (let i = 0; i < raw.length; i += 1) {
    h = ((h << 5) - h) + raw.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function hash01(text, salt) {
  return (hashCode(`${text || ''}:${salt || ''}`) % 10000) / 10000
}

module.exports = {
  hashCode,
  hash01,
}
