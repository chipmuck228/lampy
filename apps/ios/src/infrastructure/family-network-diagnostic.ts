import {ApplicationError} from '../application/errors';

export const FAMILY_TRACE_ID=/^diag-[a-f0-9]{16}-[1-9][0-9]{0,8}$/;
export type FamilyNetworkDiagnostic={
  id:string|null;engine:'RN'|'OTHER'|'INJECTED';phase:'HEADERS'|'TEXT'|'BYTES'|'COMPLETE';status:number|null;
  rnRequested:boolean;
};
export function familyNetworkError(error:unknown,diagnostic:FamilyNetworkDiagnostic){
  const result=error instanceof ApplicationError?error:new ApplicationError('SERVER_UNREACHABLE','Family request could not complete.');
  return Object.assign(result,{networkDiagnostic:{...diagnostic}});
}
export function familyNetworkDiagnostic(error:unknown):string {
  if(!error||typeof error!=='object'||!('networkDiagnostic' in error))return '';
  const d=error.networkDiagnostic as Partial<FamilyNetworkDiagnostic>|null;
  if(!d||!['RN','OTHER','INJECTED'].includes(d.engine??'')||!['HEADERS','TEXT','BYTES','COMPLETE'].includes(d.phase??''))return '';
  const id=typeof d.id==='string'&&FAMILY_TRACE_ID.test(d.id)?d.id:'NONE';
  const status=Number.isInteger(d.status)&&Number(d.status)>=100&&Number(d.status)<=599?d.status:'NONE';
  return `rid=${id} engine=${d.engine} rnRequested=${d.rnRequested===true?1:0} wait=${d.phase} http=${status}`;
}
