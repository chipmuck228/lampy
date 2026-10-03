import * as Font from 'expo-font';

export const FIRST_RUN_SERIF = 'LampyNotoSerifSC';
export const FIRST_RUN_SANS = 'LampyNotoSansSC';
export const FIRST_RUN_MARK = 'LampyDMSans';

const SOURCES = {
  [FIRST_RUN_SERIF]: require('../../assets/fonts/first-run/NotoSerifSC-Medium.ttf'),
  [FIRST_RUN_SANS]: require('../../assets/fonts/first-run/NotoSansSC-Regular.ttf'),
  [FIRST_RUN_MARK]: require('../../assets/fonts/first-run/DMSans-SemiBold.ttf'),
};

export async function loadFirstRunFonts() {
  await Font.loadAsync(SOURCES);
}
