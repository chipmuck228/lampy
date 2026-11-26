import {act,cleanup,render,waitFor} from '@testing-library/react-native';
import {AccessibilityInfo,Animated,AppState,type AppStateStatus} from 'react-native';
import {LampyPhotoPlaceholder,useGentlePhotoMotion} from './lampy-photo-placeholder';
function Photo({loading=true}:{loading?:boolean}){const animate=useGentlePhotoMotion();return <LampyPhotoPlaceholder loading={loading} animate={animate}/>;}
afterEach(async()=>{await cleanup();jest.restoreAllMocks();});
it('does not animate when reduced motion is requested',async()=>{
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);const loop=jest.spyOn(Animated,'loop');
 const page=await render(<Photo/>);await act(async()=>{});expect(page.getByTestId('lampy-photo-loading')).toBeTruthy();expect(loop).not.toHaveBeenCalled();
});
it('pulses gently only while loading in the foreground and stops on failure or unmount',async()=>{
 Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});const listeners:((state:AppStateStatus)=>void)[]=[];
 jest.spyOn(AppState,'addEventListener').mockImplementation((_event,listener)=>{listeners.push(listener);return {remove:()=>{const i=listeners.indexOf(listener);if(i>=0)listeners.splice(i,1);}};});
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);
 const start=jest.fn(),stop=jest.fn();const loop=jest.spyOn(Animated,'loop').mockReturnValue({start,stop,reset:jest.fn()} as unknown as ReturnType<typeof Animated.loop>);
 const page=await render(<Photo/>);await waitFor(()=>expect(start).toHaveBeenCalledTimes(1));
 await act(async()=>{listeners.forEach(fn=>fn('background'));});expect(stop).toHaveBeenCalledTimes(1);
 await act(async()=>{listeners.forEach(fn=>fn('active'));});await waitFor(()=>expect(start).toHaveBeenCalledTimes(2));
 await page.rerender(<Photo loading={false}/>);expect(stop).toHaveBeenCalledTimes(2);expect(page.getByTestId('lampy-photo-unavailable')).toBeTruthy();
 await page.unmount();expect(listeners).toHaveLength(0);expect(loop).toHaveBeenCalledTimes(2);
});
