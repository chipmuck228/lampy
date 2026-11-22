import { ApplicationError } from '../application/errors';
import type { FamilySessionStore } from '../application/family-use-cases';
import type { FamilyTransport } from './family-http-client';

/** Applies to metadata, uploads and media bodies. Discard even if native fetch ignores abort. */
export function createSessionGuardedFamilyTransport(transport: FamilyTransport, session: FamilySessionStore): FamilyTransport {
  return {
    async request(input) {
      // Revocation may intentionally target an old/discarded token and has no account data response.
      if (!input.sessionToken || input.path === '/v1/auth/sign-out') return transport.request(input);
      const revision = session.getRevision?.();
      const snapshot = session.getSession ? await session.getSession() : {
        userId: await session.getUserId(), sessionToken: await session.getSessionToken(),
      };
      const stale = () => new ApplicationError('STALE_FAMILY_REQUEST', 'The account changed during this request.');
      async function check() {
        if (!snapshot?.userId || snapshot.sessionToken !== input.sessionToken || revision !== session.getRevision?.()) throw stale();
        const current = session.getSession ? await session.getSession() : {
          userId: await session.getUserId(), sessionToken: await session.getSessionToken(),
        };
        if (revision !== session.getRevision?.() || current?.userId !== snapshot.userId || current?.sessionToken !== snapshot.sessionToken) throw stale();
      }
      await check();
      const controller = new AbortController();
      let cancel!: () => void;
      const cancelled = new Promise<never>((_,reject) => {cancel=()=>{controller.abort();reject(stale());};});
      void cancelled.catch(()=>undefined);
      const unsubscribe = session.subscribe?.(cancel);
      input.signal?.addEventListener('abort',cancel,{once:true});
      if(input.signal?.aborted)cancel();
      try {
        // Close the window between the initial check and listener registration.
        await check();
        if(controller.signal.aborted)throw stale();
        const result = await Promise.race([transport.request({...input,signal:controller.signal}),cancelled]);
        await check();
        return result;
      } catch (error) {
        // A delayed 401 for A must never sign out B.
        await check();
        throw error;
      } finally {unsubscribe?.();input.signal?.removeEventListener('abort',cancel);}
    },
  };
}
