import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { RootNavBand } from './root-nav-band';

test('Android navigation exposes only recent and lookback even with a family callback', async () => {
  const previous=Platform.OS;
  try {
    Object.defineProperty(Platform,'OS',{value:'android',configurable:true});
    const view=await render(<RootNavBand here="recent" onGo={()=>{}} onFamily={()=>{}} />);
    expect(view.getByTestId('home-lookback')).toBeTruthy();
    expect(view.queryByTestId('home-albums')).toBeNull();
    expect(view.queryByTestId('home-family')).toBeNull();
  } finally {
    Object.defineProperty(Platform,'OS',{value:previous,configurable:true});
  }
});
