import { albumLayoutNativeAvailable } from '../../modules/lampy-album-layout';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { RootNavBand } from './root-nav-band';
jest.mock('../../modules/lampy-album-layout', () => ({
  albumLayoutNativeAvailable: jest.fn(() => true),
  albumNativePageViewAvailable: jest.fn(() => true),
}));

test('Android navigation exposes personal albums but no family even with a family callback', async () => {
  const previous=Platform.OS;
  try {
    Object.defineProperty(Platform,'OS',{value:'android',configurable:true});
    const view=await render(<RootNavBand here="recent" onGo={()=>{}} onFamily={()=>{}} />);
    expect(view.getByTestId('home-lookback')).toBeTruthy();
    expect(view.getByTestId('home-albums')).toBeTruthy();
    expect(view.queryByTestId('home-family')).toBeNull();
  } finally {
    Object.defineProperty(Platform,'OS',{value:previous,configurable:true});
  }
});

test('stale Android binaries do not expose an unusable album entry', async () => {
  const previous=Platform.OS;
  try {
    Object.defineProperty(Platform,'OS',{value:'android',configurable:true});
    jest.mocked(albumLayoutNativeAvailable).mockReturnValue(false);
    const view=await render(<RootNavBand here="recent" onGo={()=>{}} />);
    expect(view.queryByTestId('home-albums')).toBeNull();
  } finally {
    jest.mocked(albumLayoutNativeAvailable).mockReturnValue(true);
    Object.defineProperty(Platform,'OS',{value:previous,configurable:true});
  }
});
