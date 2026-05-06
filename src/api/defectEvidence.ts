import apiClient from './client';
import type {
  DefectEvidence,
  DefectEvidenceDownloadUrl,
  DefectEvidenceSourceType,
} from '@/types/defectEvidence';

const BASE = '/stock-service/defect-evidence';

export interface ListDefectEvidenceParams {
  sourceType: DefectEvidenceSourceType;
  sourceId: string;
}

export const listDefectEvidence = async (
  params: ListDefectEvidenceParams,
): Promise<DefectEvidence[]> => {
  const res = await apiClient.get<DefectEvidence[]>(BASE, { params });
  return res.data ?? [];
};

export const getDefectEvidence = async (id: string): Promise<DefectEvidence> => {
  const res = await apiClient.get<DefectEvidence>(`${BASE}/${id}`);
  return res.data;
};

export const getDefectEvidenceDownloadUrl = async (
  id: string,
): Promise<DefectEvidenceDownloadUrl> => {
  const res = await apiClient.get<DefectEvidenceDownloadUrl>(`${BASE}/${id}/download`);
  return res.data;
};

export const deleteDefectEvidence = async (id: string): Promise<void> => {
  await apiClient.delete(`${BASE}/${id}`);
};
