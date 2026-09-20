const commands = require('./moment.commands')
const { ERROR_CODES, DomainError } = require('./moment.errors')
const { validateMoment, hasActiveContent } = require('./moment.validator')

module.exports = {
  ...commands,
  validateMoment,
  hasActiveContent,
  ERROR_CODES,
  DomainError,
}
