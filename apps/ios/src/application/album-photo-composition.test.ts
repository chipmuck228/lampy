import {planPhotoComposition,photoFit,PHOTO_SAFE_AREA} from './album-photo-composition';
const photo=(ratio:number|null)=>({assetId:'p',role:'image' as const,availability:'available' as const,intrinsicRatio:ratio,durationMs:null});
const coverage=(rs:number[])=>{const plan=planPhotoComposition(rs.map(photo))!;return plan.photos.reduce((n,p)=>n+p.width*p.height,0)/(PHOTO_SAFE_AREA.width*PHOTO_SAFE_AREA.height);};
it('supports only zero to three photos in this composition planner',()=>{
 expect(planPhotoComposition([])).toBeNull();expect(planPhotoComposition(Array(4).fill(photo(1)))).toBeNull();
});
it('replaces skinny stacked portraits with a large aligned row, keeping original ratios',()=>{
 const rs=[.75,.75],plan=planPhotoComposition(rs.map(photo))!;
 expect(plan.kind).toBe('photo-row');expect(coverage(rs)).toBeGreaterThan(.9);
 expect(plan.photos[0].y).toBeCloseTo(plan.photos[1].y);expect(plan.photos[0].width).toBeGreaterThan(500);
 plan.photos.forEach((p,i)=>expect(p.width/p.height).toBeCloseTo(rs[i]));
});
it('compares three-photo arrangements to avoid a tiny portrait above two scattered landscapes',()=>{
 const rs=[.75,4/3,4/3],plan=planPhotoComposition(rs.map(photo))!;
 expect(plan.kind).toBe('side-three');expect(coverage(rs)).toBeGreaterThan(.8);
 plan.photos.forEach((p,i)=>expect(p.width/p.height).toBeCloseTo(rs[i]));
 const portraits=planPhotoComposition([photo(.75),photo(.75),photo(.75)])!;expect(portraits.kind).toBe('portrait-sequence');expect(coverage([.75,.75,.75])).toBeGreaterThan(.6);
});
it('chooses vertical stacking for panoramas when it gives larger photographs',()=>{
 expect(planPhotoComposition([photo(2),photo(2)])!.kind).toBe('two-stacked');expect(coverage([2,2])).toBeGreaterThan(.6);
});
it('only crops when at least 82 percent of the original frame remains',()=>{
 expect(photoFit(photo(1.5),1.6)).toBe('cover');expect(photoFit(photo(.6),1.6)).toBe('contain');expect(photoFit(photo(null),1)).toBe('contain');expect(photoFit(photo(1.5),0)).toBe('contain');
});
it('keeps all photo and text rectangles inside a consistent safe area with no overlap',()=>{
 for(const rs of [[.75],[4/3],[2.2],[.75,.75],[4/3,.75],[.75,4/3,4/3],[4/3,4/3,4/3],[.75,.75,.75]])for(const hasNote of [true,false])for(const alternate of [true,false]){
  const plan=planPhotoComposition(rs.map(photo),hasNote,alternate)!;
  const all=[...plan.photos,...plan.text];
  for(const b of all){expect(b.x).toBeGreaterThanOrEqual(64-1e-6);expect(b.y).toBeGreaterThanOrEqual(128-1e-6);expect(b.x+b.width).toBeLessThanOrEqual(1136+1e-6);expect(b.y+b.height).toBeLessThanOrEqual(828+1e-6);expect(b.width).toBeGreaterThan(0);expect(b.height).toBeGreaterThan(0);}
  all.forEach((a,i)=>all.slice(i+1).forEach(b=>expect(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<=1e-6||Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<=1e-6).toBe(true)));
 }
});
it('preserves the accepted three-image prose quadrant and gives single photos real dimensions',()=>{
 expect(planPhotoComposition([photo(4/3),photo(4/3),photo(4/3)],true)!.kind).toBe('three-story');
 const p=planPhotoComposition([photo(4/3)],true)!.photos[0];expect(p.width).toBeGreaterThan(600);expect(p.width/p.height).toBeCloseTo(4/3);
});
