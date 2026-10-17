/** Per-segment limits; existing recordings are never trimmed or restricted. */
export const FREE_RECORDING_MS = 60_000;
export const PAID_RECORDING_MS = 30 * 60_000;

/** Check before starting, never while capturing. Failure keeps free recording available. */
export async function resolveRecordingLimit(owns: () => Promise<boolean>, timeoutMs = 2000): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const owned = await Promise.race([
      owns(),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
    return owned === true ? PAID_RECORDING_MS : FREE_RECORDING_MS;
  } catch {
    return FREE_RECORDING_MS;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
