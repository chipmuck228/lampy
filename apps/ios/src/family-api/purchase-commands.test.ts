import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createFamilyCommands} from './commands';
import {createMapAppleVerifier} from './apple';
import {createFamilyStore} from './store';
import {createMemoryFamilyRepository} from './repository';
import {openFamilySqliteDatabase} from './node-db';
import {applyFamilyApiSchema} from './schema';
import {createSqliteFamilyRepository} from './sqlite-repository';
import {dispatchFamilyApi} from './http';
import type {VerifiedPurchase} from './purchase-types';

async function fixture(file?:string) {
  const store=createFamilyStore();
  const db=file?openFamilySqliteDatabase(file):null;
  if(db)await applyFamilyApiSchema(db);
  const repository=db?createSqliteFamilyRepository(db):createMemoryFamilyRepository(store);
  const transactions=new Map<string,VerifiedPurchase>();
  const verify=jest.fn(async(id:string)=>{const tx=transactions.get(id);if(!tx)throw Error('upstream unavailable');return {...tx};});
  const commands=createFamilyCommands({repository,apple:createMapAppleVerifier({a:{appleSubject:'a'},b:{appleSubject:'b'}}),historySharingEnabled:true,familyAlbumsEnabled:true,unifiedPurchasesEnabled:true,unifiedProductId:'configured.unified',purchaseVerifier:{environment:'Sandbox',verify}});
  const a=await commands.signInWithApple('a'),b=await commands.signInWithApple('b');
  async function buy(session:string,id:string) {
    const context=await commands.purchases.context(session);
    transactions.set(id,{originalTransactionId:id,transactionId:id,environment:'Sandbox',productId:'configured.unified',appAccountToken:context.appAccountToken,revoked:false,signedAt:100});
    return commands.purchases.claim(session,id);
  }
  async function addB(familyId:string) {await repository.withTransaction(async tx=>tx.saveMembership({membershipId:'b-'+familyId,userId:b.userId,familyId,role:'member',status:'active',joinedAt:new Date().toISOString()}));}
  return {commands,a,b,buy,transactions,verify,repository,db,addB};
}

