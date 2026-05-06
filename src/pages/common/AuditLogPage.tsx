import { useEffect, useState, useMemo } from 'react';
import { Typography, Table, Tag, Select, DatePicker, Space, Button, Empty, Input, AutoComplete } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AuditLog, AuditAction, AuditService } from '@/types/common';
import { useAuditLogs, useAuditLogSuggestions } from '@/hooks/useCommonQuery';
import { useUsers } from '@/hooks/useSettingsQuery';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const today = dayjs();

const ACTION_OPTIONS: AuditAction[] = ['생성', '조회', '수정', '삭제', '승인', '취소', '완료', '비활성화', '로그인', '로그인실패'];

const actionColor: Record<string, string> = {
  생성: 'blue', 조회: 'default', 수정: 'orange', 삭제: 'red',
  승인: 'green', 취소: 'volcano', 완료: 'cyan', 비활성화: 'default',
  로그인: 'green', 로그인실패: 'red',
};

const SERVICE_OPTIONS: { label: string; value: AuditService }[] = [
  { label: '재고 서비스', value: 'stock-service' },
  { label: '마스터 서비스', value: 'master-service' },
  { label: '계정 서비스', value: 'account-service' },
];

const serviceLabel: Record<string, string> = {
  'stock-service': '재고',
  'master-service': '마스터',
  'account-service': '계정',
};

const HTTP_METHOD_OPTIONS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((method) => ({ label: method, value: method }));

const STATUS_GROUP_OPTIONS = [
  { label: '성공', value: '2xx' },
  { label: '요청 오류', value: '4xx' },
  { label: '서버 오류', value: '5xx' },
];

const DURATION_OPTIONS = [
  { label: '100ms 이상', value: 100 },
  { label: '500ms 이상', value: 500 },
  { label: '1초 이상', value: 1000 },
  { label: '3초 이상', value: 3000 },
];

const entityLabel: Record<string, string> = {
  inbound: '입고', outbound: '출고', transfer: '이동',
  inventory: '재고', stockcount: '재고실사', pickinglist: '피킹',
  etcinout: '기타입출고', alert: '알림', statistic: '통계',
  warehouse: '창고', zone: '구역', rack: '랙', location: '로케이션',
  product: '상품', productcategory: '카테고리', productgroup: '상품그룹',
  supplier: '입고처', store: '출고처', layout: '레이아웃',
  admin: '사용자관리', user: '내정보', developer: '시스템관리',
};

const ENTITY_OPTIONS = Object.entries(entityLabel).map(([value, label]) => ({ value, label }));

const httpMethodColor: Record<string, string> = {
  GET: 'blue', POST: 'green', PATCH: 'orange', PUT: 'orange', DELETE: 'red',
};

const technicalStatusColor = (code: number) => {
  if (code >= 200 && code < 300) return 'green';
  if (code >= 400 && code < 500) return 'orange';
  if (code >= 500) return 'red';
  return 'default';
};

const resultTag = (code: number) => {
  if (code >= 200 && code < 400) return <Tag color="green">성공</Tag>;
  return <Tag color="red">실패</Tag>;
};

