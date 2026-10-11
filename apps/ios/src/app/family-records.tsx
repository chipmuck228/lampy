import { useLocalSearchParams } from 'expo-router';
import { FamilyHistoryScreen } from '../screens/family-history-screen';
export default function FamilyRecordsRoute() {
  const { familyId } = useLocalSearchParams<{familyId?:string|string[]}>();
  return <FamilyHistoryScreen familyId={Array.isArray(familyId) ? familyId[0] : familyId || ''} />;
}
