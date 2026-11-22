import { ApplicationError } from './errors';
import type { FamilySessionStore } from './family-use-cases';

export async function readFamilyAccount(session: FamilySessionStore) {
  const revision=session.getRevision?.();
  const value=session.getSession ? await session.getSession() : {userId:await session.getUserId(),sessionToken:await session.getSessionToken()};
  if(revision!==session.getRevision?.())throw new ApplicationError('STALE_FAMILY_REQUEST','Account changed.');
  if(!value?.userId||!value.sessionToken)throw new ApplicationError('UNAUTHENTICATED','Sign in is required.');
  return {userId:value.userId,sessionToken:value.sessionToken,revision};
}
