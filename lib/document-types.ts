import type {ManualProgram} from './manual-graph';
import type {ConsultationType} from './adaptive';

export const MAX_PDF_BYTES=1_500_000;
export const MAX_PDF_PAGES=10;
export type PdfReference={id:string;pageStart:number;pageEnd:number;heading:string;figure:boolean;table:boolean};
export type PdfChunk=PdfReference&{text:string};
export type PdfCandidate={program:ManualProgram;type:ConsultationType;conditions:string;exclusions:string;questions:string[];evidence?:{blockId:string;chunkId:string;quote:string}[]};
export type SourceDocument={
 id:string;organizationId:string;siteId:string;filename:string;bytes:number;pageCount:number;
 classification:'general'|'internal'|'confidential';allowed:boolean;share:boolean;
 state:'uploading'|'upload_failed'|'stored'|'processing'|'ready'|'failed'|'deleting'|'deleted';
 uploadedBy:string;uploadedAt:string;updatedAt:string;
 chunks?:PdfChunk[];candidates?:PdfCandidate[];linked?:string[];error?:string;attempt?:string;
 estimatedLayoutUsd?:number;
};
