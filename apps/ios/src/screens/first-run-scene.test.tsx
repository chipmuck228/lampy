import { StyleSheet } from 'react-native';
import { cleanup, render } from '@testing-library/react-native';

import { FIRST_RUN_SCREENS } from '../application/first-run';
import { FirstRunScene, firstRunPhotoBox } from './first-run-scene';

describe('first-run scenes', () => {
  afterEach(() => {
    cleanup();
  });

  it('sizes the photo from the window instead of a fixed web frame', () => {
    const phone = firstRunPhotoBox(390, 844);
    const short = firstRunPhotoBox(390, 480);
    const pad = firstRunPhotoBox(1024, 1366);
    expect(phone.width).toBeLessThanOrEqual(520);
    expect(phone.height).toBeLessThanOrEqual(280);
    expect(short.height).toBeLessThan(phone.height);
    expect(pad.width).toBeLessThanOrEqual(520);
    expect(pad.width).toBeLessThan(1024 - 96);
  });

  it('shows the bundled photo and in-photo line without leftover sample chrome', async () => {
    const screen = FIRST_RUN_SCREENS[0];
    const box = firstRunPhotoBox(390, 844);
    const leave = await render(
      <FirstRunScene
        id={screen.id}
        photo={screen.photo}
        photoAlt={screen.photoAlt}
        photoNote={screen.photoNote}
        photoWidth={box.width}
        photoHeight={box.height}
      />,
    );
    expect(leave.getByTestId('first-run-scene-leave')).toBeTruthy();
    expect(leave.getByTestId('first-run-photo-leave')).toBeTruthy();
    expect(leave.getByLabelText(screen.photoAlt)).toBeTruthy();
    expect(leave.getByText('一段咖啡，一段午后。')).toBeTruthy();
    expect(leave.queryByText('示意，不是你的记录')).toBeNull();
    expect(leave.queryByText('9月18日')).toBeNull();
    expect(StyleSheet.flatten(leave.getByTestId('first-run-scene-leave').props.style).width).toBe(box.width);
    leave.unmount();

    const lookback = FIRST_RUN_SCREENS[1];
    const second = await render(
      <FirstRunScene
        id={lookback.id}
        photo={lookback.photo}
        photoAlt={lookback.photoAlt}
        photoNote={lookback.photoNote}
        photoWidth={box.width}
        photoHeight={box.height}
      />,
    );
    expect(second.getByTestId('first-run-scene-lookback')).toBeTruthy();
    expect(second.getByText('今天，也有想记住的光。')).toBeTruthy();
    second.unmount();
  });
});
