import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, App, Button, Card, Space, Spin, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  ArrowLeftOutlined, DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useInstructionDocuments } from '@/hooks/useInstructionDocumentQuery';
import { getInstructionDocumentDownloadUrl } from '@/api/instructionDocument';
import type {
  InstructionDocument,
  InstructionDocumentPage,
  InstructionDocumentStatus,
  InstructionDocumentType,
} from '@/types/instructionDocument';

const { Title, Text } = Typography;

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 30_000;

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

export default function InstructionDocumentList() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const docType = (params.get('docType') ?? 'OUTBOUND_ORDER') as InstructionDocumentType;
  const sourceId = params.get('sourceId') ?? '';

  const [pollStartedAt, setPollStartedAt] = useState<number>(() => Date.now());
  const [pollExpired, setPollExpired] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useInstructionDocuments(
    { docType, sourceId: sourceId || undefined, page: 0, size: 50 },
    {
      enabled: !!sourceId,
      refetchInterval: (query) => {
        if (pollExpired) return false;
        const list = (query.state.data as InstructionDocumentPage | undefined)?.content;
        // 첫 응답 전: 폴링 (보통 1회로 끝남)
        if (list === undefined) return POLL_INTERVAL_MS;
        // 비어있음(승인 직후 발행 대기) 또는 GENERATING이 하나라도 있으면 계속
        const noneYet = list.length === 0;
        const hasGenerating = list.some((d) => d.status === 'GENERATING');
        return noneYet || hasGenerating ? POLL_INTERVAL_MS : false;
      },
    },
  );

  useEffect(() => {
    if (pollExpired) return;
    const remaining = POLL_TIMEOUT_MS - (Date.now() - pollStartedAt);
    if (remaining <= 0) {
      setPollExpired(true);
      return;
    }
    const t = window.setTimeout(() => setPollExpired(true), remaining);
    return () => window.clearTimeout(t);
  }, [pollStartedAt, pollExpired]);

  const documents = useMemo(() => data?.content ?? [], [data]);
  const sortedDocs = useMemo(
    () => [...documents].sort((a, b) => b.version - a.version),
    [documents],
  );
  const latestVersion = sortedDocs[0]?.version;
  const sourceNo = sortedDocs[0]?.sourceNo ?? '';
  const docTypeName = sortedDocs[0]?.docTypeName ?? '문서';

  const handleDownload = async (doc: InstructionDocument) => {
    if (doc.status !== 'READY') return;
    setDownloadingId(doc.id);
    try {
      const res = await getInstructionDocumentDownloadUrl(doc.id);
      // presigned URL은 캐시하지 말고 클릭 시점에 fresh 발급 후 즉시 새 탭으로 열기
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 404) {
        message.error('다운로드 권한이 없거나 링크가 만료되었습니다. 다시 시도해주세요.');
      } else if (status === 409) {
        message.warning('아직 발행 중이거나 발행에 실패한 문서입니다.');
      } else {
        message.error('다운로드 링크 발급에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRefresh = () => {
    setPollStartedAt(Date.now());
    setPollExpired(false);
    void refetch();
  };

  const columns: ColumnsType<InstructionDocument> = [
    {
      title: '회차',
      dataIndex: 'version',
      width: 130,
      render: (v: number, row) => (
        <Space size={6}>
          <Text strong style={{ fontFamily: 'monospace' }}>v{v}</Text>
          {v === latestVersion && <Tag color="blue" style={{ marginInlineEnd: 0 }}>최신</Tag>}
          {row.reissuedFromId && <Tag color="purple" style={{ marginInlineEnd: 0 }}>↩ 재발행</Tag>}
        </Space>
      ),
    },
    {
      title: '발행일시',
      dataIndex: 'issuedAt',
      width: 170,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '크기',
      dataIndex: 'fileSize',
      width: 100,
      align: 'right',
      render: (v: number | null) => formatBytes(v),
    },
    {
      title: '상태',
      dataIndex: 'status',
      width: 140,
      render: (status: InstructionDocumentStatus, row) => {
        const cfg = STATUS_LABEL[status];
        if (status === 'GENERATING') {
          return (
            <Space size={6}>
              <Spin size="small" />
              <Text type="secondary">{cfg.text}</Text>
            </Space>
          );
        }
        if (status === 'FAILED') {
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
      title: '비고',
      dataIndex: 'reissuedFromId',
      render: (reissuedFrom: string | null) => {
        if (!reissuedFrom) return null;
        const prev = documents.find((d) => d.id === reissuedFrom);
        if (!prev) return null;
        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            v{prev.version}에서 갱신됨
          </Text>
        );
      },
    },
    {
      title: '액션',
      key: 'action',
      width: 140,
      render: (_, row) => {
        if (row.status === 'FAILED') {
          return <Text type="secondary" style={{ fontSize: 12 }}>관리자 문의</Text>;
        }
        return (
          <Button
            type="primary"
            size="small"
            icon={<DownloadOutlined />}
            disabled={row.status !== 'READY'}
            loading={downloadingId === row.id}
            onClick={() => handleDownload(row)}
          >
            다운로드
          </Button>
        );
      },
    },
  ];

  if (!sourceId) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="sourceId가 누락되었습니다."
          description="해당 지시서 상세 화면의 '문서함' 버튼을 통해 진입해주세요."
        />
      </div>
    );
  }

  const showTimeoutWarning =
    pollExpired && (documents.length === 0 || documents.some((d) => d.status === 'GENERATING'));

  return (
    <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <Space size={8} align="center">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>뒤로</Button>
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
            {docTypeName}
            {sourceNo && (
              <Text style={{ marginLeft: 8, fontFamily: 'monospace', fontWeight: 500, color: '#475569', fontSize: 16 }}>
                {sourceNo}
              </Text>
            )}
            <Text style={{ marginLeft: 8, color: '#64748b', fontWeight: 400, fontSize: 14 }}>
              · 발행 이력
            </Text>
          </Title>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isFetching}>
          새로고침
        </Button>
      </div>

      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="공식 보존본은 본 PDF입니다."
        description="브라우저 인쇄본은 즉시 출력용이며, 감사·재출력의 단일 소스는 본 페이지에서 다운로드한 PDF입니다."
      />

      {showTimeoutWarning && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="발행에 시간이 걸리고 있습니다."
          description={
            <Text>
              잠시 후 <a onClick={handleRefresh}>새로고침</a> 해주세요. 계속 표시되면 관리자에게 문의해주세요.
            </Text>
          }
        />
      )}

      <Card size="small" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={sortedDocs}
          loading={isLoading}
          pagination={false}
          locale={{
            emptyText: pollExpired
              ? '아직 발행된 문서가 없습니다.'
              : '아직 발행된 문서가 없습니다. 승인 후 1~3초 안에 표시됩니다.',
          }}
        />
      </Card>
    </div>
  );
}
