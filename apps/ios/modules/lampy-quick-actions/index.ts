import { requireOptionalNativeModule } from 'expo';

export type NativeQuickAction = { id: string; requestId: string };
type QuickActionsModule = {
  consumePending(): NativeQuickAction | null;
  addListener(event: 'onAction', listener: (action: NativeQuickAction) => void): { remove(): void };
};

export function nativeQuickActions(): QuickActionsModule | null {
  try { return requireOptionalNativeModule<QuickActionsModule>('LampyQuickActions'); }
  catch { return null; }
}
