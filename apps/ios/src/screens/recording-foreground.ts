import { AppState } from 'react-native';
/** Wait for permission/auth UI to settle; never survive background or route exit. */
export function waitForRecordingForeground(
  stillHere: () => boolean,
  isReady: () => boolean = stillHere,
): Promise<boolean> {
  if (!stillHere() || AppState.currentState === 'background') return Promise.resolve(false);
  if (AppState.currentState === 'active' && isReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let finished = false;
    const finish = (ready: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout); clearInterval(poll); sub.remove();
      resolve(ready && stillHere());
    };
    const check = () => {
      if (!stillHere() || AppState.currentState === 'background') finish(false);
      else if (AppState.currentState === 'active' && isReady()) finish(true);
    };
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') finish(false);
      else if (state === 'active') check();
    });
    // Lock context may update one render after AppState. Do not bypass its gate.
    const poll = setInterval(check, 50);
    const timeout = setTimeout(() => finish(false), 10000);
  });
}
