import { execFileSync } from 'node:child_process';
import path from 'node:path';

const script = path.join(__dirname, 'seed-lookback-adapt-library.py');

describe('seed-lookback-adapt-library', () => {
  it('refuses personal or non-empty libraries and only inserts into an empty fixture', () => {
    const output = execFileSync('python3', [script, '--self-test'], { encoding: 'utf8' });
    expect(output.trim()).toBe('self-test ok');
  });
});