describe.each(['memory','sqlite'] as const)('unified purchase policy (%s)',kind=>{
  let dir:string;
  let f:Awaited<ReturnType<typeof fixture>>;
  beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'lampy-purchases-'));f=await fixture(kind==='sqlite'?path.join(dir,'family.db'):undefined);});
  afterEach(async()=>{await f.db?.close();await rm(dir,{recursive:true,force:true});});
  it('family creation is free and idempotent regardless of purchase state',async()=>{
    const one=await f.commands.createNamedFamily(f.a.sessionToken,'One','one');
    expect(await f.commands.createNamedFamily(f.a.sessionToken,'One','one')).toEqual(one);
    expect((await f.commands.createNamedFamily(f.a.sessionToken,'Two','two')).role).toBe('creator');
    await f.commands.dissolveFamily(f.a.sessionToken,one.familyId);
    expect((await f.commands.createNamedFamily(f.a.sessionToken,'Two','two')).role).toBe('creator');
    expect(f.verify).not.toHaveBeenCalled();
  });
  it('allows concurrent free creation while preserving the legacy route compatibility limits',async()=>{
    const results=await Promise.allSettled([f.commands.createNamedFamily(f.a.sessionToken,'One','one'),f.commands.createNamedFamily(f.a.sessionToken,'Two','two')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
    await expect(f.commands.createFamily(f.a.sessionToken,'legacy')).rejects.toBeDefined();
    expect((await f.commands.listFamilies(f.a.sessionToken)).families).toHaveLength(2);
  });
  it('verified purchase records a durable family export source',async()=>{
    await f.commands.createNamedFamily(f.a.sessionToken,'Free','free');
    expect((await f.buy(f.a.sessionToken,'100')).owned).toBe(true);
    const paid=await f.commands.createNamedFamily(f.a.sessionToken,'Paid','paid');
    expect((await f.commands.purchases.familyAccess(f.a.sessionToken,paid.familyId))).toMatchObject({eligible:true,canExport:false});
    await f.repository.withTransaction(async tx=>expect(await tx.listPurchaseGrants(paid.familyId)).toEqual([expect.objectContaining({purchaseKey:'Sandbox:100',unlockedBy:f.a.userId})]));
  });
  it('transfer moves only this family authority, preserves purchase owner and traces later refunds',async()=>{
    await f.buy(f.a.sessionToken,'100');
    const family=await f.commands.createNamedFamily(f.a.sessionToken,'Family','family');
    await f.addB(family.familyId);
    const members=await f.repository.withTransaction(tx=>tx.listActiveMembers(family.familyId));
    const transfer=await f.commands.transfers.create(f.a.sessionToken,family.familyId,{requestId:'transfer',fromMembershipId:members.find(m=>m.userId===f.a.userId)!.membershipId,toMembershipId:members.find(m=>m.userId===f.b.userId)!.membershipId});
    await f.commands.transfers.respond(f.b.sessionToken,family.familyId,transfer.transferId,transfer.revision,'accept');
    expect(await f.commands.purchases.familyAccess(f.b.sessionToken,family.familyId)).toMatchObject({eligible:true});
    expect(await f.commands.purchases.familyAccess(f.a.sessionToken,family.familyId)).toMatchObject({eligible:false,reason:'not-creator'});
    expect((await f.commands.purchases.context(f.b.sessionToken)).owned).toBe(false);
    expect((await f.commands.purchases.context(f.a.sessionToken)).owned).toBe(true);
    f.transactions.get('100')!.revoked=true;
    expect(await f.commands.purchases.familyAccess(f.b.sessionToken,family.familyId)).toMatchObject({eligible:false,reason:'locked'});
    expect((await f.commands.listFamilies(f.a.sessionToken)).families).toHaveLength(1);
    expect((await f.commands.listFamilies(f.b.sessionToken)).families).toHaveLength(1);
    await f.buy(f.b.sessionToken,'200');
    expect(await f.commands.purchases.unlockFamily(f.b.sessionToken,family.familyId)).toMatchObject({eligible:true});
    expect((await f.commands.purchases.context(f.a.sessionToken)).owned).toBe(false);
  });
  it('rejects token theft, fake ownership and wrong products; only a creator can attach a source',async()=>{
    await f.buy(f.a.sessionToken,'100');
    await expect(f.commands.purchases.claim(f.b.sessionToken,'100')).rejects.toMatchObject({code:'PURCHASE_ACCOUNT_MISMATCH'});
    const family=await f.commands.createNamedFamily(f.a.sessionToken,'Family','f');await f.addB(family.familyId);
    await expect(f.commands.purchases.unlockFamily(f.b.sessionToken,family.familyId)).rejects.toMatchObject({code:'FORBIDDEN'});
    f.transactions.get('100')!.productId='wrong';
    await expect(f.commands.purchases.claim(f.a.sessionToken,'100')).rejects.toMatchObject({code:'PURCHASE_INVALID'});
    const response=await dispatchFamilyApi(f.commands,{method:'POST',path:'/v2/me/purchase-access',headers:{authorization:`Bearer ${f.b.sessionToken}`},body:{owned:true}});
    expect(response.status).toBe(400);
  });
  it('refund blocks paid capabilities, but never blocks free family creation',async()=>{
    await f.buy(f.a.sessionToken,'100');
    const first=await f.commands.createNamedFamily(f.a.sessionToken,'First','first');
    f.transactions.get('100')!.revoked=true;
    expect((await f.commands.purchases.context(f.a.sessionToken)).owned).toBe(false);
    expect((await f.commands.createNamedFamily(f.a.sessionToken,'Second','second')).role).toBe('creator');
    expect((await f.commands.listFamilies(f.a.sessionToken)).families.some(row=>row.familyId===first.familyId)).toBe(true);
    f.transactions.get('100')!.revoked=false;
    expect((await f.commands.purchases.claim(f.a.sessionToken,'100')).owned).toBe(false);
  });
  it('verification failures deny new paid actions but do not affect ordinary reads',async()=>{
    await f.buy(f.a.sessionToken,'100');const family=await f.commands.createNamedFamily(f.a.sessionToken,'First','first');
    f.verify.mockRejectedValue(Error('network'));
    await expect(f.commands.purchases.familyAccess(f.a.sessionToken,family.familyId)).rejects.toThrow('network');
    expect((await f.commands.listFamilies(f.a.sessionToken)).families).toHaveLength(1);
    expect((await f.commands.createNamedFamily(f.a.sessionToken,'Second','second')).role).toBe('creator');
  });
  it('the first free family does not depend on Apple purchase availability',async()=>{
    await f.buy(f.a.sessionToken,'100');f.verify.mockClear();f.verify.mockRejectedValue(Error('network'));
    expect((await f.commands.createNamedFamily(f.a.sessionToken,'Free','free')).role).toBe('creator');
    expect(f.verify).not.toHaveBeenCalled();
  });
  it('accepting a transfer is free even for an existing creator, but does not grant personal ownership',async()=>{
    await f.commands.createNamedFamily(f.b.sessionToken,'B family','b-family');
    await f.buy(f.a.sessionToken,'100');
    const family=await f.commands.createNamedFamily(f.a.sessionToken,'A family','a-family');await f.addB(family.familyId);
    const members=await f.repository.withTransaction(tx=>tx.listActiveMembers(family.familyId));
    const transfer=await f.commands.transfers.create(f.a.sessionToken,family.familyId,{requestId:'give',fromMembershipId:members.find(m=>m.userId===f.a.userId)!.membershipId,toMembershipId:members.find(m=>m.userId===f.b.userId)!.membershipId});
    await f.commands.transfers.respond(f.b.sessionToken,family.familyId,transfer.transferId,transfer.revision,'accept');
    expect((await f.commands.purchases.context(f.b.sessionToken))).toMatchObject({owned:false,createdFamilyCount:2,canCreateFamily:true});
    expect((await f.commands.purchases.familyAccess(f.b.sessionToken,family.familyId)).eligible).toBe(true);
    expect((await f.commands.createNamedFamily(f.b.sessionToken,'Another','another')).role).toBe('creator');
  });
  it('denies an in-flight unlock after creator transfer and leaves the grant owner unchanged',async()=>{
    await f.buy(f.a.sessionToken,'100');const family=await f.commands.createNamedFamily(f.a.sessionToken,'Family','family');await f.addB(family.familyId);
    const members=await f.repository.withTransaction(tx=>tx.listActiveMembers(family.familyId));
    const transfer=await f.commands.transfers.create(f.a.sessionToken,family.familyId,{requestId:'give',fromMembershipId:members.find(m=>m.userId===f.a.userId)!.membershipId,toMembershipId:members.find(m=>m.userId===f.b.userId)!.membershipId});
    f.verify.mockImplementationOnce(async id=>{
      await f.commands.transfers.respond(f.b.sessionToken,family.familyId,transfer.transferId,transfer.revision,'accept');
      return {...f.transactions.get(id)!};
    });
    await expect(f.commands.purchases.unlockFamily(f.a.sessionToken,family.familyId)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect((await f.commands.purchases.familyAccess(f.b.sessionToken,family.familyId)).eligible).toBe(true);
  });
  it('a newer verified reversal may restore a purchase but an older payload cannot undo a refund',async()=>{
    await f.buy(f.a.sessionToken,'100');f.transactions.get('100')!.revoked=true;f.transactions.get('100')!.signedAt=200;
    expect((await f.commands.purchases.context(f.a.sessionToken)).owned).toBe(false);
    f.transactions.get('100')!.revoked=false;f.transactions.get('100')!.signedAt=100;
    expect((await f.commands.purchases.claim(f.a.sessionToken,'100')).owned).toBe(false);
    f.transactions.get('100')!.signedAt=300;
    expect((await f.commands.purchases.claim(f.a.sessionToken,'100')).owned).toBe(true);
  });
});

it('purchase tokens, family grants and source owner survive SQLite reopen',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-purchase-reopen-'));const file=path.join(dir,'family.db');const f=await fixture(file);
 try {
  const before=await f.buy(f.a.sessionToken,'100');const family=await f.commands.createNamedFamily(f.a.sessionToken,'Family','family');await f.db!.close();
  const db=openFamilySqliteDatabase(file);f.db=db;
  const commands=createFamilyCommands({repository:createSqliteFamilyRepository(db),apple:createMapAppleVerifier({a:{appleSubject:'a'}}),unifiedPurchasesEnabled:true,unifiedProductId:'configured.unified',purchaseVerifier:{environment:'Sandbox',verify:f.verify}});
  expect((await commands.purchases.context(f.a.sessionToken)).appAccountToken).toBe(before.appAccountToken);
  expect((await commands.purchases.familyAccess(f.a.sessionToken,family.familyId)).eligible).toBe(true);
  f.transactions.get('100')!.revoked=true;f.transactions.get('100')!.signedAt=200;
  expect((await commands.purchases.familyAccess(f.a.sessionToken,family.familyId)).eligible).toBe(false);
 } finally {await f.db!.close();await rm(dir,{recursive:true,force:true});}
});

