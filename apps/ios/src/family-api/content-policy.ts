import { FamilyError } from './errors';
// Deliberately narrow launch rules. No private-library scanning, image analysis or audio transcription.
// These explicit phrases are not a complete classifier; reporting and human review remain necessary.
const prohibited = [
  /\b(?:kill|rape)\s+(?:you|your\s+(?:child|baby|family))\b/u,
  /(?:杀了你|杀死你|强奸你|儿童色情|幼童色情)/u,
];
export function assertSharedTextAllowed(...values: (string | null | undefined)[]) {
  for (const value of values) {
    const normalized = (value ?? '').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/gu, '');
    if (prohibited.some(rule => rule.test(normalized))) {
      throw new FamilyError('CONTENT_NOT_ALLOWED', 'This text cannot be shared. Your private record is unchanged.');
    }
  }
}
