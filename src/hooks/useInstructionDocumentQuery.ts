import { useQuery, type Query } from '@tanstack/react-query';
import * as api from '@/api/instructionDocument';
import type {
  InstructionDocumentPage,
} from '@/types/instructionDocument';

type RefetchInterval =
  | number
  | false
  | ((query: Query<InstructionDocumentPage>) => number | false | undefined);

interface UseInstructionDocumentsOptions {
  enabled?: boolean;
  refetchInterval?: RefetchInterval;
}

export const useInstructionDocuments = (
  params: api.ListInstructionDocumentsParams,
  options: UseInstructionDocumentsOptions = {},
) =>
  useQuery<InstructionDocumentPage>({
    queryKey: ['instruction-documents', params],
    queryFn: () => api.listInstructionDocuments(params),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
    // 탭이 백그라운드일 때 자동 일시정지 (브리프 요구사항)
    refetchIntervalInBackground: false,
  });

export const useInstructionDocument = (id: string, enabled = true) =>
  useQuery({
    queryKey: ['instruction-document', id],
    queryFn: () => api.getInstructionDocument(id),
    enabled: enabled && !!id,
  });
