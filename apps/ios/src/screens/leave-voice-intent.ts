/** Only a live in-app gesture can authorize one automatic recording attempt. */
const issued = new Set<string>();
let sequence = 0;
let lastIssuedAt = -Infinity;
export function leaveVoiceHref(from: 'recent' | 'lookback') {
  const now = Date.now();
  if (now - lastIssuedAt < 1000) return null;
  lastIssuedAt = now;
  const voice = `voice_${now}_${++sequence}`;
  issued.add(voice);
  // Old unvisited intents need not live for the entire process.
  if (issued.size > 16) issued.delete(issued.values().next().value!);
  return { pathname: '/leave' as const, params: { from, voice } };
}
export function takeLeaveVoiceIntent(value: string | string[] | undefined): boolean {
  const token = Array.isArray(value) ? value[0] : value;
  if (!token || !issued.has(token)) return false;
  issued.delete(token);
  return true;
}
export function forgetLeaveVoiceIntent(value: string | string[] | undefined) {
  const token = Array.isArray(value) ? value[0] : value;
  if (token) issued.delete(token);
}
export function resetLeaveVoiceIntentsForTests() {
  issued.clear(); lastIssuedAt = -Infinity;
}
