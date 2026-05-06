import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Button, Table, Tag, Space, Modal, App, Alert, Tabs, DatePicker, Empty, Input, Switch, Spin,
} from 'antd';
import {
  ThunderboltOutlined, PlayCircleOutlined, ReloadOutlined,
  CheckCircleFilled, WarningFilled, CloseCircleFilled, MinusCircleFilled, SyncOutlined,
  UserOutlined, FileSearchOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useRunWaveScheduler, useSchedulerHistory, useSchedulerHistoryDetail } from '@/hooks/useSchedulerQuery';
import { useAuditLogs } from '@/hooks/useCommonQuery';
import { useStores, useToggleStoreAutoWave } from '@/hooks/useMasterQuery';
import { groupDetailsByOrder, type SchedulerHistory, type SchedulerHistoryOrderGroup, type SchedulerStatus } from '@/api/scheduler';
import type { AuditLog } from '@/types/common';
import type { Store } from '@/types/store';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const WAVE_JOB_NAME = 'DAILY_WAVE_GENERATION';
const PAGE_SIZE = 20;
const POLLING_MS = 30_000;
const today = dayjs();

const STATUS_CONFIG: Record<SchedulerStatus, { color: string; label: string; icon: React.ReactNode }> = {
  SUCCESS: { color: 'success', label: '성공', icon: <CheckCircleFilled /> },
  PARTIAL: { color: 'warning', label: '부분', icon: <WarningFilled /> },
  FAILED: { color: 'error', label: '실패', icon: <CloseCircleFilled /> },
  SKIPPED: { color: 'default', label: '대상 없음', icon: <MinusCircleFilled /> },
  RUNNING: { color: 'processing', label: '실행 중', icon: <SyncOutlined spin /> },
};

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '-';
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : v;
}

function durationSec(started: string, finished: string | null): string {
  if (!finished) return 'N/A';
  const s = new Date(started).getTime();
  const e = new Date(finished).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 'N/A';
  const diff = Math.max(0, Math.round((e - s) / 1000));
  return `${diff}초`;
}

function httpStatusBadge(code: number): { color: string; label: string } {
  if (code >= 200 && code < 300) return { color: 'green', label: '성공' };
  if (code >= 400 && code < 500) return { color: 'orange', label: '클라이언트 오류' };
  if (code >= 500) return { color: 'red', label: '서버 오류' };
  return { color: 'default', label: '기타' };
}

