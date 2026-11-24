import {planPhotoComposition,photoFit} from './album-photo-composition';
const photo=(ratio:number|null)=>({assetId:'p',role:'image' as const,availability:'available' as const,intrinsicRatio:ratio,durationMs:null});
it('selects bounded one/two/three photo compositions without a four-photo template',()=>{
 expect(planPhotoComposition([])).toBeNull();expect(planPhotoComposition([photo(.7)],true)!.kind).toBe('portrait-story');expect(planPhotoComposition([photo(1.5)],true)!.kind).toBe('wide-story');expect(planPhotoComposition([photo(.7),photo(.8)])!.kind).toBe('two-stacked');expect(planPhotoComposition([photo(.7),photo(.8),photo(.7)])!.kind).toBe('portrait-sequence');expect(planPhotoComposition([photo(.7),photo(1.5),photo(1.5)])!.kind).toBe('top-three');expect(planPhotoComposition(Array(4).fill(photo(1)))).toBeNull();
});
it('only crops when at least 82 percent of the original frame remains',()=>{
 expect(photoFit(photo(1.5),1.6)).toBe('cover');expect(photoFit(photo(.6),1.6)).toBe('contain');expect(photoFit(photo(null),1)).toBe('contain');expect(photoFit(photo(1.5),0)).toBe('contain');
});

it('maps each supported count and prose combination to the reference layouts',()=>{
 expect(planPhotoComposition([photo(1.4)])!.kind).toBe('full-photo');
 expect(planPhotoComposition([photo(.7)],true,true)!.photos[0].x).toBe(600);
 expect(planPhotoComposition([photo(1.5),photo(1.5)],true)!.kind).toBe('two-story');
 const stacked=planPhotoComposition([photo(1.5),photo(1.5)])!;expect(stacked.photos[1].y).toBeGreaterThan(stacked.photos[0].y+stacked.photos[0].height);
 expect(planPhotoComposition([photo(1.5),photo(.8),photo(1.5)],true)!.kind).toBe('three-story');
 for(let count=1;count<=3;count++)for(const hasNote of [true,false]){
  const plan=planPhotoComposition(Array(count).fill(photo(1.5)),hasNote)!;
  expect(plan.photos).toHaveLength(count);
  for(const rect of [...plan.photos,...plan.text]){expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(1200);expect(rect.y+rect.height).toBeLessThanOrEqual(900);}
 }
});
