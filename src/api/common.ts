import apiClient from './client';
import type { AuditLog, AuditService, FileAttachmentItem } from '@/types/common';

/* ── 감사 로그 ── */

interface BeAuditLogRes {
  id: string; clientId: string; userId: string;
  serviceName?: string | null;
  userName: string | null;
  action: string; httpMethod: string; requestUri: string;
  entityName: string; responseStatus: number;
  ipAddress: string; durationMs: number; createdAt: string;
  requestBody?: string | null;
}

interface BePageRes<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface AuditLogSuggestion {
  type: string;
  label: string;
  value: string;
}

function mapBeAuditLog(b: BeAuditLogRes): AuditLog {
  return {
    id: b.id, client_id: b.clientId, user_id: b.userId,
    service_name: b.serviceName ?? null,
    action: b.action as AuditLog['action'],
    http_method: b.httpMethod, request_uri: b.requestUri,
    entity_name: b.entityName, response_status: b.responseStatus,
    ip_address: b.ipAddress, duration_ms: b.durationMs,
    created_at: b.createdAt, user_name: b.userName ?? null,
    request_body: b.requestBody ?? null,
  };
}

export interface AuditLogQuery {
  keyword?: string;
  serviceName?: AuditService;
  userId?: string;
  action?: string;
  /** 콤마구분으로 BE에 전달 → 화이트리스트 (이 action 들 중 하나면 포함). 예: "출고불가발생,출고불가해소" */
  includeActions?: string;
  /** 콤마구분으로 BE에 전달 → DB 쿼리 단계에서 제외. 예: "조회,로그인실패" */
  excludeActions?: string;
  httpMethod?: string;
  entityName?: string;
  responseStatus?: number;
  statusGroup?: string;
  minDurationMs?: number;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export interface AuditLogPage {
  content: AuditLog[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

export const getAuditLogs = async (query: AuditLogQuery): Promise<AuditLogPage> => {
  const {
    keyword, serviceName, userId, action, includeActions, excludeActions,
    httpMethod, entityName, responseStatus,
    statusGroup, minDurationMs, from, to, page = 0, size = 20,
  } = query;
  const res = await apiClient.get<BePageRes<BeAuditLogRes>>('/search-service/audit-logs/search', {
    params: {
      ...(keyword ? { keyword } : {}),
      ...(serviceName ? { serviceName } : {}),
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(includeActions ? { includeActions } : {}),
      ...(excludeActions ? { excludeActions } : {}),
      ...(httpMethod ? { httpMethod } : {}),
      ...(entityName ? { entityName } : {}),
      ...(responseStatus ? { responseStatus } : {}),
      ...(statusGroup ? { statusGroup } : {}),
      ...(minDurationMs ? { minDurationMs } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      page,
      size,
    },
  });
  const data = res.data;
  return {
    content: (data.content ?? []).map(mapBeAuditLog),
    totalElements: data.totalElements ?? 0,
    totalPages: data.totalPages ?? 0,
    page: data.number ?? page,
    size: data.size ?? size,
  };
};

export const getAuditLogSuggestions = async (keyword: string, size = 8): Promise<AuditLogSuggestion[]> => {
  const res = await apiClient.get<AuditLogSuggestion[]>('/search-service/audit-logs/suggest', {
    params: { keyword, size },
  });
  return res.data ?? [];
};

/* ── 파일 첨부 ── */
export const getFiles = async (_refType: string, _refId: number): Promise<FileAttachmentItem[]> => {
  return [];
};
