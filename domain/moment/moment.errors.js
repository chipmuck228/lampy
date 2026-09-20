const ERROR_CODES = {
  MOMENT_INVALID_ID: 'MOMENT_INVALID_ID',
  MOMENT_INVALID_OWNER: 'MOMENT_INVALID_OWNER',
  MOMENT_EMPTY: 'MOMENT_EMPTY',
  MOMENT_INVALID_TIME: 'MOMENT_INVALID_TIME',
  MOMENT_INVALID_ORIGIN: 'MOMENT_INVALID_ORIGIN',
  MOMENT_FORBIDDEN: 'MOMENT_FORBIDDEN',
  MOMENT_INVALID_TRANSITION: 'MOMENT_INVALID_TRANSITION',
  MOMENT_TRASHED: 'MOMENT_TRASHED',
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
}

class DomainError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

function fail(code, message) {
  throw new DomainError(code, message)
}

module.exports = {
  ERROR_CODES,
  DomainError,
  fail,
}
