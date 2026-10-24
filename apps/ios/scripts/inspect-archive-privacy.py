#!/usr/bin/env python3
"""Read-only Archive inventory. A static PASS is never a release/privacy approval."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile

PERMISSIONS = (
    'NSCameraUsageDescription', 'NSMicrophoneUsageDescription',
    'NSPhotoLibraryUsageDescription', 'NSFaceIDUsageDescription',
)
MACHO = {'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe',
         'bebafeca', 'cafebabf', 'bfbafeca'}


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def read_plist(file, root=None):
    if (root is not None and not file.resolve().is_relative_to(root.resolve())) or file.is_symlink() or file.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('UNSAFE_OR_OVERSIZED_PLIST')
    data = file.read_bytes()
    try:
        value = plistlib.loads(data)
    except plistlib.InvalidFileException:
        # Xcode normally compiles .strings as binary plists. Support OpenStep
        # strings on macOS too; -o - leaves the signed input file untouched.
        if file.suffix != '.strings' or not shutil.which('plutil'):
            raise
        result = subprocess.run(['plutil', '-convert', 'xml1', '-o', '-', str(file)],
                                capture_output=True, check=True, timeout=20)
        value = plistlib.loads(result.stdout)
    if not isinstance(value, dict):
        raise ValueError('PLIST_NOT_DICTIONARY')
    return value


def manifest_summary(file, app, issues):
    relative = str(file.relative_to(app))
    value = read_plist(file, app)
    result = {'path': relative, 'sha256': digest(file),
              'tracking': value.get('NSPrivacyTracking') if type(value.get('NSPrivacyTracking')) is bool else None, 'trackingDomainCount': 0,
              'accessedAPIs': [], 'collectedData': []}
    if 'NSPrivacyTracking' in value and type(value['NSPrivacyTracking']) is not bool:
        issues.append('MANIFEST_TRACKING_TYPE:' + relative)
    if value.get('NSPrivacyTracking') is True:
        issues.append('UNEXPECTED_TRACKING:' + relative)
    domains = value.get('NSPrivacyTrackingDomains', [])
    if not isinstance(domains, list) or any(not isinstance(d, str) for d in domains):
        issues.append('MANIFEST_DOMAINS_TYPE:' + relative)
    else:
        result['trackingDomainCount'] = len(domains)
        if domains:
            issues.append('UNEXPECTED_TRACKING_DOMAINS:' + relative)
    for key, kind, output in [
        ('NSPrivacyAccessedAPITypes', 'NSPrivacyAccessedAPIType', 'accessedAPIs'),
        ('NSPrivacyCollectedDataTypes', 'NSPrivacyCollectedDataType', 'collectedData'),
    ]:
        rows = value.get(key, [])
        if not isinstance(rows, list):
            issues.append('MANIFEST_ARRAY_TYPE:' + relative)
            continue
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get(kind), str) or not re.fullmatch(r'NSPrivacy[A-Za-z0-9]+', row[kind]):
                issues.append('MANIFEST_CATEGORY_INVALID:' + relative)
                continue
            item = {'type': row[kind]}
            array_key = 'NSPrivacyAccessedAPITypeReasons' if output == 'accessedAPIs' else 'NSPrivacyCollectedDataTypePurposes'
            values = row.get(array_key)
            pattern = r'[A-Z0-9]{4}\.\d+' if output == 'accessedAPIs' else r'NSPrivacyCollectedDataTypePurpose[A-Za-z0-9]+'
            if not isinstance(values, list) or not values or any(not isinstance(v, str) or not re.fullmatch(pattern, v) for v in values):
                issues.append('MANIFEST_REASON_OR_PURPOSE_INVALID:' + relative)
                values = []
            item['reasons' if output == 'accessedAPIs' else 'purposes'] = values
            if output == 'collectedData':
                for source, target in [('NSPrivacyCollectedDataTypeLinked', 'linked'), ('NSPrivacyCollectedDataTypeTracking', 'tracking')]:
                    item[target] = row.get(source)
                    if type(item[target]) is not bool:
                        item[target] = None
                        issues.append('MANIFEST_COLLECTION_BOOLEAN_INVALID:' + relative)
                if item['tracking'] is True:
                    issues.append('UNEXPECTED_COLLECTION_TRACKING:' + relative)
            result[output].append(item)
    return result


def inspect(archive, expected_build, podfile_lock=None):
    archive = Path(archive).resolve()
    issues, warnings = [], []
    report = {'format': 1, 'archiveName': archive.name,
              'scope': 'READ_ONLY_STATIC_INVENTORY', 'releaseReady': 'NOT_VERIFIED',
              'requiredReasonJustification': 'MANUAL_REVIEW_REQUIRED',
              'staticSDKCoverage': 'PODFILE_AND_XCODE_REVIEW_REQUIRED',
              'sdkSignatureProvenance': 'XCODE_REVIEW_REQUIRED',
              'runtimePermissions': 'NOT_VERIFIED', 'appPrivacyAnswers': 'NOT_VERIFIED',
              'sourceCommitBinding': 'BUILD_REPORT_REQUIRED',
              'issues': issues, 'warnings': warnings, 'privacyManifests': [],
              'permissions': {}, 'localizedPermissions': {}, 'frameworks': [],
              'binaries': [], 'bundleSignature': 'NOT_VERIFIED'}
    app = archive / 'Products/Applications/Lampy.app'
    if not archive.is_dir() or not app.is_dir() or app.is_symlink() or not app.resolve().is_relative_to(archive):
        issues.append('ARCHIVE_OR_APP_MISSING')
        report['staticChecks'] = 'BLOCKED'
        return report
    try:
        info = read_plist(app / 'Info.plist', app)
        report['app'] = {k: info.get(k) for k in (
            'CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion',
            'MinimumOSVersion', 'DTSDKName', 'DTXcodeBuild')}
        for key, expected in [('CFBundleIdentifier', 'app.lampy.ios'),
                              ('CFBundleShortVersionString', '1.0.0'),
                              ('CFBundleVersion', expected_build),
                              ('LampyBuildProfile', 'appstore-v1'),
                              ('LampyFamilyAPI', 'https://family.yunpura.com')]:
            if info.get(key) != expected:
                issues.append('PROFILE_MISMATCH:' + key)
        for key in ('LampyUnifiedPurchasesEnabled', 'LampyPaidExportEnabled', 'LampyEmailLoginEnabled'):
            if info.get(key) is not False:
                issues.append('CLOSED_SWITCH_NOT_FALSE:' + key)
        if info.get('LampyExportProductID') != '':
            issues.append('EXPORT_PRODUCT_NOT_EMPTY')
        report['infoPlistSha256'] = digest(app / 'Info.plist')
        for key in PERMISSIONS:
            text = info.get(key)
            report['permissions'][key] = text if isinstance(text, str) else None
            if not isinstance(text, str) or not text.strip():
                issues.append('PERMISSION_PURPOSE_MISSING:' + key)
        for key in info:
            if key.startswith('NS') and key.endswith('UsageDescription') and key not in PERMISSIONS:
                issues.append('UNEXPECTED_PERMISSION:' + key)
        if info.get('UIBackgroundModes'):
            issues.append('UNEXPECTED_BACKGROUND_MODES')
        if info.get('NSAppTransportSecurity', {}).get('NSAllowsArbitraryLoads') is True:
            issues.append('ARBITRARY_NETWORK_LOADS_ENABLED')
    except Exception:
        issues.append('APP_PLIST_UNREADABLE')
    for directory, dirs, files in os.walk(app, followlinks=False, onerror=lambda error: issues.append('BUNDLE_DIRECTORY_UNREADABLE')):
        directory = Path(directory)
        for name in list(dirs):
            if (directory / name).is_symlink():
                dirs.remove(name)
                warnings.append('SYMLINK_NOT_SCANNED:' + str((directory / name).relative_to(app)))
        for name in sorted(files):
            file = directory / name
            if file.is_symlink():
                warnings.append('SYMLINK_NOT_SCANNED:' + str(file.relative_to(app)))
                continue
            relative = str(file.relative_to(app))
            if name == 'PrivacyInfo.xcprivacy':
                try:
                    report['privacyManifests'].append(manifest_summary(file, app, issues))
                except Exception:
                    issues.append('MANIFEST_UNREADABLE:' + relative)
            if name == 'Info.plist' and directory.suffix == '.framework':
                try:
                    item = read_plist(file, app)
                    report['frameworks'].append({'path': str(directory.relative_to(app)),
                        'bundleId': item.get('CFBundleIdentifier'),
                        'version': item.get('CFBundleShortVersionString')})
                except Exception:
                    issues.append('FRAMEWORK_PLIST_UNREADABLE:' + relative)
            try:
                with file.open('rb') as stream:
                    magic = stream.read(4).hex()
                if magic in MACHO or name == 'main.jsbundle':
                    report['binaries'].append({'path': relative, 'sha256': digest(file)})
            except OSError:
                issues.append('BUNDLE_FILE_UNREADABLE:' + relative)
    for locale in ('en', 'zh-Hans'):
        file = app / (locale + '.lproj') / 'InfoPlist.strings'
        try:
            localized = read_plist(file, app)
            report['localizedPermissions'][locale] = {k: localized.get(k) for k in PERMISSIONS}
            for key in PERMISSIONS:
                if not isinstance(localized.get(key), str) or not localized[key].strip():
                    issues.append('LOCALIZED_PURPOSE_MISSING:' + locale + ':' + key)
            if 'NSPhotoLibraryAddUsageDescription' in localized:
                issues.append('UNUSED_PHOTO_ADDITION_LOCALIZATION:' + locale)
        except Exception:
            issues.append('LOCALIZED_PLIST_UNREADABLE:' + locale)
    if not any(m['path'] == 'PrivacyInfo.xcprivacy' for m in report['privacyManifests']):
        issues.append('APP_MANIFEST_MISSING')
    if not any(b['path'] == 'main.jsbundle' for b in report['binaries']):
        issues.append('JS_BUNDLE_MISSING')
    if not report['privacyManifests']:
        issues.append('NO_PRIVACY_MANIFESTS')
    if podfile_lock:
        lock = Path(podfile_lock)
        try:
            text = lock.read_text().split('\nDEPENDENCIES:')[0]
            report['podfileLock'] = {'sha256': digest(lock),
                'pods': sorted(set(re.findall(r'^  - ([^\n:]+):?$', text, re.M))),
                'matchesArchive': 'NOT_VERIFIED'}
        except Exception:
            issues.append('PODFILE_LOCK_UNREADABLE')
    if shutil.which('codesign'):
        try:
            result = subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)],
                                    capture_output=True, timeout=120)
            report['bundleSignature'] = 'PASS' if result.returncode == 0 else 'FAILED'
            if result.returncode:
                issues.append('BUNDLE_SIGNATURE_FAILED')
        except Exception:
            issues.append('BUNDLE_SIGNATURE_CHECK_FAILED')
    report['privacyManifests'].sort(key=lambda m: m['path'])
    report['issues'] = sorted(set(issues))
    report['staticChecks'] = 'BLOCKED' if issues else 'PASS'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True)
    parser.add_argument('--expected-build', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--podfile-lock')
    args = parser.parse_args()
    archive, output = Path(args.archive).resolve(), Path(args.output).resolve()
    if not re.fullmatch(r'[1-9]\d*', args.expected_build):
        parser.error('expected-build must be a positive build number')
    if output == archive or archive in output.parents:
        parser.error('output must be outside the signed archive')
    report = inspect(archive, args.expected_build, args.podfile_lock)
    output.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.privacy-', dir=output)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        os.replace(temporary, output / 'archive-privacy.json')
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps({'staticChecks': report['staticChecks'],
                      'issues': report['issues'],
                      'privacyManifestCount': len(report['privacyManifests']),
                      'bundleSignature': report['bundleSignature'],
                      'releaseReady': 'NOT_VERIFIED',
                      'report': str(output / 'archive-privacy.json')}, ensure_ascii=False))
    return 1 if report['issues'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
