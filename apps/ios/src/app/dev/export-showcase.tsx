import { Redirect, useLocalSearchParams } from 'expo-router';
import AlbumExportDemoScreen from '../../screens/album-export-demo-screen';

/** Dev builds only: lampy://dev/export-showcase[?state=owned|binding|bound&pos=1.3&style=handmade&scroll=640] */
export default function DevExportShowcase() {
  const params = useLocalSearchParams();
  if (typeof __DEV__ === 'undefined' || !__DEV__) return <Redirect href="/" />;
  // Each review link starts a fresh book rather than reusing a held one.
  return <AlbumExportDemoScreen key={JSON.stringify(params)} />;
}
