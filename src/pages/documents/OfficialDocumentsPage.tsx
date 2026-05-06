import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, App, Button, Card, Col, DatePicker, Input, Row, Select, Space,
  Spin, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  DownloadOutlined, LinkOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult, SortOrder as AntdSortOrder } from 'antd/es/table/interface';
import dayjs, { type Dayjs } from 'dayjs';
import { useInstructionDocuments } from '@/hooks/useInstructionDocumentQuery';
import { getInstructionDocumentDownloadUrl } from '@/api/instructionDocument';
import {
  INSTRUCTION_DOCUMENT_TYPES,
  INSTRUCTION_DOCUMENT_TYPE_LABELS,
  type InstructionDocument,
  type InstructionDocumentPage,
  type InstructionDocumentSortableField,
  type InstructionDocumentStatus,
  type InstructionDocumentType,
} from '@/types/instructionDocument';
import { getInstructionDocumentRoute } from '@/utils/instructionDocumentRoute';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const POLL_INTERVAL_MS = 8_000;

function formatBytes(n: number | null): string {
  if (n == null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const STATUS_LABEL: Record<InstructionDocumentStatus, { color: string; text: string }> = {
  READY: { color: 'green', text: 'READY' },
  GENERATING: { color: 'default', text: '발행 중' },
  FAILED: { color: 'red', text: '발행 실패' },
};

const STATUS_OPTIONS: { value: InstructionDocumentStatus; label: string }[] = [
  { value: 'READY', label: 'READY' },
  { value: 'GENERATING', label: '발행 중' },
  { value: 'FAILED', label: '발행 실패' },
];

export default function OfficialDocumentsPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [docType, setDocType] = useState<InstructionDocumentType | undefined>(undefined);
  const [status, setStatus] = useState<InstructionDocumentStatus | undefined>(undefined);
  const [sourceNo, setSourceNo] = useState<string>('');
  const [appliedSourceNo, setAppliedSourceNo] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState<number>(0);
  const [size, setSize] = useState<number>(20);
  const [sortField, setSortField] = useState<InstructionDocumentSortableField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // 필터·정렬 변경 시 1페이지로 리셋
  useEffect(() => { setPage(0); }, [docType, status, appliedSourceNo, dateRange, size, sortField, sortDir]);

  const sortParam = sortField && sortDir ? `${sortField},${sortDir}` : undefined;

  const sortOrderOf = (field: InstructionDocumentSortableField): AntdSortOrder =>
    sortField === field ? (sortDir === 'desc' ? 'descend' : 'ascend') : null;

  const issuedFrom = dateRange?.[0]?.startOf('day').format('YYYY-MM-DDTHH:mm:ss');
  const issuedTo = dateRange?.[1]?.endOf('day').format('YYYY-MM-DDTHH:mm:ss');

  const { data, isLoading, isFetching, refetch } = useInstructionDocuments(
    {
      docType,
      status,
      sourceNo: appliedSourceNo || undefined,
      issuedFrom,
      issuedTo,
      page,
      size,
      sort: sortParam,
    },
    {
      // GENERATING 행이 보이면 가벼운 폴링 (탭 visible일 때만 자동 정지)
      refetchInterval: (query) => {
        const list = (query.state.data as InstructionDocumentPage | undefined)?.content ?? [];
        return list.some((d) => d.status === 'GENERATING') ? POLL_INTERVAL_MS : false;
      },
    },
  );

  const documents = useMemo(() => data?.content ?? [], [data]);
  const totalElements = data?.totalElements ?? 0;

  const handleDownload = async (doc: InstructionDocument) => {
    if (doc.status !== 'READY') return;
    setDownloadingId(doc.id);
    try {
      const res = await getInstructionDocumentDownloadUrl(doc.id);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      const respStatus = (e as { response?: { status?: number } })?.response?.status;
      if (respStatus === 403 || respStatus === 404) {
        message.error('다운로드 권한이 없거나 링크가 만료되었습니다. 다시 시도해주세요.');
      } else if (respStatus === 409) {
        message.warning('아직 발행 중이거나 발행에 실패한 문서입니다.');
      } else {
        message.error('다운로드 링크 발급에 실패했습니다.');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handleNavigate = (doc: InstructionDocument) => {
    navigate(getInstructionDocumentRoute(doc.docType, doc.sourceId));
  };

  const handleRefresh = () => {
    void refetch();
  };

  const handleApplySearch = () => setAppliedSourceNo(sourceNo.trim());

  const handleResetFilters = () => {
    setDocType(undefined);
    setStatus(undefined);
    setSourceNo('');
    setAppliedSourceNo('');
    setDateRange(null);
    setSortField(null);
    setSortDir(null);
  };

  const handleTableChange = (
    _pag: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<InstructionDocument> | SorterResult<InstructionDocument>[],
  ) => {
    // 멀티 정렬 미지원 — 첫 항목만 사용
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s && s.order && typeof s.field === 'string') {
      setSortField(s.field as InstructionDocumentSortableField);
      setSortDir(s.order === 'descend' ? 'desc' : 'asc');
    } else {
      setSortField(null);
      setSortDir(null);
    }
  };

  const columns: ColumnsType<InstructionDocument> = [
    {
      title: '종류',
      dataIndex: 'docType',
      width: 130,
      sorter: true,
      sortOrder: sortOrderOf('docType'),
      render: (t: InstructionDocumentType, row) => (
        <Text>{row.docTypeName || INSTRUCTION_DOCUMENT_TYPE_LABELS[t]}</Text>
      ),
    },
    {
      title: '문서번호',
      dataIndex: 'sourceNo',
      width: 160,
      sorter: true,
      sortOrder: sortOrderOf('sourceNo'),
      render: (no: string) => <Text style={{ fontFamily: 'monospace' }}>{no}</Text>,
    },
    {
      title: '회차',
      dataIndex: 'version',
      width: 80,
      align: 'center',
      sorter: true,
      sortOrder: sortOrderOf('version'),
      render: (v: number) => <Text strong style={{ fontFamily: 'monospace' }}>v{v}</Text>,
    },
    {
      title: '상태',
      dataIndex: 'status',
      width: 130,
      sorter: true,
      sortOrder: sortOrderOf('status'),
      render: (s: InstructionDocumentStatus, row) => {
        const cfg = STATUS_LABEL[s];
        if (s === 'GENERATING') {
          return (
            <Space size={6}>
              <Spin size="small" />
              <Text type="secondary">{cfg.text}</Text>
            </Space>
          );
        }
        if (s === 'FAILED') {
          return (
            <Tooltip title={row.errorMessage ?? '관리자에게 문의해주세요.'}>
              <Tag color={cfg.color}>{cfg.text}</Tag>
            </Tooltip>
          );
        }
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '크기',
      dataIndex: 'fileSize',
      width: 90,
      align: 'right',
      sorter: true,
      sortOrder: sortOrderOf('fileSize'),
      render: (v: number | null) => formatBytes(v),
    },
    {
      title: '발행일시',
      dataIndex: 'issuedAt',
      width: 160,
      sorter: true,
      sortOrder: sortOrderOf('issuedAt'),
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '동작',
      key: 'action',
      width: 120,
      render: (_, row) => (
        <Space size={4}>
          <Tooltip title={row.status === 'READY' ? '다운로드' : (row.status === 'FAILED' ? row.errorMessage ?? '발행 실패' : '발행 중')}>
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              disabled={row.status !== 'READY'}
              loading={downloadingId === row.id}
              onClick={() => handleDownload(row)}
            />
          </Tooltip>
          <Tooltip title="원본 거래로 이동">
            <Button
              type="text"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => handleNavigate(row)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const docTypeOptions = INSTRUCTION_DOCUMENT_TYPES.map((t) => ({
    value: t,
    label: INSTRUCTION_DOCUMENT_TYPE_LABELS[t],
  }));

  const pagination: TablePaginationConfig = {
    current: page + 1,
    pageSize: size,
    total: totalElements,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (total) => `총 ${total.toLocaleString()}건`,
    onChange: (next, nextSize) => {
      setPage(next - 1);
      if (nextSize && nextSize !== size) setSize(nextSize);
    },
  };

  return (
    <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space direction="vertical" size={2}>
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>공식 문서함</Title>
          <Text type="secondary">지시서·전표 PDF 보존본</Text>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isFetching}>
          새로고침
        </Button>
      </div>

      {/* 필터 바 */}
      <Card size="small" style={{ marginBottom: 12, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Row gutter={[8, 8]}>
          <Col xs={24} sm={12} md={6}>
            <Select
              allowClear
              placeholder="종류 (전체)"
              value={docType}
              onChange={setDocType}
              options={docTypeOptions}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              allowClear
              placeholder="상태 (전체)"
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <RangePicker
              value={dateRange ?? undefined}
              onChange={(v) => setDateRange(v as [Dayjs | null, Dayjs | null] | null)}
              style={{ width: '100%' }}
              placeholder={['발행일 시작', '발행일 종료']}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Input.Search
              placeholder="문서번호 (예: SO-001)"
              value={sourceNo}
              onChange={(e) => setSourceNo(e.target.value)}
              onSearch={handleApplySearch}
              allowClear
              onClear={() => { setSourceNo(''); setAppliedSourceNo(''); }}
              enterButton
            />
          </Col>
        </Row>
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <Button size="small" type="text" onClick={handleResetFilters}>필터 초기화</Button>
        </div>
      </Card>

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 12 }}
        message="공식 보존본은 본 PDF입니다."
        description="브라우저 인쇄본은 즉시 출력용이며, 감사·재출력의 단일 소스는 본 페이지에서 다운로드한 PDF입니다."
      />

      <Card size="small" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={documents}
          loading={isLoading}
          pagination={pagination}
          onChange={handleTableChange}
          locale={{ emptyText: '조건에 맞는 문서가 없습니다.' }}
          size="middle"
        />
      </Card>
    </div>
  );
}
