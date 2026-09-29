import { decideFirstRunGuide } from '../application/first-run';
import { readFirstRunLibrary } from './first-run-gate';

const mockGetRecentLife = jest.fn();

jest.mock('../application/container', () => ({
  getUseCases: async () => ({ getRecentLife: mockGetRecentLife }),
}));

describe('first-run library read', () => {
  beforeEach(() => {
    mockGetRecentLife.mockReset();
  });

  it('treats an empty personal list as needing the guide', async () => {
    mockGetRecentLife.mockResolvedValue({ isFirstUse: true, items: [] });
    const library = await readFirstRunLibrary();
    expect(decideFirstRunGuide({ completed: false, ...library }).showGuide).toBe(true);
  });

  it('skips the guide when records already exist', async () => {
    mockGetRecentLife.mockResolvedValue({ isFirstUse: false, items: [{ id: 'm1' }] });
    const library = await readFirstRunLibrary();
    expect(decideFirstRunGuide({ completed: false, ...library }).showGuide).toBe(false);
    expect(library.hasPersonalRecords).toBe(true);
  });

  it('skips the guide when the library cannot be read', async () => {
    mockGetRecentLife.mockRejectedValue(new Error('disk'));
    const library = await readFirstRunLibrary();
    expect(library.recordsUnknown).toBe(true);
    expect(decideFirstRunGuide({ completed: false, ...library }).showGuide).toBe(false);
  });
});
