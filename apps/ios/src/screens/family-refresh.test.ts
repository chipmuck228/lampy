import { createFamilyRefreshGate } from './family-refresh';

describe('family refresh generation gate', () => {
  it('does not let an earlier generation apply after a later refresh starts', () => {
    const gate = createFamilyRefreshGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });
});
