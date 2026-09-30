import { isPersonalSettingsDiagnosticsOpen } from '../application/personal-settings-visibility';
import AccountScreen, { AccountDiagnosticsClosed } from '../screens/account-screen';

export default function AccountDiagnosticsRoute() {
  if (!isPersonalSettingsDiagnosticsOpen()) {
    return <AccountDiagnosticsClosed />;
  }
  return <AccountScreen variant="diagnostics" />;
}
