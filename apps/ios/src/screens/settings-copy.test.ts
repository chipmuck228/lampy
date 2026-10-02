import { SETTINGS_HELP_CHAPTERS } from './settings-help-copy';
import { SETTINGS_PRIVACY_CHAPTERS, SETTINGS_PRIVACY_UPDATED } from './settings-privacy-copy';
import { SETTINGS_TERMS_CHAPTERS, SETTINGS_TERMS_UPDATED } from './settings-terms-copy';

function flatten(chapters: readonly { title: string; paragraphs: readonly string[] }[]) {
  return chapters.flatMap((chapter) => [chapter.title, ...chapter.paragraphs]).join('\n');
}

describe('settings candidate copy', () => {
  it('keeps help aligned to current UI names and closed capabilities', () => {
    const text = flatten(SETTINGS_HELP_CHAPTERS);
    expect(text).toContain('留下');
    expect(text).toContain('拍摄');
    expect(text).toContain('照片');
    expect(text).toContain('录音');
    expect(text).toContain('阅读完整记录');
    expect(text).toContain('本机保护');
    expect(text).not.toMatch(/开发诊断/);
    expect(text).not.toMatch(/测试账号/);
    expect(text).not.toMatch(/人工智能/);
  });

  it('does not invent purchase, operator, contact, or legal-review claims', () => {
    const text = [flatten(SETTINGS_TERMS_CHAPTERS), flatten(SETTINGS_PRIVACY_CHAPTERS)].join('\n');
    expect(SETTINGS_TERMS_UPDATED).toBe('2026年10月2日');
    expect(SETTINGS_PRIVACY_UPDATED).toBe('2026年10月2日');
    expect(text).not.toMatch(/恢复购买|管理订阅|已订阅|StoreKit/);
    expect(text).not.toMatch(/法律审核|运营主体|适用地区/);
    expect(text).not.toMatch(/TODO|待确认|@lampy\.|mailto:/);
    expect(text).not.toMatch(/绝不丢失|完全不进入任何备份|重新安装就能恢复/);
    expect(text).not.toMatch(/任何数据都不会上传/);
  });
});
