/** Development scope is email-only. Reopen after Apple-only account management is verified.
 * Hides sign-in entries; existing identities and Apple deletion authorization stay intact.
 */
export function appleLoginEntryOpen(): boolean { return false; }
