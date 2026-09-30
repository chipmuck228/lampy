import { CAMERA_DENIED_MESSAGE, LIBRARY_DENIED_MESSAGE, MIC_DENIED_MESSAGE } from './use-cases';
import {
  CAMERA_DENIED_STATUS,
  LIBRARY_DENIED_STATUS,
  MIC_DENIED_STATUS,
  composerPermissionNotice,
} from './composer-notice';

describe('composer permission notice', () => {
  it('keeps a short band status and the full denied copy for the sheet', () => {
    expect(composerPermissionNotice('CAMERA_DENIED', CAMERA_DENIED_MESSAGE)).toEqual({
      status: CAMERA_DENIED_STATUS,
      detail: CAMERA_DENIED_MESSAGE,
    });
    expect(composerPermissionNotice('LIBRARY_DENIED', LIBRARY_DENIED_MESSAGE)).toEqual({
      status: LIBRARY_DENIED_STATUS,
      detail: LIBRARY_DENIED_MESSAGE,
    });
    expect(composerPermissionNotice('MIC_DENIED', MIC_DENIED_MESSAGE)).toEqual({
      status: MIC_DENIED_STATUS,
      detail: MIC_DENIED_MESSAGE,
    });
    expect(composerPermissionNotice('DISK_FULL', '空间不够')).toBeNull();
  });
});
