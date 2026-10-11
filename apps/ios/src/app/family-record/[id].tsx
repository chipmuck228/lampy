import { useLocalSearchParams } from 'expo-router';
import { FamilyHistoryScreen } from '../../screens/family-history-screen';
export default function FamilyRecordRoute() {
  const { familyId,id } = useLocalSearchParams<{familyId?:string|string[];id?:string|string[]}>();
  return <FamilyHistoryScreen familyId={Array.isArray(familyId) ? familyId[0] : familyId || ''} shareId={Array.isArray(id) ? id[0] : id || ''} />;
}
