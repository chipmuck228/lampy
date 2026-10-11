import { createFamilyDirectory } from './family-directory';
import type { FamilyListView } from '../family-api/types';
const list = (id: string): FamilyListView => ({ families: [{ familyId:id,name:id,role:'member',memberCount:2 }],limit:10 });
it('hides old families while refreshing and refuses old account results', async () => {
  const directory = createFamilyDirectory();
  await directory.load(async () => list('A'));
  expect(directory.select('A')).toBe(true);
  let resolve!: (r: FamilyListView) => void;
  const old = directory.load(() => new Promise(r => { resolve = r; }));
  expect(directory.snapshot().families).toEqual([]);
  directory.invalidate();
  await directory.load(async () => list('B'));
  resolve(list('A')); await old;
  expect(directory.snapshot().families[0].familyId).toBe('B');
  expect(directory.select('A')).toBe(false);
});
it('retains a selected id only when the fresh list still authorizes it; failure is not empty', async () => {
  const directory = createFamilyDirectory();
  await directory.load(async () => list('A')); directory.select('A');
  await directory.load(async () => list('A'));
  expect(directory.snapshot().selectedId).toBe('A');
  await directory.load(async () => list('B'));
  expect(directory.snapshot().selectedId).toBeNull();
  await directory.load(async () => { throw new Error('offline'); });
  expect(directory.snapshot()).toMatchObject({ status:'failed',families:[],selectedId:null });
});

it('distinguishes an absent or expired account from connectivity failure', async () => {
  const directory=createFamilyDirectory();
  await directory.load(async () => list('A'));
  await directory.load(async () => { throw {code:'UNAUTHENTICATED'}; });
  expect(directory.snapshot()).toMatchObject({status:'signed-out',families:[],selectedId:null});
  await directory.load(async () => { throw {code:'NETWORK'}; });
  expect(directory.snapshot().status).toBe('failed');
});

it('retains past rows without granting selection, then replaces the exact family on rejoin',async()=>{
 const directory=createFamilyDirectory();const past={familyId:'old',name:'Home',role:'member' as const,status:'left' as const};
 await directory.load(async()=>({families:[],pastFamilies:[past],limit:10}));
 expect(directory.snapshot().pastFamilies).toEqual([past]);expect(directory.select('old')).toBe(false);
 await directory.load(async()=>({families:[{familyId:'old',name:'Home',role:'member',memberCount:2}],limit:10}));
 expect(directory.snapshot().pastFamilies).toEqual([]);expect(directory.select('old')).toBe(true);
 directory.invalidate();expect(directory.snapshot().pastFamilies).toEqual([]);
});

it('does not expose old account history when its delayed directory request finishes',async()=>{
 const directory=createFamilyDirectory();let resolve!:(r:FamilyListView)=>void;
 const pending=directory.load(()=>new Promise(r=>{resolve=r;}));directory.invalidate();
 await directory.load(async()=>list('B'));resolve({families:[],pastFamilies:[{familyId:'A',name:'Private A',role:'creator',status:'dissolved'}],limit:10});await pending;
 expect(directory.snapshot().pastFamilies).toEqual([]);expect(directory.snapshot().families[0].familyId).toBe('B');
});
