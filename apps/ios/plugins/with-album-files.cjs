const { withInfoPlist } = require('expo/config-plugins');
module.exports = config => withInfoPlist(config, config => {
  const type = 'app.lampy.album';
  const plist = config.modResults;
  plist.UTExportedTypeDeclarations = [
    ...(plist.UTExportedTypeDeclarations || []).filter(item => item.UTTypeIdentifier !== type),
    {UTTypeIdentifier: type, UTTypeDescription: 'Lampy life album', UTTypeConformsTo: ['public.data', 'public.content'],
      UTTypeTagSpecification: {'public.filename-extension': ['lampy'], 'public.mime-type': 'application/vnd.lampy.album'}},
  ];
  plist.CFBundleDocumentTypes = [
    ...(plist.CFBundleDocumentTypes || []).filter(item => !(item.LSItemContentTypes || []).includes(type)),
    {CFBundleTypeName: 'Lampy life album', CFBundleTypeRole: 'Viewer', LSHandlerRank: 'Owner', LSItemContentTypes: [type]},
  ];
  plist.LSSupportsOpeningDocumentsInPlace = true;
  plist.UIFileSharingEnabled = false;
  return config;
});
