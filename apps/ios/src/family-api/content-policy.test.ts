import {assertSharedTextAllowed} from './content-policy';
it('normalizes width/case and zero-width evasions but leaves ordinary family text unchanged',()=>{
 for(const text of ['ＫＩＬＬ you','杀了你','儿童色情']) {
  expect(()=>assertSharedTextAllowed(text)).toThrow();
 }
 expect(()=>assertSharedTextAllowed('Family picnic, a happy baby, and a crime novel',null)).not.toThrow();
 expect(()=>assertSharedTextAllowed('ki\u200bll you')).toThrow();
});

it('rejects direct personal profanity with case, punctuation, width and zero-width variations',()=>{
 for(const text of ['Fuck you','FUCK YOU!','fuck, you','ｆｕｃｋ ｙｏｕ','fu\u200bck you','fucking you','fuck u']) expect(()=>assertSharedTextAllowed(text)).toThrow();
 expect(()=>assertSharedTextAllowed('A book about language and a family picnic')).not.toThrow();
});