it('purchase claims are durably rate limited without granting arbitrary transaction IDs',async()=>{
 const f=await fixture();
 for(let i=0;i<40;i++)await expect(f.commands.purchases.claim(f.a.sessionToken,String(100+i))).rejects.toThrow('upstream unavailable');
 await expect(f.commands.purchases.claim(f.a.sessionToken,'999')).rejects.toMatchObject({code:'PURCHASE_RATE_LIMITED'});
 expect(f.verify).toHaveBeenCalledTimes(40);
 expect((await f.commands.purchases.context(f.a.sessionToken)).owned).toBe(false);
});

it('migration 31 rolls back atomically and preserves older tables on failure',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'lampy-purchase-migration-'));const db=openFamilySqliteDatabase(path.join(dir,'family.db'));
 try {
  await applyFamilyApiSchema(db,{upTo:30});const before=await db.getAll('SELECT * FROM family_schema_migrations');
  await expect(applyFamilyApiSchema({...db,run:async(sql,params)=>{if(sql.includes('family_schema_migrations')&&params?.[0]===31)throw Error('disk full');return db.run(sql,params);}})).rejects.toThrow('disk full');
  expect(await db.getFirst("SELECT name FROM sqlite_master WHERE name='family_purchases'")).toBeNull();
  expect(await db.getAll('SELECT * FROM family_schema_migrations')).toEqual(before);
  await applyFamilyApiSchema(db);expect(await db.getFirst('SELECT MAX(version) AS version FROM family_schema_migrations')).toEqual({version:34});
 } finally {await db.close();await rm(dir,{recursive:true,force:true});}
});

it('production ignores historical Sandbox purchases and family sources in the same database',async()=>{
 const f=await fixture();await f.buy(f.a.sessionToken,'100');const family=await f.commands.createNamedFamily(f.a.sessionToken,'Family','family');
 const verify=jest.fn(async()=>{throw Error('must not query a Sandbox ID against production');});
 const production=createFamilyCommands({repository:f.repository,apple:createMapAppleVerifier({}),unifiedPurchasesEnabled:true,unifiedProductId:'configured.unified',purchaseVerifier:{environment:'Production',verify}});
 expect((await production.purchases.context(f.a.sessionToken)).owned).toBe(false);
 expect((await production.purchases.familyAccess(f.a.sessionToken,family.familyId)).eligible).toBe(false);
 expect(verify).not.toHaveBeenCalled();
});
