import { Redirect } from 'expo-router';
/** Preserve old profile links; editing now belongs to Settings. */
export default function FamilyProfile() { return <Redirect href="/account"/>; }
