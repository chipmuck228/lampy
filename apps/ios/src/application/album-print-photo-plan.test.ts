import {printPhotoGroups} from './album-print-photo-plan';
import type {AlbumLayoutMediaInput} from './album-layout-input';
const photo=(w:number,h:number):AlbumLayoutMediaInput=>({assetId:'p',role:'image',availability:'available',widthPx:w,heightPx:h,intrinsicRatio:w/h,durationMs:null});
const area={xPt:36,yPt:100,widthPt:347,heightPt:419};
it.each([[[1200,1800]],[[1200,1800],[1400,932]],[[1200,1800],[1400,932],[1200,1587]],[[900,1600],[900,1600],[900,1600]],[[1400,932],[1400,932],[1400,932]],[[100,100],[900,1600]],[[800,8000]]].map(sizes=>({sizes})))('keeps every complete photo inside the printable area for %j',({sizes})=>{
 const media=sizes.map(([w,h])=>photo(w,h)),groups=printPhotoGroups(media,area),boxes=groups.flat();expect(boxes).toHaveLength(media.length);
 boxes.forEach((b,i)=>{expect(b.xPt).toBeGreaterThanOrEqual(area.xPt-.001);expect(b.yPt).toBeGreaterThanOrEqual(area.yPt-.001);expect(b.xPt+b.widthPt).toBeLessThanOrEqual(area.xPt+area.widthPt+.001);expect(b.yPt+b.heightPt).toBeLessThanOrEqual(area.yPt+area.heightPt+.001);expect(b.widthPt/b.heightPt).toBeCloseTo(sizes[i][0]/sizes[i][1]);});
 for(const group of groups)for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const a=group[i],b=group[j];expect(a.xPt+a.widthPt<=b.xPt+.001||b.xPt+b.widthPt<=a.xPt+.001||a.yPt+a.heightPt<=b.yPt+.001||b.yPt+b.heightPt<=a.yPt+.001).toBe(true);}
});
