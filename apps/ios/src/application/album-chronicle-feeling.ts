import type {FeelingWord} from './feeling';
import {isFeelingWord} from './feeling-accent';

/** Chronicle-only ink palette; do not change native UI or existing PDF colours. */
export const CHRONICLE_FEELING:Record<FeelingWord,string>={
 高兴:'#BACDC0',感动:'#9FBAB0',平静:'#829E96',疲惫:'#718A87',难过:'#455F65',烦乱:'#526C6C',说不清:'#8D9F9A',
};
export const CHRONICLE_NEUTRAL='#C4D3CD';
export function chronicleFeeling(value:string):string|null{
 const word=value.trim();
 return word?(isFeelingWord(word)?CHRONICLE_FEELING[word]:'#8D9F9A'):null;
}
