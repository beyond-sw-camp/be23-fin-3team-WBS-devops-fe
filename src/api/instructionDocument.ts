import apiClient from './client';
import type {
  DownloadUrlResponse,
  InstructionDocument,
  InstructionDocumentPage,
  InstructionDocumentStatus,
  InstructionDocumentType,
} from '@/types/instructionDocument';

const BASE = '/stock-service/instruction-documents';

export interface ListInstructionDocumentsParams {
  docType?: InstructionDocumentType;
  sourceId?: string;
  sourceNo?: string;
  status?: InstructionDocumentStatus;
  /** ISO LocalDateTime, e.g. "2026-04-01T00:00:00" */
  issuedFrom?: string;
  /** ISO LocalDateTime */
  issuedTo?: string;
  page?: number;
  size?: number;
  /** "issuedAt,desc" 같은 형태. 미지정 시 BE가 자동 결정 (sourceId 있으면 version DESC, 없으면 issuedAt DESC) */
  sort?: string;
}

export const listInstructionDocuments = async (
  params: ListInstructionDocumentsParams,
): Promise<InstructionDocumentPage> => {
  const res = await apiClient.get<InstructionDocumentPage>(BASE, { params });
  return res.data;
};

export const getInstructionDocument = async (id: string): Promise<InstructionDocument> => {
  const res = await apiClient.get<InstructionDocument>(`${BASE}/${id}`);
  return res.data;
};

export const getInstructionDocumentDownloadUrl = async (id: string): Promise<DownloadUrlResponse> => {
  const res = await apiClient.get<DownloadUrlResponse>(`${BASE}/${id}/download`);
  return res.data;
};
