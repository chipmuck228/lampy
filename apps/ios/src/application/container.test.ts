import { createUseCaseLoader } from './container';
import { createUseCases } from './use-cases';
import { createMemoryRepositories } from '../infrastructure/repositories';

describe('use case loader', () => {
  it('clears a failed open so the next call can try again', async () => {
    let attempts = 0;
    const apps = createUseCases(createMemoryRepositories());
    const loader = createUseCaseLoader(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('database locked');
      return apps;
    });

    await expect(loader.getUseCases()).rejects.toThrow('database locked');
    await expect(loader.getUseCases()).resolves.toBe(apps);
    expect(attempts).toBe(2);
  });
});
