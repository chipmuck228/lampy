import { render } from '@testing-library/react-native';

import { MomentAudio } from './moment-audio';

const audio = {
  id: 'asset_voice',
  status: 'available' as const,
  uri: 'file://a.m4a',
  durationMs: 3500,
  durationLabel: '4秒',
  label: '当时的声音',
};

describe('MomentAudio action marks', () => {
  it('keeps play as words only unless the caller asks for marks', async () => {
    const plain = await render(
      <MomentAudio audio={audio} onPlay={() => undefined} onPause={() => undefined} testIDPrefix="plain" />,
    );
    expect(plain.getByLabelText('播放，4秒')).toBeTruthy();
    expect(plain.queryByText('▶')).toBeNull();

    const marked = await render(
      <MomentAudio
        audio={audio}
        onPlay={() => undefined}
        onPause={() => undefined}
        testIDPrefix="marked"
        markedActions
      />,
    );
    expect(marked.getByLabelText('播放，4秒')).toBeTruthy();
    expect(marked.getByText('▶')).toBeTruthy();
  });
});