export default function AuditLogPage() {
  const [keywordInput, setKeywordInput] = useState('');
  const [suggestKeyword, setSuggestKeyword] = useState('');
  const [keyword, setKeyword] = useState<string | undefined>(undefined);
  const [serviceFilter, setServiceFilter] = useState<AuditService | undefined>(undefined);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [httpMethodFilter, setHttpMethodFilter] = useState<string | undefined>(undefined);
  const [entityFilter, setEntityFilter] = useState<string | undefined>(undefined);
  const [statusGroupFilter, setStatusGroupFilter] = useState<string | undefined>(undefined);
  const [minDurationFilter, setMinDurationFilter] = useState<number | undefined>(undefined);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([today.subtract(7, 'day'), today]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const from = dateRange[0].format('YYYY-MM-DD');
  const to = dateRange[1].format('YYYY-MM-DD');

  const { data, isLoading } = useAuditLogs({
    keyword,
    serviceName: serviceFilter,
    action: actionFilter,
    httpMethod: httpMethodFilter,
    entityName: entityFilter,
    statusGroup: statusGroupFilter,
    minDurationMs: minDurationFilter,
    from,
    to,
    page,
    size: pageSize,
  });
  const { data: suggestions = [] } = useAuditLogSuggestions(suggestKeyword);

  // 사용자 UUID → 이름 매핑
  const { data: users = [] } = useUsers();
  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [users]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSuggestKeyword(keywordInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  const keywordOptions = useMemo(
    () => suggestions.map((s) => ({ value: s.value, label: s.label })),
    [suggestions],
  );

  const resolveUserName = (log: AuditLog): string => {
    if (log.user_name) return log.user_name;
    if (log.user_id) return userMap.get(log.user_id) ?? log.user_id.slice(0, 8) + '…';
    return '-';
  };

  const columns: ColumnsType<AuditLog> = [
    {
      title: '시각', dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '사용자', key: 'user', width: 120,
      render: (_, record) => resolveUserName(record),
    },
    {
      title: '업무 영역', dataIndex: 'service_name', key: 'service_name', width: 110,
      render: (v: string | null) => v ? <Tag>{serviceLabel[v] ?? v}</Tag> : '-',
    },
    {
      title: '행위', dataIndex: 'action', key: 'action', width: 90,
      render: (v: string) => <Tag color={actionColor[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: '대상', dataIndex: 'entity_name', key: 'entity_name', width: 100,
      render: (v: string) => entityLabel[v] ?? v,
    },
    {
      title: '결과', dataIndex: 'response_status', key: 'result', width: 80, align: 'center',
      render: (v: number) => resultTag(v),
    },
  ];

  const handleQuickRange = (days: number) => {
    setDateRange([today.subtract(days, 'day'), today]);
    setPage(0);
  };

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>감사 로그 중앙 검색</Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <AutoComplete
          value={keywordInput}
          options={keywordOptions}
          onChange={setKeywordInput}
          onSelect={(v) => { setKeywordInput(v); setKeyword(v.trim() || undefined); setPage(0); }}
          style={{ width: 260 }}
        >
          <Input.Search
            placeholder="사용자 이름, 작업 내용, 화면 경로 검색"
            allowClear
            onSearch={(v) => { setKeyword(v.trim() || undefined); setPage(0); }}
          />
        </AutoComplete>
        <Select placeholder="서비스" allowClear style={{ width: 140 }} value={serviceFilter}
          onChange={(v) => { setServiceFilter(v); setPage(0); }}
          options={SERVICE_OPTIONS} />
        <Select placeholder="행위" allowClear style={{ width: 120 }} value={actionFilter}
          onChange={(v) => { setActionFilter(v); setPage(0); }}
          options={ACTION_OPTIONS.map((a) => ({ label: a, value: a }))} />
        <RangePicker value={dateRange} onChange={(d) => { if (d?.[0] && d?.[1]) { setDateRange([d[0], d[1]]); setPage(0); } }} />
        <Button size="small" onClick={() => handleQuickRange(0)}>오늘</Button>
        <Button size="small" onClick={() => handleQuickRange(7)}>7일</Button>
        <Button size="small" onClick={() => handleQuickRange(30)}>30일</Button>
        <Button size="small" onClick={() => setShowAdvancedFilters((v) => !v)}>
          {showAdvancedFilters ? '상세 필터 닫기' : '상세 필터'}
        </Button>
      </Space>

      {showAdvancedFilters && (
        <Space style={{ marginBottom: 16, display: 'flex' }} wrap>
          <Select placeholder="HTTP" allowClear style={{ width: 100 }} value={httpMethodFilter}
            onChange={(v) => { setHttpMethodFilter(v); setPage(0); }}
            options={HTTP_METHOD_OPTIONS} />
          <Select placeholder="대상" allowClear showSearch optionFilterProp="label" style={{ width: 140 }} value={entityFilter}
            onChange={(v) => { setEntityFilter(v); setPage(0); }}
            options={ENTITY_OPTIONS} />
          <Select placeholder="결과" allowClear style={{ width: 120 }} value={statusGroupFilter}
            onChange={(v) => { setStatusGroupFilter(v); setPage(0); }}
            options={STATUS_GROUP_OPTIONS} />
          <Select placeholder="처리시간" allowClear style={{ width: 130 }} value={minDurationFilter}
            onChange={(v) => { setMinDurationFilter(v); setPage(0); }}
            options={DURATION_OPTIONS} />
        </Space>
      )}

      {data && data.content.length === 0 && !isLoading ? (
        <Empty description="감사 로그가 없습니다" style={{ marginTop: 60 }} />
      ) : (
        <Table
          columns={columns}
          dataSource={data?.content ?? []}
          rowKey="id"
          size="middle"
          loading={isLoading}
          pagination={{
            current: (data?.page ?? 0) + 1,
            pageSize: data?.size ?? pageSize,
            total: data?.totalElements ?? 0,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            onChange: (p, ps) => { setPage(p - 1); setPageSize(ps); },
          }}
          expandable={{
            expandIconColumnIndex: columns.length,
            expandedRowRender: (record) => (
              <Space size={16} wrap style={{ fontSize: 12 }}>
                <span>요청 경로: <code>{record.request_uri || '-'}</code></span>
                <span>HTTP: <Tag color={httpMethodColor[record.http_method] ?? 'default'}>{record.http_method}</Tag></span>
                <span>응답 코드: <Tag color={technicalStatusColor(record.response_status)}>{record.response_status}</Tag></span>
                <span>처리시간: {(record.duration_ms ?? 0).toLocaleString()}ms</span>
                <span>IP: {record.ip_address || '-'}</span>
              </Space>
            ),
            rowExpandable: (record) => !!(record.request_uri || record.http_method || record.response_status || record.ip_address),
          }}
        />
      )}
    </>
  );
}
