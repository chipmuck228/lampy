'use strict';
const fs = require('node:fs');
const MAX_BYTES = 64 * 1024 * 1024;
// Narrow diagnostic parser, not a sanitizer or a proof that an image is metadata-free.
// Never emits tag values, coordinates, camera identifiers, filenames or file contents.
function inspectPhoto(bytes) {
  let format='UNSUPPORTED',exif=false,gps=false,xmp=false,text=false,incomplete=false;
  function tiff(data) {
    exif=true;
    if(data.length<8){incomplete=true;return;}
    const order=data.toString('ascii',0,2),le=order==='II';
    if(!le&&order!=='MM'){incomplete=true;return;}
    const u16=o=>{if(o<0||o+2>data.length)throw Error();return le?data.readUInt16LE(o):data.readUInt16BE(o);};
    const u32=o=>{if(o<0||o+4>data.length)throw Error();return le?data.readUInt32LE(o):data.readUInt32BE(o);};
    try {
      if(u16(2)!==42)throw Error();
      const queue=[u32(4)],seen=new Set();
      while(queue.length) {
        if(seen.size>=16)throw Error();
        const offset=queue.shift();if(!offset)continue;if(seen.has(offset))throw Error();seen.add(offset);
        const count=u16(offset);if(count>1024||offset+2+count*12+4>data.length)throw Error();
        for(let i=0;i<count;i++) {
          const p=offset+2+i*12,tag=u16(p);
          if(tag===0x8825){gps=true;}
          if(tag===0x8769||tag===0xA005){if(u16(p+2)!==4||u32(p+4)!==1)throw Error();queue.push(u32(p+8));}
        }
        queue.push(u32(offset+2+count*12));
      }
    } catch {incomplete=true;}
  }
  const hasGpsWords=b=>/GPSLatitude|GPSLongitude|GPSPosition|GPSDestLatitude|GPSDestLongitude|exif:GPS|location\.ISO6709/i.test(b.toString('latin1'));
  if(bytes.length>=2&&bytes[0]===0xff&&bytes[1]===0xd8) {
    format='JPEG';let p=2,ended=false;
    try {
      while(p<bytes.length) {
        if(bytes[p++]!==0xff)throw Error();while(bytes[p]===0xff)p++;
        const marker=bytes[p++];if(marker===0xd9){ended=true;break;}
        if(marker===0xda){ended=true;break;} // Remaining entropy stream is outside this metadata parser.
        if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
        if(p+2>bytes.length)throw Error();const length=bytes.readUInt16BE(p);
        if(length<2||p+length>bytes.length)throw Error();const segment=bytes.subarray(p+2,p+length);p+=length;
        if(marker===0xe1&&segment.subarray(0,6).equals(Buffer.from('Exif\0\0')))tiff(segment.subarray(6));
        else if(marker===0xe1){xmp=true;if(hasGpsWords(segment))gps=true;}
        else if(marker===0xed||marker===0xfe){text=true;if(hasGpsWords(segment))gps=true;}
      }
      if(!ended)throw Error();
    } catch {incomplete=true;}
  } else if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    format='PNG';let p=8,ended=false;
    try {
      while(p<bytes.length) {
        if(p+12>bytes.length)throw Error();const length=bytes.readUInt32BE(p),kind=bytes.toString('ascii',p+4,p+8);
        if(p+12+length>bytes.length)throw Error();const data=bytes.subarray(p+8,p+8+length);p+=12+length;
        if(kind==='eXIf')tiff(data);
        if(['tEXt','iTXt','zTXt'].includes(kind)){text=true;if(hasGpsWords(data))gps=true;}
        if(kind==='IEND'){ended=true;if(p!==bytes.length)incomplete=true;break;}
      }
      if(!ended)throw Error();
    } catch {incomplete=true;}
  } else {incomplete=true;}
  return {format,exifContainer:exif,xmpOrApp1:xmp,textMetadata:text,gps:gps?'PRESENT':incomplete||xmp||text?'UNKNOWN':'NOT_DETECTED',coverage:incomplete?'INCOMPLETE':'BOUNDED_METADATA_SCAN',sanitized:'NOT_VERIFIED'};
}
function run(argv,write=console.log) {
  if(!argv.length)throw Error('INPUT_REQUIRED');
  argv.forEach((file,index)=>{
    try {const fd=fs.openSync(file,'r');try {const st=fs.fstatSync(fd);if(!st.isFile()||st.size>MAX_BYTES)throw Error();const data=fs.readFileSync(fd);if(data.length>MAX_BYTES)throw Error();write(JSON.stringify({sample:index+1,...inspectPhoto(data)}));}finally{fs.closeSync(fd);}}
    catch {write(JSON.stringify({sample:index+1,error:'UNREADABLE_OR_TOO_LARGE'}));process.exitCode=1;}
  });
}
if(require.main===module){try{run(process.argv.slice(2));}catch{process.stderr.write('Usage: node scripts/photo-metadata-probe.cjs PHOTO_FILE [PHOTO_FILE...]\n');process.exitCode=1;}}
module.exports={inspectPhoto,run};
