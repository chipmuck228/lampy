import { appLanguage } from '../i18n';
import * as Font from 'expo-font';

export const FIRST_RUN_SERIF = appLanguage === 'en' ? 'Georgia' : 'LampyNotoSerifSC';
export const FIRST_RUN_SANS = appLanguage === 'en' ? 'System' : 'LampyNotoSansSC';
export const FIRST_RUN_MARK = appLanguage === 'en' ? 'System' : 'LampyDMSans';

const SOURCES = {
  LampyNotoSerifSC: require('../../assets/fonts/first-run/NotoSerifSC-Medium.ttf'),
  LampyNotoSansSC: require('../../assets/fonts/first-run/NotoSansSC-Regular.ttf'),
  LampyDMSans: require('../../assets/fonts/first-run/DMSans-SemiBold.ttf'),
};

export async function loadFirstRunFonts() {
  if (appLanguage === 'en') return;
  await Font.loadAsync(SOURCES);
}
