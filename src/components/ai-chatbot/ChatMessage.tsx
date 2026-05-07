import { Alert, Button, Space, Tag, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage as ChatMsg, AssistantRender } from './useChatSession';

const { Text, Paragraph } = Typography;
type WorkRow = Record<string, unknown>;

interface Props {
  message: ChatMsg;
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: '88%',
          padding: '10px 14px',
          borderRadius: 12,
          background: isUser ? '#1677ff' : '#f5f5f5',
          color: isUser ? '#fff' : '#000',
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          <Paragraph style={{ margin: 0, color: '#fff', whiteSpace: 'pre-wrap' }}>
            {message.text}
          </Paragraph>
        ) : (
          <AssistantBody render={message.render} />
        )}
      </div>
    </div>
  );
}

function AssistantBody({ render }: { render: AssistantRender }) {
  if (render.kind === 'work-query') {
    const rows = render.data.rows;
    if (rows.length === 0) {
      return (
        <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
          {render.data.answer || '죄송합니다. 요청하신 질문을 처리할 수 없습니다.'}
        </Paragraph>
      );
    }
    return (
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
          {render.data.answer || fallbackSummary(render.data.intent, rows)}
        </Paragraph>
        {rows.length > 0 && (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {rows.slice(0, 4).map((row, index) => (
              <WorkResultCard key={index} intent={render.data.intent} row={row} />
            ))}
          </Space>
        )}
      </Space>
    );
  }
  if (render.kind === 'rag') {
    return (
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
          {render.data.answer}
        </Paragraph>
      </Space>
    );
  }
  if (render.kind === 'error') {
    return <Alert type="error" message={render.message} showIcon style={{ margin: 0 }} />;
  }
  return null;
}

function WorkResultCard({ intent, row }: { intent: string; row: WorkRow }) {
  const navigate = useNavigate();
  const view = buildCardView(intent, row);
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e8edf5',
        borderRadius: 12,
        padding: '12px 14px',
        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.05)',
      }}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Space align="center" wrap>
          <Text strong style={{ color: '#111827' }}>
            {view.title}
          </Text>
          {view.status && <Tag color={statusColor(view.status)}>{statusLabel(view.status)}</Tag>}
        </Space>
        {view.description && (
          <Text style={{ color: '#4b5563', fontSize: 13 }}>{view.description}</Text>
        )}
        <Space size={[6, 6]} wrap>
          {view.details.map((detail) => (
            <Tag key={detail} style={{ marginInlineEnd: 0 }}>
              {detail}
            </Tag>
          ))}
        </Space>
        <Button
          type="link"
          size="small"
          icon={<ArrowRightOutlined />}
          onClick={() => navigate(view.href)}
          style={{ alignSelf: 'flex-start', padding: 0, height: 'auto' }}
        >
          {view.actionLabel}
        </Button>
      </Space>
    </div>
  );
}

