export type InstructionDocumentStatus = 'GENERATING' | 'READY' | 'FAILED';

export type InstructionDocumentType =
  | 'OUTBOUND_ORDER'
  | 'INBOUND_RECEIPT'
  | 'PICKING_LIST'
  | 'OUTBOUND_DISPATCH'
  | 'INBOUND_ORDER'
  | 'TRANSFER_ORDER'
  | 'PLACEMENT_ORDER'
  | 'ETC_INOUT_ORDER'
  | 'STOCK_COUNT_ORDER';

export interface InstructionDocument {
  id: string;
  clientId: string;
  docType: InstructionDocumentType;
  docTypeName: string;
  sourceId: string;
  sourceNo: string;
  version: number;
  status: InstructionDocumentStatus;
  fileSize: number | null;
  sha256: string | null;
  issuedBy: string;
  issuedAt: string;
  reissuedFromId: string | null;
  errorMessage: string | null;
}

export interface InstructionDocumentPage {
  content: InstructionDocument[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string;
  doc: InstructionDocument;
}

export const INSTRUCTION_DOCUMENT_TYPE_LABELS: Record<InstructionDocumentType, string> = {
  OUTBOUND_ORDER: '출고지시서',
  INBOUND_ORDER: '입고지시서',
  INBOUND_RECEIPT: '입고전표',
  PICKING_LIST: '피킹리스트',
  OUTBOUND_DISPATCH: '출고전표',
  TRANSFER_ORDER: '이동지시서',
  PLACEMENT_ORDER: '적치지시서',
  ETC_INOUT_ORDER: '기타입출고지시서',
  STOCK_COUNT_ORDER: '실사지시서',
};

export const INSTRUCTION_DOCUMENT_TYPES: InstructionDocumentType[] = [
  'OUTBOUND_ORDER',
  'INBOUND_ORDER',
  'INBOUND_RECEIPT',
  'PICKING_LIST',
  'OUTBOUND_DISPATCH',
  'TRANSFER_ORDER',
  'PLACEMENT_ORDER',
  'ETC_INOUT_ORDER',
  'STOCK_COUNT_ORDER',
];

/**
 * 백엔드가 정렬 허용한 InstructionDocument 엔티티 필드명 (camelCase).
 * 임의 문자열을 보내면 BE에서 PropertyReferenceException 발생하므로 이 리터럴로 강제.
 */
export type InstructionDocumentSortableField =
  | 'issuedAt'
  | 'version'
  | 'docType'
  | 'sourceNo'
  | 'status'
  | 'fileSize';
