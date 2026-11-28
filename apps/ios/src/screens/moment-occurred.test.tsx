import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { OccurredDatePicker } from './moment-occurred';

const today = {year:2026,month:9,day:27};
const value = {kind:'today' as const, ...today,label:'今天'};
async function openYears(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(view.getByTestId('composer-occurred-toggle'));
  await fireEvent.press(view.getByTestId('composer-occurred-pick'));
  await fireEvent.press(view.getByTestId('composer-occurred-choose-year'));
}
it('jumps to a past year and month, committing only the final date', async()=>{
  const onChange=jest.fn();
  const view=await render(<OccurredDatePicker value={value} today={today} onChange={onChange} appearance="capture"/>);
  await openYears(view);
  await fireEvent.press(view.getByTestId('composer-occurred-earlier-years'));
  await fireEvent.press(view.getByTestId('composer-occurred-earlier-years'));
  await fireEvent.press(view.getByTestId('composer-occurred-year-1998'));
  await fireEvent.press(view.getByTestId('composer-occurred-month-12'));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(view.getByTestId('composer-occurred-day-1998-12-25'));
  expect(onChange).toHaveBeenCalledWith({kind:'day',year:1998,month:12,day:25});
  expect(view.queryByTestId('composer-occurred-calendar')).toBeNull();
});
it('keeps future years, months and days unavailable',async()=>{
  const onChange=jest.fn();
  const view=await render(<OccurredDatePicker value={value} today={today} onChange={onChange}/>);
  await openYears(view);
  expect(view.queryByTestId('composer-occurred-year-2027')).toBeNull();
  expect(view.getByTestId('composer-occurred-later-years')).toBeDisabled();
  await fireEvent.press(view.getByTestId('composer-occurred-year-2026'));
  expect(view.getByTestId('composer-occurred-month-10')).toBeDisabled();
  await fireEvent.press(view.getByTestId('composer-occurred-month-9'));
  expect(view.getByTestId('composer-occurred-day-2026-9-28')).toBeDisabled();
  await fireEvent.press(view.getByTestId('composer-occurred-day-2026-9-27'));
  expect(onChange).toHaveBeenCalledWith({kind:'today'});
});
it('renders leap day correctly after a year jump',async()=>{
  const onChange=jest.fn();
  const view=await render(<OccurredDatePicker value={value} today={today} onChange={onChange}/>);
  await openYears(view);
  await fireEvent.press(view.getByTestId('composer-occurred-year-2024'));
  await fireEvent.press(view.getByTestId('composer-occurred-month-2'));
  await fireEvent.press(view.getByTestId('composer-occurred-day-2024-2-29'));
  expect(onChange).toHaveBeenCalledWith({kind:'day',year:2024,month:2,day:29});
});
it('discards browsing on close and reopens at the actual selected date',async()=>{
  const onChange=jest.fn();
  const view=await render(<OccurredDatePicker value={value} today={today} onChange={onChange}/>);
  await openYears(view);
  await fireEvent.press(view.getByTestId('composer-occurred-year-2020'));
  await fireEvent.press(view.getByTestId('composer-occurred-month-12'));
  await fireEvent.press(view.getByTestId('composer-occurred-pick'));
  await fireEvent.press(view.getByTestId('composer-occurred-pick'));
  expect(view.getByTestId('composer-occurred-day-2026-9-27')).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});
it('centers the year page on an old saved date and respects disabled state',async()=>{
  const onChange=jest.fn();
  const old={kind:'day' as const,year:1980,month:12,day:3,label:'1980年12月3日'};
  const view=await render(<OccurredDatePicker value={old} today={today} onChange={onChange}/>);
  await fireEvent.press(view.getByTestId('composer-occurred-pick'));
  await fireEvent.press(view.getByTestId('composer-occurred-choose-year'));
  expect(view.getByTestId('composer-occurred-year-1980').props.accessibilityState.selected).toBe(true);
  await view.rerender(<OccurredDatePicker value={old} today={today} onChange={onChange} disabled/>);
  expect(view.getByTestId('composer-occurred-year-1980')).toBeDisabled();
  expect(view.getByTestId('composer-occurred-earlier-years')).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
});

describe('OccurredDatePicker collapse', () => {
  it('hides date options until the toggle is expanded, and VoiceOver matches', async () => {
    const onChange = jest.fn();
    const view = await render(
      <OccurredDatePicker
        value={{ kind: 'today', label: '今天' }}
        today={today}
        onChange={onChange}
      />,
    );
    expect(view.getByLabelText('这件事发生在哪一天').props.accessibilityState.expanded).toBe(false);
    expect(view.queryByTestId('composer-occurred-options')).toBeNull();
    expect(view.queryByTestId('composer-occurred-today')).toBeNull();
    expect(view.getByText('今天')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('这件事发生在哪一天'));
    await waitFor(() => {
      expect(view.getByLabelText('这件事发生在哪一天').props.accessibilityState.expanded).toBe(true);
      expect(view.getByTestId('composer-occurred-options')).toBeTruthy();
    });
    expect(view.getByLabelText('发生日期，今天，已选中')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('这件事发生在哪一天'));
    await waitFor(() => {
      expect(view.getByLabelText('这件事发生在哪一天').props.accessibilityState.expanded).toBe(false);
    });
    expect(view.queryByTestId('composer-occurred-options')).toBeNull();
  });
});
