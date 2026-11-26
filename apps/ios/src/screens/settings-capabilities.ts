import {emailCodeEntryOpen} from '../infrastructure/account-config';
import {isAppstoreLaunchBuild} from '../infrastructure/launch-release-config';
import {purchasesSupported} from '../application/mobile-capabilities';

/** Help follows enabled account features, including internal TestFlight builds. */
export function currentSettingsCopyEnabled(){return isAppstoreLaunchBuild()||emailCodeEntryOpen();}
export function paidEpubInformationVisible(){return purchasesSupported()&&(isAppstoreLaunchBuild()||(process.env.EXPO_PUBLIC_ALBUM_EXPORT_ENABLED==='1'&&process.env.EXPO_PUBLIC_ALBUM_PAID_EXPORT_ENABLED==='1'));}
