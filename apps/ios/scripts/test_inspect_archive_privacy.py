import importlib.util
import json
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('inspect-archive-privacy.py')
spec = importlib.util.spec_from_file_location('archive_privacy', SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class ArchivePrivacyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / 'Lampy.xcarchive'
        self.app = self.archive / 'Products/Applications/Lampy.app'
        self.app.mkdir(parents=True)
        self.info = {'CFBundleIdentifier': 'app.lampy.ios',
                     'CFBundleShortVersionString': '1.0.0', 'CFBundleVersion': '17',
                     'LampyBuildProfile': 'appstore-v1',
                     'LampyFamilyAPI': 'https://family.yunpura.com',
                     'LampyUnifiedPurchasesEnabled': False, 'LampyPaidExportEnabled': False,
                     'LampyEmailLoginEnabled': False, 'LampyExportProductID': '',
                     **{k: 'Purpose ' + k for k in audit.PERMISSIONS}}
        self.write('Info.plist', self.info)
        for locale in ('en', 'zh-Hans'):
            self.write(locale + '.lproj/InfoPlist.strings',
                       {k: locale + ' purpose' for k in audit.PERMISSIONS})
        self.manifest = {'NSPrivacyTracking': False, 'NSPrivacyTrackingDomains': [],
                         'NSPrivacyCollectedDataTypes': [], 'NSPrivacyAccessedAPITypes': [
                             {'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategoryUserDefaults',
                              'NSPrivacyAccessedAPITypeReasons': ['CA92.1']}]}
        self.write('PrivacyInfo.xcprivacy', self.manifest)
        self.write('Frameworks/Test.framework/PrivacyInfo.xcprivacy', self.manifest)
        self.write('Frameworks/Test.framework/Info.plist',
                   {'CFBundleIdentifier': 'test.sdk', 'CFBundleShortVersionString': '1.2'})
        (self.app / 'Frameworks/Test.framework/Test').write_bytes(bytes.fromhex('cffaedfe') + b'synthetic')
        (self.app / 'main.jsbundle').write_bytes(b'synthetic bundle')

    def write(self, relative, value):
        file = self.app / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(plistlib.dumps(value, fmt=plistlib.FMT_BINARY))

    def inspect(self):
        with patch.object(audit.shutil, 'which', return_value=None):
            return audit.inspect(self.archive, '17')

    def hashes(self):
        return {str(p.relative_to(self.archive)): audit.digest(p)
                for p in self.archive.rglob('*') if p.is_file()}

    def test_inventory_reads_binary_plists_without_modifying_archive_or_claiming_approval(self):
        before = self.hashes()
        report = self.inspect()
        self.assertEqual(report['staticChecks'], 'PASS')
        self.assertEqual(len(report['privacyManifests']), 2)
        self.assertEqual(report['frameworks'][0]['version'], '1.2')
        self.assertEqual(len(report['binaries']), 2)
        self.assertEqual(report['bundleSignature'], 'NOT_VERIFIED')
        self.assertEqual(report['releaseReady'], 'NOT_VERIFIED')
        self.assertEqual(report['requiredReasonJustification'], 'MANUAL_REVIEW_REQUIRED')
        self.assertEqual(before, self.hashes())

    def test_checks_each_sdk_manifest_tracking_and_reason_structure(self):
        self.manifest.update(NSPrivacyTracking=True, NSPrivacyTrackingDomains=['tracking.example'])
        self.manifest['NSPrivacyAccessedAPITypes'][0]['NSPrivacyAccessedAPITypeReasons'] = []
        self.write('Frameworks/Test.framework/PrivacyInfo.xcprivacy', self.manifest)
        report = self.inspect()
        self.assertEqual(report['staticChecks'], 'BLOCKED')
        self.assertTrue(any(i.startswith('UNEXPECTED_TRACKING:') for i in report['issues']))
        self.assertTrue(any(i.startswith('MANIFEST_REASON_OR_PURPOSE_INVALID:') for i in report['issues']))

    def test_rejects_undeclared_permissions_paid_switches_and_missing_localization(self):
        self.info.update(NSPhotoLibraryAddUsageDescription='unused',
                         LampyPaidExportEnabled=True, UIBackgroundModes=['audio'])
        self.write('Info.plist', self.info)
        (self.app / 'en.lproj/InfoPlist.strings').unlink()
        issues = self.inspect()['issues']
        self.assertIn('UNEXPECTED_PERMISSION:NSPhotoLibraryAddUsageDescription', issues)
        self.assertIn('CLOSED_SWITCH_NOT_FALSE:LampyPaidExportEnabled', issues)
        self.assertIn('LOCALIZED_PLIST_UNREADABLE:en', issues)
        self.assertIn('UNEXPECTED_BACKGROUND_MODES', issues)

    def test_bad_or_missing_manifests_are_blocked_without_printing_raw_values(self):
        (self.app / 'PrivacyInfo.xcprivacy').write_text('private-secret-invalid-plist')
        report = self.inspect()
        self.assertIn('APP_MANIFEST_MISSING', report['issues'])
        self.assertNotIn('private-secret', json.dumps(report))

    def test_expected_build_and_source_lock_do_not_fake_archive_binding(self):
        lock = self.root / 'Podfile.lock'
        lock.write_text('PODS:\n  - Example (1.2.3)\n\nDEPENDENCIES:\n  - Example\n')
        with patch.object(audit.shutil, 'which', return_value=None):
            report = audit.inspect(self.archive, '18', lock)
        self.assertIn('PROFILE_MISMATCH:CFBundleVersion', report['issues'])
        self.assertEqual(report['podfileLock']['matchesArchive'], 'NOT_VERIFIED')
        self.assertEqual(report['podfileLock']['pods'], ['Example (1.2.3)'])

    def test_localization_symlink_cannot_read_outside_archive(self):
        file = self.app / 'en.lproj/InfoPlist.strings'
        file.unlink()
        external = self.root / 'private.plist'
        external.write_bytes(plistlib.dumps({'secret': 'do-not-copy'}))
        file.symlink_to(external)
        report = self.inspect()
        self.assertIn('LOCALIZED_PLIST_UNREADABLE:en', report['issues'])
        self.assertNotIn('do-not-copy', json.dumps(report))

    def test_signature_failure_is_not_reported_as_verified(self):
        with patch.object(audit.shutil, 'which', return_value='/usr/bin/codesign'), \
             patch.object(audit.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)):
            report = audit.inspect(self.archive, '17')
        self.assertIn('BUNDLE_SIGNATURE_FAILED', report['issues'])
        self.assertEqual(report['bundleSignature'], 'FAILED')

    def test_cli_refuses_output_inside_signed_archive(self):
        before = self.hashes()
        result = subprocess.run([sys.executable, str(SCRIPT), '--archive', str(self.archive),
                                 '--expected-build', '17', '--output', str(self.archive / 'report')],
                                capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(before, self.hashes())

    def test_source_permissions_match_supported_features_and_locales(self):
        ios = SCRIPT.parent.parent
        config = json.loads((ios / 'app.json').read_text())['expo']['ios']['infoPlist']
        for value in (config, *(json.loads((ios / 'locales' / (locale + '.json')).read_text())['ios']
                                for locale in ('en', 'zh-Hans'))):
            self.assertNotIn('NSPhotoLibraryAddUsageDescription', value)
            for key in audit.PERMISSIONS:
                self.assertTrue(value[key].strip())


if __name__ == '__main__':
    unittest.main()
