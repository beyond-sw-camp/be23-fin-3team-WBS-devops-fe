export type DefectEvidenceSourceType =
  | 'INBOUND_ORDER_ITEM'
  | 'PLACEMENT_ORDER_ITEM'
  | 'TRANSFER_ORDER_ITEM'
  | 'OUTBOUND_ORDER_ITEM'
  | 'ETC_INOUT_ORDER_ITEM';

export type DefectEvidenceStatus = 'PENDING' | 'READY' | 'ORPHAN';

export type DefectEvidenceReasonCode =
  | 'PACKAGING_DAMAGE'
  | 'QUANTITY_SHORT'
  | 'QUANTITY_OVER'
  | 'WRONG_ITEM'
  | 'EXPIRED'
  | 'VISUAL_DEFECT'
  | 'FUNCTIONAL_DEFECT'
  | 'OTHER';

export interface DefectEvidence {
  id: string;
  clientId: string;
  sourceType: DefectEvidenceSourceType;
  sourceId: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  reasonCode: DefectEvidenceReasonCode | null;
  reasonCodeName: string | null;
  reasonText: string | null;
  status: DefectEvidenceStatus;
  uploadedBy: string;
  uploadedAt: string;
}

export interface DefectEvidenceDownloadUrl {
  url: string;
  expiresAt: string;
  doc: DefectEvidence;
}

/** 백엔드가 reasonCodeName을 채워주지만, null인 경우의 폴백용 */
export const DEFECT_EVIDENCE_REASON_LABELS: Record<DefectEvidenceReasonCode, string> = {
  PACKAGING_DAMAGE: '포장 파손',
  QUANTITY_SHORT: '수량 부족',
  QUANTITY_OVER: '수량 초과',
  WRONG_ITEM: '오품',
  EXPIRED: '유통기한 경과',
  VISUAL_DEFECT: '외관 불량',
  FUNCTIONAL_DEFECT: '기능 불량',
  OTHER: '기타',
};
