import { pauseForegroundAudio } from './foreground-audio';
let generation = 0;
const listeners = new Set<() => void>();
export function familySafetyGeneration() { return generation; }
export function subscribeFamilySafety(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
// Invalidates in-flight reads before waiting on disk cleanup. No record content is retained here.
export function invalidateFamilySafety() { generation++; pauseForegroundAudio(); for (const listener of listeners) listener(); }