function prettyJson(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// ─────────────────────────────────────────────
// 한 실행 이력의 펼친 영역 — OB 단위 그룹핑된 처리 상세
// ─────────────────────────────────────────────
function ExpandedSchedulerDetail({ historyId }: { historyId: string }) {
  const navigate = useNavigate();
  const { data: rows, isLoading } = useSchedulerHistoryDetail(historyId);

  const groups: SchedulerHistoryOrderGroup[] = useMemo(
    () => (rows ? groupDetailsByOrder(rows) : []),
    [rows],
  );

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="small" />
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="이 실행에서 처리된 출고지시서가 없습니다"
        style={{ margin: '16px 0' }}
      />
    );
  }

  const columns: ColumnsType<SchedulerHistoryOrderGroup> = [
    {
      title: '출고지시서', dataIndex: 'order_no', key: 'order_no', width: 180,
      render: (v: string | null) => (
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#0f172a', fontWeight: 500 }}>
          {v ?? '-'}
        </span>
      ),
    },
    {
      title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 140,
      render: (v: string | null) => v ?? <Text type="secondary">-</Text>,
    },
    {
      title: '출고처', dataIndex: 'store_name', key: 'store_name', width: 160,
      render: (v: string | null) => v ?? <Text type="secondary">-</Text>,
    },
    {
      title: '수주서', dataIndex: 'so_nos', key: 'so_nos',
      render: (v: string[]) =>
        v.length === 0
          ? <Text type="secondary">-</Text>
          : (
            <Space size={4} wrap>
              {v.map((sn) => (
                <Tag key={sn} color="default" style={{
                  margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11,
                }}>
                  {sn}
                </Tag>
              ))}
            </Space>
          ),
    },
    {
      title: '웨이브', key: 'picking', width: 160,
      render: (_, r) => r.picking_list_id
        ? (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
            onClick={() => navigate(`/order/picking/${r.picking_list_id}`)}
          >
            {r.picking_no ?? '웨이브 보기'}
          </Button>
        )
        : <Text type="secondary">-</Text>,
    },
  ];

  return (
    <div style={{ padding: '8px 12px 4px' }}>
      <Table
        size="small"
        columns={columns}
        dataSource={groups}
        rowKey="outbound_order_id"
        pagination={false}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// 탭 1 — 스케줄러 이력
// ─────────────────────────────────────────────
function SchedulerTab() {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<SchedulerHistory | null>(null);

  const { data, isLoading, isFetching, refetch } = useSchedulerHistory({
    jobName: WAVE_JOB_NAME,
    page,
    size: PAGE_SIZE,
    pollingMs: POLLING_MS,
  });
  const runMutation = useRunWaveScheduler();

  const lastRun = data?.content[0];

  const handleRun = () => {
    runMutation.mutate(undefined, {
      onSuccess: (result) => {
        switch (result.status) {
          case 'SUCCESS':
            message.success(`웨이브 ${result.success_count}개 생성 완료 (대상 ${result.target_count}건)`);
            break;
          case 'PARTIAL':
            modal.warning({
              title: '일부만 성공',
              content: (
                <div>
                  <div>성공 {result.success_count} · 실패 {result.failed_count} · 대상 {result.target_count}</div>
                  {result.error_message && (
                    <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 12, color: '#64748b' }}>
                      {result.error_message}
                    </pre>
                  )}
                </div>
              ),
            });
            break;
          case 'FAILED':
            modal.error({
              title: '배치 실행 실패',
              content: (
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
                  {result.error_message ?? '원인 불명'}
                </pre>
              ),
            });
            break;
          case 'SKIPPED':
            message.info('처리 대상 없음');
            break;
          case 'RUNNING':
            message.info('실행 중 — 잠시 후 이력을 확인하세요');
            break;
        }
      },
      onError: (e) => {
        const msg = (e as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
          ?? (e instanceof Error ? e.message : '배치 실행 실패');
        message.error(msg);
      },
    });
  };

  const columns: ColumnsType<SchedulerHistory> = useMemo(() => [
    {
      title: '시작시각', dataIndex: 'started_at', key: 'started_at', width: 150,
      render: (v: string) => <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{fmtDateTime(v)}</span>,
    },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 110, align: 'center',
      render: (v: SchedulerStatus) => {
        const cfg = STATUS_CONFIG[v];
        return <Tag color={cfg.color} icon={cfg.icon} style={{ margin: 0 }}>{cfg.label}</Tag>;
      },
    },
    {
      title: '트리거', dataIndex: 'triggered_manually', key: 'triggered_manually', width: 90, align: 'center',
      render: (v: boolean) => v
        ? <Tag color="geekblue" style={{ margin: 0 }}>수동</Tag>
        : <Tag color="default" style={{ margin: 0 }}>자동</Tag>,
    },
    { title: '대상', dataIndex: 'target_count', key: 'target_count', width: 80, align: 'right' },
    {
      title: '생성', dataIndex: 'success_count', key: 'success_count', width: 80, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600, color: v > 0 ? '#16a34a' : '#94a3b8' }}>{v}</span>,
    },
    {
      title: '실패', dataIndex: 'failed_count', key: 'failed_count', width: 80, align: 'right',
      render: (v: number) => v > 0
        ? <span style={{ fontWeight: 600, color: '#ef4444' }}>{v}</span>
        : <span style={{ color: '#cbd5e1' }}>0</span>,
    },
    {
      title: '소요', key: 'duration', width: 90, align: 'right',
      render: (_, r) => <span style={{ color: '#64748b', fontSize: 12 }}>{durationSec(r.started_at, r.finished_at)}</span>,
    },
    {
      title: '상세', key: 'detail', width: 70, align: 'center',
      render: (_, r) => r.error_message
        ? <Button size="small" type="link" onClick={() => setDetail(r)}>보기</Button>
        : <span style={{ color: '#cbd5e1' }}>-</span>,
    },
  ], []);

  const lastRunLine = lastRun
    ? `${fmtDateTime(lastRun.started_at)} · ${STATUS_CONFIG[lastRun.status].label} · 대상 ${lastRun.target_count} → 생성 ${lastRun.success_count}`
    : '실행 이력이 없습니다';

  return (
    <>
      {/* ── 잡 요약 바 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', marginBottom: 16,
        background: '#f8fafc', borderRadius: 8,
      }}>
        <ThunderboltOutlined style={{ fontSize: 18, color: '#2563eb' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong>웨이브 자동생성</Text>
            <Tag color="blue" style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>
              {WAVE_JOB_NAME}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>매일 오전 7시 자동 실행</Text>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            마지막 실행 — {lastRunLine}
          </div>
        </div>
        <Button type="primary" icon={<PlayCircleOutlined />} loading={runMutation.isPending} onClick={handleRun}>
          즉시 실행하기
        </Button>
      </div>

      {/* ── 실행 이력 테이블 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space size={8}>
          <Text strong style={{ fontSize: 14 }}>실행 이력</Text>
          {isFetching && !isLoading && <SyncOutlined spin style={{ color: '#94a3b8', fontSize: 12 }} />}
        </Space>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()}>새로고침</Button>
      </div>

      <Table
        columns={columns}
        dataSource={data?.content ?? []}
        rowKey="id"
        size="middle"
        loading={isLoading}
        locale={{ emptyText: <Empty description="실행 이력이 없습니다" /> }}
        expandable={{
          // 처리 행이 1건이라도 있는 실행만 펼치기 가능 — SKIPPED/0건은 펼쳐도 빈 표라 의미 없음
          rowExpandable: (r) => (r.success_count + r.failed_count) > 0,
          expandedRowRender: (r) => <ExpandedSchedulerDetail historyId={r.id} />,
        }}
        pagination={{
          current: page + 1,
          pageSize: PAGE_SIZE,
          total: data?.totalElements ?? 0,
          showSizeChanger: false,
          onChange: (p) => setPage(p - 1),
        }}
      />

      {/* 상세 모달 */}
      <Modal
        title="실행 상세"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={(<Button onClick={() => setDetail(null)}>닫기</Button>)}
        width={640}
      >
        {detail && (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Tag color={STATUS_CONFIG[detail.status].color}>{STATUS_CONFIG[detail.status].label}</Tag>
              <Tag color={detail.triggered_manually ? 'geekblue' : 'default'}>
                {detail.triggered_manually ? '수동' : '자동'}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {fmtDateTime(detail.started_at)} → {fmtDateTime(detail.finished_at)}
              </Text>
            </div>
            <div style={{ fontSize: 13, color: '#334155' }}>
              대상 <b>{detail.target_count}</b> · 생성 <b style={{ color: '#16a34a' }}>{detail.success_count}</b> · 실패 <b style={{ color: '#ef4444' }}>{detail.failed_count}</b>
            </div>
            {detail.error_message && (
              <pre style={{
                whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 6,
                fontSize: 12, color: '#0f172a', margin: 0, maxHeight: 360, overflow: 'auto',
              }}>
                {detail.error_message}
              </pre>
            )}
          </Space>
        )}
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────
// 탭 2 — 수동 웨이브 이력 (감사 로그)
// ─────────────────────────────────────────────
function ManualWaveTab() {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => [today.subtract(30, 'day'), today]);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data, isLoading, isFetching, refetch } = useAuditLogs({
    action: '웨이브생성',
    from: dateRange[0].format('YYYY-MM-DD'),
    to: dateRange[1].format('YYYY-MM-DD'),
    page,
    size: PAGE_SIZE,
  });

  const handleQuickRange = (days: number) => {
    setDateRange([today.subtract(days, 'day'), today]);
    setPage(0);
  };

  const columns: ColumnsType<AuditLog> = useMemo(() => [
    {
      title: '시작시각', dataIndex: 'created_at', key: 'created_at', width: 150,
      render: (v: string) => <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{fmtDateTime(v)}</span>,
    },
    {
      title: '사용자', dataIndex: 'user_name', key: 'user_name', width: 140,
      render: (v: string | null) => v
        ? <Space size={4}><UserOutlined style={{ color: '#94a3b8' }} />{v}</Space>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '상태', dataIndex: 'response_status', key: 'response_status', width: 150, align: 'center',
      render: (v: number) => {
        const b = httpStatusBadge(v);
        return <Tag color={b.color} style={{ margin: 0 }}>{v} · {b.label}</Tag>;
      },
    },
    {
      title: 'IP', dataIndex: 'ip_address', key: 'ip_address', width: 140,
      render: (v: string) => <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#64748b' }}>{v || '-'}</span>,
    },
    {
      title: '소요', dataIndex: 'duration_ms', key: 'duration_ms', width: 100, align: 'right',
      render: (v: number) => <span style={{ color: '#64748b', fontSize: 12 }}>{v != null ? `${v} ms` : '-'}</span>,
    },
    {
      title: '상세', key: 'detail', width: 90, align: 'center',
      render: (_, r) => <Button size="small" type="link" icon={<FileSearchOutlined />} onClick={() => setDetail(r)}>보기</Button>,
    },
  ], []);

  const extractedOrderIds = useMemo(() => {
    if (!detail?.request_body) return null;
    try {
      const parsed = JSON.parse(detail.request_body);
      const candidates = parsed?.outboundOrderIds
        ?? parsed?.outboundIds
        ?? parsed?.orderIds
        ?? parsed?.ids;
      return Array.isArray(candidates) ? candidates as string[] : null;
    } catch {
      return null;
    }
  }, [detail]);

  return (
    <>
      {/* ── 필터 바 ── */}
      <Space style={{ marginBottom: 12 }} wrap>
        <RangePicker
          value={dateRange}
          onChange={(d) => { if (d?.[0] && d?.[1]) { setDateRange([d[0], d[1]]); setPage(0); } }}
          allowClear={false}
        />
        <Button size="small" onClick={() => handleQuickRange(7)}>7일</Button>
        <Button size="small" onClick={() => handleQuickRange(30)}>30일</Button>
        <Button size="small" onClick={() => handleQuickRange(90)}>90일</Button>
      </Space>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space size={8}>
          <Text strong style={{ fontSize: 14 }}>수동 웨이브 이력</Text>
          {isFetching && !isLoading && <SyncOutlined spin style={{ color: '#94a3b8', fontSize: 12 }} />}
        </Space>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()}>새로고침</Button>
      </div>

      <Table
        columns={columns}
        dataSource={data?.content ?? []}
        rowKey="id"
        size="middle"
        loading={isLoading}
        locale={{ emptyText: <Empty description="선택한 기간에 수동 웨이브 이력이 없습니다" /> }}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: 'pointer' } })}
        pagination={{
          current: page + 1,
          pageSize: PAGE_SIZE,
          total: data?.totalElements ?? 0,
          showSizeChanger: false,
          onChange: (p) => setPage(p - 1),
        }}
      />

      {/* 상세 모달 */}
      <Modal
        title="수동 웨이브 상세"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={(<Button onClick={() => setDetail(null)}>닫기</Button>)}
        width={720}
      >
        {detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Tag color={httpStatusBadge(detail.response_status).color}>
                {detail.response_status} · {httpStatusBadge(detail.response_status).label}
              </Tag>
              <Tag color="default">{detail.http_method}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{fmtDateTime(detail.created_at)}</Text>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 6, fontSize: 13 }}>
              <div style={{ color: '#64748b' }}>사용자</div>
              <div>
                {detail.user_name ?? '-'}
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>({detail.user_id?.slice(0, 8)}…)</Text>
              </div>
              <div style={{ color: '#64748b' }}>URI</div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{detail.request_uri}</div>
              <div style={{ color: '#64748b' }}>IP</div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{detail.ip_address || '-'}</div>
              <div style={{ color: '#64748b' }}>소요</div>
              <div>{detail.duration_ms != null ? `${detail.duration_ms} ms` : '-'}</div>
            </div>

            {extractedOrderIds && extractedOrderIds.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#334155', fontWeight: 600, marginBottom: 6 }}>
                  선택된 출고지시서 ({extractedOrderIds.length}건)
                </div>
                <div style={{
                  background: '#f8fafc', borderRadius: 6, padding: 10,
                  maxHeight: 160, overflow: 'auto',
                  display: 'flex', flexWrap: 'wrap', gap: 6,
                }}>
                  {extractedOrderIds.map((id) => (
                    <Tag key={id} color="blue" style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>
                      {id}
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {detail.request_body && (
              <div>
                <div style={{ fontSize: 12, color: '#334155', fontWeight: 600, marginBottom: 6 }}>Request Body</div>
                <pre style={{
                  whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 12, borderRadius: 6,
                  fontSize: 11, color: '#0f172a', margin: 0, maxHeight: 260, overflow: 'auto',
                }}>
                  {prettyJson(detail.request_body)}
                </pre>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────
// 탭 3 — 자동 웨이브 설정 (출고처별 토글)
// ─────────────────────────────────────────────
function AutoWaveSettingsTab() {
  const { data: stores = [], isLoading } = useStores();
  const toggle = useToggleStoreAutoWave();
  const { message } = App.useApp();
  const [search, setSearch] = useState('');
  /** 토글 진행 중인 store id — 행 단위 로딩 표시용 */
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = stores.filter((s) => s.is_active);
    if (!search) return list;
    const kw = search.toLowerCase();
    return list.filter(
      (s) => s.name.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw),
    );
  }, [stores, search]);

  const handleToggle = (record: Store, next: boolean) => {
    setPendingId(record.id);
    toggle.mutate(
      { id: record.id, enabled: next },
      {
        onSuccess: () => {
          message.success(`[${record.name}] 자동 웨이브 ${next ? 'ON' : 'OFF'} 완료`);
        },
        onError: (e) => {
          message.error(extractApiErrorMessage(e, '자동 웨이브 설정 실패'));
        },
        onSettled: () => setPendingId(null),
      },
    );
  };

  const enabledCount = stores.filter((s) => s.is_active && s.auto_wave_enabled).length;
  const totalActive = stores.filter((s) => s.is_active).length;

  const columns: ColumnsType<Store> = [
    {
      title: '출고처', dataIndex: 'name', key: 'name',
      render: (v: string) => <span style={{ color: '#0f172a', fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '코드', dataIndex: 'code', key: 'code', width: 160,
      render: (v: string) => (
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#64748b' }}>{v}</span>
      ),
    },
    {
      title: '자동 웨이브', dataIndex: 'auto_wave_enabled', key: 'auto_wave_enabled', width: 140, align: 'center',
      render: (v: boolean, r) => (
        <Switch
          checked={v}
          loading={pendingId === r.id}
          onChange={(next) => handleToggle(r, next)}
          checkedChildren="ON"
          unCheckedChildren="OFF"
        />
      ),
    },
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="켜진 출고처의 출고지시서만 매일 07:00 자동 웨이브 처리됩니다"
        description="끄면 해당 출고처는 자동 처리에서 제외되고 수동 웨이브 생성만 가능합니다."
        style={{ marginBottom: 16 }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <Input
          placeholder="출고처명 / 코드 검색"
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          자동 웨이브 활성: <Text strong>{enabledCount}</Text> / 활성 출고처 {totalActive}곳
        </Text>
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        size="middle"
        loading={isLoading}
        locale={{ emptyText: <Empty description="조건에 맞는 출고처가 없습니다" /> }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// 페이지
// ─────────────────────────────────────────────
export default function BatchManagementPage() {
  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>배치 관리</Title>

      <Alert
        type="info"
        showIcon
        message="배치 관리는 시스템이 자동 실행한 작업 (스케줄러) 과 관리자가 수동으로 만든 웨이브 이력을 함께 확인하는 페이지입니다."
        style={{ marginBottom: 16 }}
      />

      <Tabs
        defaultActiveKey="scheduler"
        items={[
          { key: 'scheduler', label: '스케줄러 (자동/즉시실행)', children: <SchedulerTab /> },
          { key: 'manual', label: '수동 웨이브 이력', children: <ManualWaveTab /> },
          { key: 'auto-wave', label: '자동 웨이브 설정', children: <AutoWaveSettingsTab /> },
        ]}
      />
    </>
  );
}