function buildCardView(intent: string, row: WorkRow) {
  if (intent === 'MY_PICKING_TASKS') {
    const requiredQty = numberValue(row.required_qty);
    const pickedQty = numberValue(row.picked_qty);
    return {
      title: textValue(row.picking_no, '피킹 작업'),
      status: textValue(row.status),
      description: `${textValue(row.warehouse_name, '창고 미확인')}에서 처리할 피킹 작업입니다.`,
      details: [
        `상품 ${textValue(row.item_count, '0')}종`,
        `피킹 ${pickedQty}/${requiredQty}개`,
      ],
      href: '/order/picking',
      actionLabel: '피킹 리스트로 이동',
    };
  }

  if (intent === 'INVENTORY_LOCATION') {
    return {
      title: textValue(row.product_name, '상품 재고'),
      status: '',
      description: `${textValue(row.warehouse_name, '창고 미확인')} · ${textValue(row.location_code, '위치 미지정')}`,
      details: [
        `가용 ${textValue(row.available_qty, '0')}개`,
        `예약 ${textValue(row.reserved_qty, '0')}개`,
        `입고예정 ${textValue(row.incoming_qty, '0')}개`,
        `총 ${textValue(row.total_qty, '0')}개`,
      ],
      href: '/inventory/stocks',
      actionLabel: '재고 현황으로 이동',
    };
  }

  if (intent === 'LOW_STOCK') {
    return {
      title: textValue(row.product_name, '부족 재고'),
      status: 'low',
      description: `${textValue(row.warehouse_name, '창고 미확인')} 기준 재고 보충 검토가 필요합니다.`,
      details: [
        `가용 ${textValue(row.available_qty, '0')}개`,
        `예약 ${textValue(row.reserved_qty, '0')}개`,
        `입고예정 ${textValue(row.incoming_qty, '0')}개`,
      ],
      href: '/common/low-stock',
      actionLabel: '부족 재고로 이동',
    };
  }

  if (intent === 'INBOUND_STATUS') {
    return {
      title: textValue(row.order_no, '입고 지시서'),
      status: textValue(row.status),
      description: `${textValue(row.warehouse_name, '창고 미확인')} 입고 작업입니다.`,
      details: [
        `예정일 ${textValue(row.expected_date, '-')}`,
        `상품 ${textValue(row.item_count, '0')}종`,
        `입고 ${textValue(row.received_qty, '0')}/${textValue(row.ordered_qty, '0')}개`,
      ],
      href: '/order/inbound',
      actionLabel: '입고 지시서로 이동',
    };
  }

  if (intent === 'OUTBOUND_STATUS') {
    return {
      title: textValue(row.order_no, '출고 지시서'),
      status: textValue(row.status),
      description: `${textValue(row.warehouse_name, '창고 미확인')} 출고 작업입니다.`,
      details: [
        `출고일 ${textValue(row.scheduled_date, '-')}`,
        `상품 ${textValue(row.item_count, '0')}종`,
        `피킹 ${textValue(row.picked_qty, '0')}/${textValue(row.ordered_qty, '0')}개`,
        `출고 ${textValue(row.dispatched_qty, '0')}개`,
      ],
      href: '/order/outbound',
      actionLabel: '출고 지시서로 이동',
    };
  }

  const workType = textValue(row.work_type, '');
  return {
    title: `${textValue(row.work_type, '업무')} ${textValue(row.document_no, '지시서')}`,
    status: textValue(row.status),
    description: `${textValue(row.warehouse_name, '창고 미확인')}에서 처리해야 합니다.`,
    details: [`처리일 ${textValue(row.scheduled_date, '-')}`],
    href: workType === '입고' ? '/order/inbound' : workType === '출고' ? '/order/outbound' : '/order/incomplete',
    actionLabel: workType === '입고' ? '입고 지시서로 이동' : workType === '출고' ? '출고 지시서로 이동' : '미처리 지시서로 이동',
  };
}

function fallbackSummary(intent: string, rows: WorkRow[]) {
  if (rows.length === 0) return '조건에 맞는 업무 데이터가 없습니다.';
  const first = rows[0];
  if (intent === 'MY_PICKING_TASKS') {
    return `오늘 담당 피킹 작업이 ${rows.length}개 있습니다. 우선 ${textValue(first.picking_no)} 작업부터 확인해 주세요.`;
  }
  if (intent === 'INVENTORY_LOCATION') {
    return `${textValue(first.product_name)} 재고 위치를 찾았습니다. ${textValue(first.warehouse_name)}의 ${textValue(first.location_code)}에 있습니다.`;
  }
  if (intent === 'LOW_STOCK') {
    return `재고 부족 위험 품목이 ${rows.length}개 있습니다. 가용 수량이 낮은 품목부터 보충을 검토해 주세요.`;
  }
  return `처리해야 할 업무가 ${rows.length}건 있습니다. 우선순위가 높은 항목부터 확인해 주세요.`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '대기',
    in_progress: '진행 중',
    approved: '승인 완료',
    received: '입고 완료',
    placing: '적치 중',
    draft: '작성 중',
    partial: '부분 완료',
    low: '부족 위험',
    picking: '피킹 중',
    completed: '완료',
  };
  return labels[status] ?? status;
}

function statusColor(status: string) {
  const colors: Record<string, string> = {
    pending: 'orange',
    in_progress: 'blue',
    approved: 'green',
    received: 'cyan',
    placing: 'purple',
    draft: 'default',
    partial: 'gold',
    low: 'red',
    picking: 'blue',
    completed: 'green',
  };
  return colors[status] ?? 'default';
}

function textValue(value: unknown, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
