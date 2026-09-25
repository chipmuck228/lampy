import { render } from '@testing-library/react-native';

import { ShareConfirmScreen } from './share-confirm-screen';
import type { SharePreview } from '../application/family-use-cases';

const preview: SharePreview = {
  familyId: 'fam_1',
  sourceMomentId: 'moment_gate',
  sourceRevision: 1,
  note: '门口的风',
  emotion: '平静',
  occurredAt: '2026-09-25T03:00:00.000Z',
  occurredAtPrecision: 'exact',
  media: [{ assetId: 'asset_photo', objectId: 'med_1', mimeType: 'image/jpeg', ready: true }],
  canConfirm: true,
};

describe('share confirm screen', () => {
  it('lists the whitelist fields and never says family received the share', async () => {
    const stored = await render(
      <ShareConfirmScreen
        preview={preview}
        status={{
          status: 'stored',
          share: {
            shareId: 'shr_1',
            familyId: 'fam_1',
            authorUserId: 'usr_1',
            sourceMomentId: 'moment_gate',
            sourceRevision: 1,
            snapshot: {
              note: '门口的风',
              emotion: '平静',
              occurredAtPrecision: 'exact',
              media: [],
              origin: {
                type: 'received',
                transmissionId: 'shr_1',
                originalMomentId: 'moment_gate',
                snapshotRevision: 1,
              },
            },
            audienceUserIds: ['usr_1'],
            sharedAt: '2026-09-25T04:00:00.000Z',
            stored: 'server',
          },
        }}
        onConfirm={() => undefined}
      />,
    );
    expect(stored.getByText('将发给家里的内容')).toBeTruthy();
    expect(stored.getByText('文字：门口的风')).toBeTruthy();
    expect(stored.getByText('感受：平静')).toBeTruthy();
    expect(stored.getByText(/具体时刻/)).toBeTruthy();
    expect(stored.getByText('分享已经保存在家里的服务上。')).toBeTruthy();
    expect(stored.queryByText(/家人已收到/)).toBeNull();
  });
});
