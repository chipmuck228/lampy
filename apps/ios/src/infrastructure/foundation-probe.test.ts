import { inspectFoundationProbe } from './foundation-probe';

describe('foundation probe wrapper', () => {
  it('does not import sqlite or lampy.db', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, 'foundation-probe.ts'), 'utf8') as string;
    expect(source).not.toMatch(/lampy\.db|expo-sqlite|getUseCases|SQLite/);
  });

  it('reports an explicit unavailable state when the native module is missing', async () => {
    const inspect = await inspectFoundationProbe();
    expect(inspect.availability).toBe('unavailable');
    expect(inspect.unavailableReason).toBeTruthy();
  });
});
