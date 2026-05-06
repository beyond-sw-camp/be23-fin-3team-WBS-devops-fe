import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/defectEvidence';
import type { DefectEvidence, DefectEvidenceSourceType } from '@/types/defectEvidence';

const STALE_TIME_MS = 30_000;
// presigned URL은 5분 만료. 4분 후 stale 처리해서 만료 직전 새로고침되도록.
const URL_STALE_TIME_MS = 4 * 60 * 1000;

export const useDefectEvidenceList = (
  sourceType: DefectEvidenceSourceType,
  sourceId: string | null | undefined,
  enabled = true,
) =>
  useQuery({
    queryKey: ['defect-evidence', sourceType, sourceId],
    queryFn: () => api.listDefectEvidence({ sourceType, sourceId: sourceId! }),
    enabled: enabled && !!sourceId,
    staleTime: STALE_TIME_MS,
  });

/**
 * 여러 sourceId에 대한 list를 일괄 fetch.
 * 동일 queryKey는 React Query 캐시로 자동 dedupe되므로 중복 sourceId가 있어도 안전.
 * 반환 배열은 입력 sourceIds와 동일 인덱스를 유지.
 */
export const useDefectEvidenceLists = (
  sourceType: DefectEvidenceSourceType,
  sourceIds: string[],
) =>
  useQueries({
    queries: sourceIds.map((id) => ({
      queryKey: ['defect-evidence', sourceType, id],
      queryFn: () => api.listDefectEvidence({ sourceType, sourceId: id }),
      enabled: !!id,
      staleTime: STALE_TIME_MS,
    })),
  });

export const useDefectEvidenceDownloadUrl = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['defect-evidence', 'download', id],
    queryFn: () => api.getDefectEvidenceDownloadUrl(id!),
    enabled: !!id,
    staleTime: URL_STALE_TIME_MS,
  });

export const useDeleteDefectEvidence = () => {
  const qc = useQueryClient();
  return useMutation<void, unknown, DefectEvidence>({
    mutationFn: (evidence) => api.deleteDefectEvidence(evidence.id),
    onSuccess: (_data, evidence) => {
      // 같은 sourceId의 list 캐시 무효화
      qc.invalidateQueries({
        queryKey: ['defect-evidence', evidence.sourceType, evidence.sourceId],
      });
      // 다운로드 URL 캐시도 제거
      qc.removeQueries({ queryKey: ['defect-evidence', 'download', evidence.id] });
    },
  });
};
