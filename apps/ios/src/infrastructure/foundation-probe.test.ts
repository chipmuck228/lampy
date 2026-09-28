import fs from 'fs';
import path from 'path';

import {
  beginFoundationSelectRequest,
  inspectFoundationProbe,
  resetFoundationSelectRequestForTests,
  shouldCancelFoundationRequest,
} from './foundation-probe';

describe('foundation probe wrapper', () => {
  afterEach(() => {
    resetFoundationSelectRequestForTests();
  });

  it('does not import sqlite or lampy.db', () => {
    const source = fs.readFileSync(path.join(__dirname, 'foundation-probe.ts'), 'utf8');
    expect(source).not.toMatch(/lampy\.db|expo-sqlite|getUseCases|SQLite/);
  });

  it('reports an explicit unavailable state when the native module is missing', async () => {
    const inspect = await inspectFoundationProbe();
    expect(inspect.availability).toBe('unavailable');
    expect(inspect.unavailableReason).toBeTruthy();
    expect(inspect.supportsLocaleZhHans).toBeNull();
    expect(inspect.contextCapacityTokens).toBeNull();
  });

  it('maps locale support and context size instead of claiming the API is hidden', () => {
    const js = fs.readFileSync(path.join(__dirname, 'foundation-probe.ts'), 'utf8');
    const swift = fs.readFileSync(
      path.join(__dirname, '../../modules/lampy-foundation-probe/ios/LampyFoundationProbeModule.swift'),
      'utf8',
    );
    expect(js).toContain('supportsLocaleZhHans');
    expect(js).toContain('supportedLanguages');
    expect(js).toContain('compileSdkVersion');
    expect(swift).toContain('supportsLocale');
    expect(swift).toContain('supportedLanguages');
    expect(swift).toContain('contextSize');
    expect(swift).not.toContain('API does not expose a token window');
  });

  it('keeps a single in-flight request and ignores stale cancel ids', () => {
    const first = beginFoundationSelectRequest();
    const second = beginFoundationSelectRequest();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!first.ok) throw new Error('expected first request');
    expect(shouldCancelFoundationRequest(first.requestId)).toBe(true);
    expect(shouldCancelFoundationRequest('stale-timeout')).toBe(false);
  });
});
