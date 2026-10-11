import { createHomeScreenActionQueue, homeScreenLeaveHref, takeHomeScreenEntry, forgetHomeScreenEntry } from './home-screen-actions';

it('allows only native action IDs and deduplicates the same delivery', () => {
  const queue = createHomeScreenActionQueue();
  queue.receive({ id: '/leave?record=true', requestId: 'external' });
  expect(queue.snapshot()).toBeNull();
  queue.receive({ id: 'app.lampy.record', requestId: 'native-1' });
  expect(queue.consume('wrong')).toBeNull();
  expect(queue.consume('native-1')?.kind).toBe('record');
  queue.receive({ id: 'app.lampy.record', requestId: 'native-1' });
  expect(queue.snapshot()).toBeNull();
});
it('keeps the latest selection, cancels it and accepts a later deliberate invocation', () => {
  const queue = createHomeScreenActionQueue();
  queue.receive({ id: 'app.lampy.write', requestId: 'a' });
  queue.receive({ id: 'app.lampy.camera', requestId: 'b' });
  expect(queue.consume('a')).toBeNull();
  queue.cancel();
  expect(queue.snapshot()).toBeNull();
  queue.receive({ id: 'app.lampy.camera', requestId: 'c' });
  expect(queue.consume('c')?.kind).toBe('camera');
});
it('does not authorize arbitrary URLs or replay a consumed composer capability', () => {
  expect(takeHomeScreenEntry('quick_external')).toBeNull();
  const href = homeScreenLeaveHref('camera');
  expect(takeHomeScreenEntry(href.params.quick)).toBe('camera');
  expect(takeHomeScreenEntry(href.params.quick)).toBeNull();
  const abandoned = homeScreenLeaveHref('record');
  forgetHomeScreenEntry(abandoned.params.quick);
  expect(takeHomeScreenEntry(abandoned.params.quick)).toBeNull();
});
