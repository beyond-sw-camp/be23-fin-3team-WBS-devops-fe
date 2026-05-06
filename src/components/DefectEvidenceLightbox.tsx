import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Modal, Spin, Tag, Tooltip, Typography } from 'antd';
import {
  DeleteOutlined, DownloadOutlined, LeftOutlined, RightOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  useDefectEvidenceDownloadUrl,
  useDeleteDefectEvidence,
} from '@/hooks/useDefectEvidenceQuery';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import {
  DEFECT_EVIDENCE_REASON_LABELS,
  type DefectEvidence,
} from '@/types/defectEvidence';

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  evidences: DefectEvidence[];
  initialIndex?: number;
  title?: string;
  /** 관리자/매니저 권한 보유 시 true. 삭제 버튼 노출 여부 */
  canDelete?: boolean;
  onClose: () => void;
}

function formatBytes(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function reasonLabel(e: DefectEvidence): string {
  if (e.reasonCodeName) return e.reasonCodeName;
  if (e.reasonCode) return DEFECT_EVIDENCE_REASON_LABELS[e.reasonCode] ?? e.reasonCode;
  return '사유 미지정';
}

/**
 * Lightbox는 open 시 매번 새로 마운트되는 Inner를 통해 인덱스 상태를 리셋한다.
 * (setState-in-effect 안티패턴 회피용)
 */
export default function DefectEvidenceLightbox({
  open, evidences, initialIndex = 0, title, canDelete = false, onClose,
}: Props) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      destroyOnHidden
      title={null}
      closable={false}
    >
      {open && (
        <LightboxBody
          evidences={evidences}
          initialIndex={initialIndex}
          title={title}
          canDelete={canDelete}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function LightboxBody({
  evidences, initialIndex = 0, title, canDelete = false, onClose,
}: Omit<Props, 'open'>) {
  const { message, modal } = App.useApp();
  const userMap = useUserNameMap();

  const [index, setIndex] = useState<number>(() =>
    Math.min(initialIndex, Math.max(0, evidences.length - 1)),
  );
  // 삭제로 길이가 줄어들면 인덱스를 안전하게 클램프
  const safeIndex = Math.min(index, Math.max(0, evidences.length - 1));
  const current = evidences[safeIndex];
  const total = evidences.length;

  const { data: download, isLoading: urlLoading } = useDefectEvidenceDownloadUrl(
    current ? current.id : null,
  );

  const deleteMutation = useDeleteDefectEvidence();

  const goPrev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total]);
  const goNext = useCallback(() => setIndex((i) => (i + 1) % total), [total]);

  // 키보드 네비게이션
  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, goPrev, goNext]);

  const handleDownload = () => {
    if (!download?.url) return;
    window.open(download.url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = () => {
    if (!current) return;
    modal.confirm({
      title: '이 사진을 삭제하시겠습니까?',
      content: '삭제 후에는 복구할 수 없습니다.',
      okType: 'danger',
      okText: '삭제',
      cancelText: '취소',
      onOk: async () => {
        try {
          await deleteMutation.mutateAsync(current);
          message.success('삭제되었습니다.');
          if (total <= 1) {
            onClose();
          } else {
            setIndex((i) => Math.min(i, total - 2));
          }
        } catch {
          message.error('삭제에 실패했습니다.');
        }
      },
    });
  };

  const meta = useMemo(() => {
    if (!current) return null;
    return [
      { label: '사유', value: <Text>{reasonLabel(current)}</Text> },
      ...(current.reasonText
        ? [{ label: '메모', value: <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{current.reasonText}</Paragraph> }]
        : []),
      {
        label: '업로드',
        value: (
          <Text>
            {resolveUserName(userMap, current.uploadedBy)} ·{' '}
            {dayjs(current.uploadedAt).format('YYYY-MM-DD HH:mm')}
          </Text>
        ),
      },
      {
        label: '파일',
        value: <Text>{current.mimeType} · {formatBytes(current.fileSize)}</Text>,
      },
    ];
  }, [current, userMap]);

  if (!current) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 커스텀 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
        <Text strong style={{ fontSize: 15 }}>{title ?? '불량 증빙'}</Text>
        {total > 1 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {safeIndex + 1} / {total}
          </Text>
        )}
        {current.status === 'ORPHAN' && (
          <Tooltip title="원본 거래가 사라졌거나 분리된 사진입니다.">
            <Tag color="red" icon={<WarningOutlined />}>ORPHAN</Tag>
          </Tooltip>
        )}
        {current.status === 'PENDING' && <Tag color="default">PENDING</Tag>}
        <div style={{ flex: 1 }} />
        <Button type="text" onClick={onClose}>닫기</Button>
      </div>

      {/* 2단 본문: 좌측 이미지 + 우측 메타/액션. 좁은 화면에선 자동 wrap. */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* 좌측: 이미지 영역 */}
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          <div
            style={{
              position: 'relative',
              background: '#0f172a',
              borderRadius: 8,
              minHeight: 360,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {urlLoading || !download?.url ? (
              <Spin />
            ) : (
              <img
                src={download.url}
                alt={reasonLabel(current)}
                style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block' }}
              />
            )}
            {total > 1 && (
              <>
                <Button
                  shape="circle"
                  icon={<LeftOutlined />}
                  onClick={goPrev}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                />
                <Button
                  shape="circle"
                  icon={<RightOutlined />}
                  onClick={goNext}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}
                />
              </>
            )}
          </div>
        </div>

        {/* 우측: 메타 + 액션 */}
        <div style={{ flex: '0 1 280px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 10, fontSize: 13, alignContent: 'start' }}>
            {meta?.map((row) => (
              <div key={row.label} style={{ display: 'contents' }}>
                <Text type="secondary" style={{ fontSize: 12, paddingTop: 2 }}>{row.label}</Text>
                <div>{row.value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button
              block
              icon={<DownloadOutlined />}
              onClick={handleDownload}
              disabled={urlLoading || !download?.url}
            >
              다운로드
            </Button>
            {canDelete && (
              <Button
                block
                danger
                icon={<DeleteOutlined />}
                onClick={handleDelete}
                loading={deleteMutation.isPending}
              >
                삭제
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
