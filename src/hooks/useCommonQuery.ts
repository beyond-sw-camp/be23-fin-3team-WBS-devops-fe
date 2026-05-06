import { useQuery } from '@tanstack/react-query';
import * as commonApi from '@/api/common';

export const useAuditLogs = (
  query: commonApi.AuditLogQuery,
  options?: { refetchInterval?: number | false; enabled?: boolean },
) =>
  useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => commonApi.getAuditLogs(query),
    refetchInterval: options?.refetchInterval ?? false,
    enabled: options?.enabled ?? true,
  });

export const useAuditLogSuggestions = (keyword: string) =>
  useQuery({
    queryKey: ['audit-log-suggestions', keyword],
    queryFn: () => commonApi.getAuditLogSuggestions(keyword),
    enabled: keyword.trim().length >= 2,
    staleTime: 30_000,
  });

export const useFiles = (refType: string, refId: number) =>
  useQuery({ queryKey: ['files', refType, refId], queryFn: () => commonApi.getFiles(refType, refId) });
