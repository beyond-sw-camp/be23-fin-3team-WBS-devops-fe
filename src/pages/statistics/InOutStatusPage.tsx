import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, DatePicker, Table, Card, Tabs, Select, Space, Statistic, Row, Col, Radio, Tag, Empty, Button, Popover, Switch, Divider,
} from 'antd';
import {
  ImportOutlined, ExportOutlined, SwapOutlined,
  CalendarOutlined, ArrowRightOutlined, DeploymentUnitOutlined,
  RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { DailyInOut, MonthlyInOut, StatisticOrderLink } from '@/types/statistics';
import { useDailyInOut, useMonthlyInOut } from '@/hooks/useStatisticsQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

type Tab = 'daily' | 'monthly';
type DailyPreset = '7d' | '30d' | '90d' | 'custom';

const today = dayjs();
const FLOW_ORDER = ['정상입고', '정상출고', '반품입고', '반품출고', '기타입고', '기타출고', '이동', '조정', '누적순증감'] as const;
const FLOW_COLORS: Record<(typeof FLOW_ORDER)[number], string> = {
  정상입고: '#1677ff',
  정상출고: '#fa8c16',
  반품입고: '#69b1ff',
  반품출고: '#ff9c6e',
  기타입고: '#36cfc9',
  기타출고: '#ff7875',
  이동: '#7c3aed',
  조정: '#13c2c2',
  누적순증감: '#10b981',
};

interface AugmentedRow {
  key: string;
  label: string;
  inbound: number;
  outbound: number;
  normalInbound: number;
  returnInbound: number;
  normalOutbound: number;
  returnOutbound: number;
  transfer: number;
  etcInbound: number;
  etcOutbound: number;
  adjustmentInbound: number;
  adjustmentOutbound: number;
  net: number;
  cumulative: number;
  flow: number;
  inboundOrders: StatisticOrderLink[];
  outboundOrders: StatisticOrderLink[];
  transferOrders: StatisticOrderLink[];
  etcOrders: StatisticOrderLink[];
  skuList: string[];
}

interface SummaryStats {
  totalInbound: number;
  totalOutbound: number;
  totalTransfer: number;
  totalFlow: number;
  totalAdjustmentInbound: number;
  totalAdjustmentOutbound: number;
  net: number;
  avgInbound: number;
  avgOutbound: number;
  avgTransfer: number;
  peakFlowLabel: string | null;
  peakFlowQty: number;
  activeBuckets: number;
}

function routeForOrder(order: StatisticOrderLink): string {
  switch (order.type) {
    case 'inbound': return `/order/inbound/${order.id}`;
    case 'outbound': return `/order/outbound/${order.id}`;
    case 'transfer': return `/order/transfer/${order.id}`;
    case 'etc_in': return `/etc-inout/in/${order.id}`;
    case 'etc_out': return `/etc-inout/out/${order.id}`;
    default: return '/';
  }
}

function augmentDaily(rows: DailyInOut[]): AugmentedRow[] {
  let cumulative = 0;
  return rows.map((row) => {
    const inbound = row.inbound_qty ?? 0;
    const outbound = row.outbound_qty ?? 0;
    const transfer = row.transfer_qty ?? 0;
    const adjustmentInbound = row.adjustment_inbound_qty ?? 0;
    const adjustmentOutbound = row.adjustment_outbound_qty ?? 0;
    const net = inbound - outbound;
    cumulative += net;

    return {
      key: row.date,
      label: row.date.slice(5),
      inbound,
      outbound,
      normalInbound: row.normal_inbound_qty ?? 0,
      returnInbound: row.return_inbound_qty ?? 0,
      normalOutbound: row.normal_outbound_qty ?? 0,
      returnOutbound: row.return_outbound_qty ?? 0,
      transfer,
      etcInbound: row.etc_inbound_qty ?? 0,
      etcOutbound: row.etc_outbound_qty ?? 0,
      adjustmentInbound,
      adjustmentOutbound,
      net,
      cumulative,
      flow: inbound + outbound + transfer,
      inboundOrders: row.inbound_orders ?? [],
      outboundOrders: row.outbound_orders ?? [],
      transferOrders: row.transfer_orders ?? [],
      etcOrders: row.etc_orders ?? [],
      skuList: row.sku_list ?? [],
    };
  });
}

function augmentMonthly(rows: MonthlyInOut[]): AugmentedRow[] {
  let cumulative = 0;
  return rows.map((row) => {
    const inbound = row.inbound_qty ?? 0;
    const outbound = row.outbound_qty ?? 0;
    const transfer = row.transfer_qty ?? 0;
    const adjustmentInbound = row.adjustment_inbound_qty ?? 0;
    const adjustmentOutbound = row.adjustment_outbound_qty ?? 0;
    const net = inbound - outbound;
    cumulative += net;

    return {
      key: row.month.slice(0, 7),
      label: row.month.slice(0, 7),
      inbound,
      outbound,
      normalInbound: row.normal_inbound_qty ?? 0,
      returnInbound: row.return_inbound_qty ?? 0,
      normalOutbound: row.normal_outbound_qty ?? 0,
      returnOutbound: row.return_outbound_qty ?? 0,
      transfer,
      etcInbound: row.etc_inbound_qty ?? 0,
      etcOutbound: row.etc_outbound_qty ?? 0,
      adjustmentInbound,
      adjustmentOutbound,
      net,
      cumulative,
      flow: inbound + outbound + transfer,
      inboundOrders: [],
      outboundOrders: [],
      transferOrders: [],
      etcOrders: [],
      skuList: [],
    };
  });
}

function summarize(rows: AugmentedRow[]): SummaryStats {
  if (rows.length === 0) {
    return {
      totalInbound: 0,
      totalOutbound: 0,
      totalTransfer: 0,
      totalFlow: 0,
      totalAdjustmentInbound: 0,
      totalAdjustmentOutbound: 0,
      net: 0,
      avgInbound: 0,
      avgOutbound: 0,
      avgTransfer: 0,
      peakFlowLabel: null,
      peakFlowQty: 0,
      activeBuckets: 0,
    };
  }

  let totalInbound = 0;
  let totalOutbound = 0;
  let totalTransfer = 0;
  let totalFlow = 0;
  let totalAdjustmentInbound = 0;
  let totalAdjustmentOutbound = 0;
  let activeBuckets = 0;
  let peakFlow = rows[0];

  for (const row of rows) {
    totalInbound += row.inbound;
    totalOutbound += row.outbound;
    totalTransfer += row.transfer;
    totalFlow += row.flow;
    totalAdjustmentInbound += row.adjustmentInbound;
    totalAdjustmentOutbound += row.adjustmentOutbound;
    if (row.flow > peakFlow.flow) peakFlow = row;
    if (row.flow > 0) activeBuckets += 1;
  }

  return {
    totalInbound,
    totalOutbound,
    totalTransfer,
    totalFlow,
    totalAdjustmentInbound,
    totalAdjustmentOutbound,
    net: totalInbound - totalOutbound,
    avgInbound: Math.round(totalInbound / rows.length),
    avgOutbound: Math.round(totalOutbound / rows.length),
    avgTransfer: Math.round(totalTransfer / rows.length),
    peakFlowLabel: peakFlow.flow > 0 ? peakFlow.label : null,
    peakFlowQty: peakFlow.flow,
    activeBuckets,
  };
}

function renderNumber(value: number, color?: string, strong = false) {
  if (!value) return <span style={{ color: '#cbd5e1' }}>-</span>;
  return (
    <span style={{ color: color ?? 'inherit', fontWeight: strong ? 600 : 400 }}>
      {value.toLocaleString()}
    </span>
  );
}

function renderOrderLinks(orders: StatisticOrderLink[], navigate: ReturnType<typeof useNavigate>) {
  if (orders.length === 0) return <Text type="secondary">-</Text>;

  const preview = orders.slice(0, 2);
  const hidden = orders.slice(2);
  const popover = (
    <div style={{ minWidth: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {orders.map((order) => (
        <Button
          key={order.id}
          type="link"
          size="small"
          style={{ padding: 0, justifyContent: 'flex-start' }}
          onClick={() => navigate(routeForOrder(order))}
        >
          {order.order_no}
        </Button>
      ))}
    </div>
  );

  return (
    <Space size={4} wrap>
      {preview.map((order) => (
        <Button
          key={order.id}
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto' }}
          onClick={() => navigate(routeForOrder(order))}
        >
          {order.order_no}
        </Button>
      ))}
      {hidden.length > 0 && (
        <Popover trigger="click" content={popover}>
          <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}>
            외 {hidden.length}건
          </Button>
        </Popover>
      )}
    </Space>
  );
}

function renderSkuSummary(skus: string[]) {
  if (skus.length === 0) return <Text type="secondary">-</Text>;

  const preview = skus.slice(0, 2);
  const hidden = skus.slice(2);
  const popover = (
    <div style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {skus.map((sku) => (
        <Text key={sku} style={{ fontSize: 12 }}>{sku}</Text>
      ))}
    </div>
  );

  return (
    <Space size={4} wrap>
      <Text>{preview.join(', ')}</Text>
      {hidden.length > 0 && (
        <Popover trigger="hover" content={popover}>
          <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}>
            외 {hidden.length}종
          </Button>
        </Popover>
      )}
    </Space>
  );
}

function renderBreakdown(row: AugmentedRow) {
  const items = [
    { label: '정상입고', value: row.normalInbound, color: 'blue' },
    { label: '정상출고', value: row.normalOutbound, color: 'orange' },
    { label: '반품입고', value: row.returnInbound, color: 'cyan' },
    { label: '반품출고', value: row.returnOutbound, color: 'gold' },
    { label: '기타입고', value: row.etcInbound, color: 'geekblue' },
    { label: '기타출고', value: row.etcOutbound, color: 'volcano' },
    { label: '이동', value: row.transfer, color: 'purple' },
    { label: '조정', value: row.adjustmentInbound + row.adjustmentOutbound, color: 'green' },
  ].filter((item) => item.value > 0);

  if (items.length === 0) return <Text type="secondary">-</Text>;

  const popover = (
    <div style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Text>{item.label}</Text>
          <Tag color={item.color} style={{ margin: 0 }}>{item.value.toLocaleString()}</Tag>
        </div>
      ))}
    </div>
  );

  return (
    <Popover trigger="click" content={popover}>
      <Button type="link" size="small" style={{ padding: 0, height: 'auto' }}>
        {items.slice(0, 2).map((item) => item.label).join(', ')}
        {items.length > 2 ? ` 외 ${items.length - 2}` : ''}
      </Button>
    </Popover>
  );
}

function renderOrderedLegend(props: { payload?: ReadonlyArray<{ value?: string; color?: string; type?: string }> }) {
  const payload = props.payload ?? [];
  const payloadMap = new Map(
    payload
      .filter((item) => typeof item.value === 'string')
      .map((item) => [item.value as string, item]),
  );

  return (
    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
      {FLOW_ORDER.map((key) => {
        const item = payloadMap.get(key);
        if (!item) return null;
        const color = item.color ?? FLOW_COLORS[key];
        const isLine = key === '누적순증감';
        return (
          <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
            {isLine ? (
              <span style={{ width: 14, height: 2, background: color, display: 'inline-block', position: 'relative' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', position: 'absolute', top: -2, left: 4 }} />
              </span>
            ) : (
              <span style={{ width: 14, height: 14, background: color, display: 'inline-block' }} />
            )}
            {key}
          </span>
        );
      })}
    </div>
  );
}

function renderOrderedTooltip({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<{ dataKey?: string; value?: string | number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const payloadMap = new Map(
    payload
      .filter((item) => typeof item.dataKey === 'string')
      .map((item) => [item.dataKey as string, typeof item.value === 'number' ? item.value : Number(item.value ?? 0)]),
  );

  return (
    <div style={{ background: '#fff', border: '1px solid #d9d9d9', padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      {FLOW_ORDER.map((key) => {
        const value = payloadMap.get(key);
        if (value == null) return null;
        return (
          <div key={key} style={{ color: FLOW_COLORS[key], marginBottom: 4 }}>
            {key} : {value}
          </div>
        );
      })}
    </div>
  );
}

export default function InOutStatusPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('daily');
  const [dailyPreset, setDailyPreset] = useState<DailyPreset>('30d');
  const [hideEmptyDays, setHideEmptyDays] = useState(true);
  const [dailyRange, setDailyRange] = useState<[Dayjs, Dayjs]>([today.subtract(29, 'day'), today]);
  const [monthRange, setMonthRange] = useState<[Dayjs, Dayjs]>([today.subtract(5, 'month').startOf('month'), today]);
  const [warehouseId, setWarehouseId] = useState<string | undefined>(undefined);
  const { data: warehouses = [] } = useWarehouses();

  const dailyFrom = dailyRange[0].format('YYYY-MM-DD');
  const dailyTo = dailyRange[1].format('YYYY-MM-DD');
  const monthFrom = monthRange[0].format('YYYY-MM');
  const monthTo = monthRange[1].format('YYYY-MM');

  const { data: dailyData = [], isLoading: dailyLoading } = useDailyInOut(dailyFrom, dailyTo, warehouseId);
  const { data: monthlyData = [], isLoading: monthlyLoading } = useMonthlyInOut(monthFrom, monthTo, warehouseId);

  const dailyRows = useMemo(() => augmentDaily(dailyData), [dailyData]);
  const monthlyRows = useMemo(() => augmentMonthly(monthlyData), [monthlyData]);
  const visibleDailyRows = useMemo(
    () => (hideEmptyDays ? dailyRows.filter((row) => row.flow > 0 || row.net !== 0) : dailyRows),
    [dailyRows, hideEmptyDays],
  );

  const dailySummary = useMemo(() => summarize(dailyRows), [dailyRows]);
  const monthlySummary = useMemo(() => summarize(monthlyRows), [monthlyRows]);

  const applyDailyPreset = (preset: DailyPreset) => {
    setDailyPreset(preset);
    if (preset === '7d') setDailyRange([today.subtract(6, 'day'), today]);
    else if (preset === '30d') setDailyRange([today.subtract(29, 'day'), today]);
    else if (preset === '90d') setDailyRange([today.subtract(89, 'day'), today]);
  };

  const renderSummaryCards = (summary: SummaryStats, unit: '일' | '월') => {
    const hasAdjustment = summary.totalAdjustmentInbound > 0 || summary.totalAdjustmentOutbound > 0;
    const netColor = summary.net >= 0 ? '#10b981' : '#ef4444';
    const NetIcon = summary.net >= 0 ? RiseOutlined : FallOutlined;

    return (
      <>
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={12} md={6}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<><ImportOutlined style={{ color: '#1677ff', marginRight: 4 }} />총 입고</>}
                value={summary.totalInbound}
                valueStyle={{ color: '#1677ff', fontSize: 24, fontWeight: 600 }}
                suffix={<Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}> · {unit}평균 {summary.avgInbound.toLocaleString()}</Text>}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<><ExportOutlined style={{ color: '#fa8c16', marginRight: 4 }} />총 출고</>}
                value={summary.totalOutbound}
                valueStyle={{ color: '#fa8c16', fontSize: 24, fontWeight: 600 }}
                suffix={<Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}> · {unit}평균 {summary.avgOutbound.toLocaleString()}</Text>}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<><SwapOutlined style={{ color: '#7c3aed', marginRight: 4 }} />총 이동</>}
                value={summary.totalTransfer}
                valueStyle={{ color: '#7c3aed', fontSize: 24, fontWeight: 600 }}
                suffix={<Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}> · {unit}평균 {summary.avgTransfer.toLocaleString()}</Text>}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" styles={{ body: { padding: 14 } }}>
              <Statistic
                title={<><NetIcon style={{ color: netColor, marginRight: 4 }} />재고 순증감 <Text type="secondary" style={{ fontSize: 11, fontWeight: 'normal' }}>(입고−출고)</Text></>}
                value={summary.net}
                valueStyle={{ color: netColor, fontSize: 24, fontWeight: 600 }}
                prefix={summary.net > 0 ? '+' : ''}
                suffix={<Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}> · 활동 {summary.activeBuckets.toLocaleString()}{unit === '일' ? '일' : '개월'}</Text>}
              />
            </Card>
          </Col>
        </Row>

        <Card
          size="small"
          style={{ marginBottom: 16, background: '#fafafa', borderColor: '#e2e8f0' }}
          styles={{ body: { padding: '10px 16px' } }}
        >
          <Space split={<Divider type="vertical" style={{ borderColor: '#cbd5e1', margin: 0 }} />} size={14} wrap>
            <Space size={8}>
              <DeploymentUnitOutlined style={{ color: '#64748b' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>총 활동량 (입고+출고+이동)</Text>
              <Text strong style={{ fontSize: 14, color: '#0f172a' }}>{summary.totalFlow.toLocaleString()}</Text>
            </Space>
            {summary.peakFlowLabel && (
              <Space size={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>가장 바쁜 {unit}</Text>
                <Tag color="purple" style={{ margin: 0 }}>{summary.peakFlowLabel} · {summary.peakFlowQty.toLocaleString()}건</Tag>
              </Space>
            )}
            {hasAdjustment && (
              <Space size={8}>
                <Text type="secondary" style={{ fontSize: 12 }}>재고조정</Text>
                {summary.totalAdjustmentInbound > 0 && <Tag color="cyan" style={{ margin: 0 }}>입고 +{summary.totalAdjustmentInbound.toLocaleString()}</Tag>}
                {summary.totalAdjustmentOutbound > 0 && <Tag color="red" style={{ margin: 0 }}>출고 -{summary.totalAdjustmentOutbound.toLocaleString()}</Tag>}
              </Space>
            )}
          </Space>
        </Card>
      </>
    );
  };

  const renderChart = (rows: AugmentedRow[], height = 360) => {
    if (rows.length === 0) {
      return <Empty description="데이터가 없습니다" style={{ padding: 60 }} />;
    }
    const chartData = rows.map((row) => ({
      label: row.label,
      정상입고: row.normalInbound,
      정상출고: row.normalOutbound,
      반품입고: row.returnInbound,
      반품출고: row.returnOutbound,
      기타입고: row.etcInbound,
      기타출고: row.etcOutbound,
      이동: row.transfer,
      조정: row.adjustmentInbound - row.adjustmentOutbound,
      누적순증감: row.cumulative,
    }));

    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" />
          <YAxis yAxisId="left" fontSize={11} />
          <YAxis yAxisId="right" orientation="right" fontSize={11} />
          <Tooltip content={renderOrderedTooltip as never} />
          <Legend wrapperStyle={{ fontSize: 12 }} content={renderOrderedLegend as never} />
          <Bar yAxisId="left" dataKey="정상입고" stackId="inbound" fill="#1677ff" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar yAxisId="left" dataKey="정상출고" stackId="outbound" fill="#fa8c16" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar yAxisId="left" dataKey="반품입고" stackId="inbound" fill="#69b1ff" maxBarSize={28} />
          <Bar yAxisId="left" dataKey="반품출고" stackId="outbound" fill="#ff9c6e" maxBarSize={28} />
          <Bar yAxisId="left" dataKey="기타입고" stackId="inbound" fill="#36cfc9" maxBarSize={28} />
          <Bar yAxisId="left" dataKey="기타출고" stackId="outbound" fill="#ff7875" maxBarSize={28} />
          <Bar yAxisId="left" dataKey="이동" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Bar yAxisId="left" dataKey="조정" fill="#13c2c2" radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Line yAxisId="right" type="monotone" dataKey="누적순증감" stroke="#10b981" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  const renderRelatedOrders = (row: AugmentedRow) => {
    const groups = [
      { label: '입고', orders: row.inboundOrders },
      { label: '출고', orders: row.outboundOrders },
      { label: '이동', orders: row.transferOrders },
      { label: '기타', orders: row.etcOrders },
    ].filter((group) => group.orders.length > 0);

    if (groups.length === 0) return <Text type="secondary">-</Text>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {groups.map((group) => (
          <div key={group.label} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <Text type="secondary" style={{ fontSize: 12, minWidth: 32 }}>{group.label}</Text>
            <div style={{ flex: 1 }}>{renderOrderLinks(group.orders, navigate)}</div>
          </div>
        ))}
      </div>
    );
  };

  const dailyTableColumns: ColumnsType<AugmentedRow> = [
    { title: '일자', dataIndex: 'label', key: 'label', width: 90, align: 'center' },
    {
      title: '총입고',
      dataIndex: 'inbound',
      key: 'inbound',
      width: 110,
      align: 'right',
      render: (value: number) => renderNumber(value, value > 0 ? '#1677ff' : undefined),
    },
    {
      title: '총출고',
      dataIndex: 'outbound',
      key: 'outbound',
      width: 110,
      align: 'right',
      render: (value: number) => renderNumber(value, value > 0 ? '#fa8c16' : undefined),
    },
    {
      title: '이동',
      dataIndex: 'transfer',
      key: 'transfer',
      width: 110,
      align: 'right',
      render: (value: number) => renderNumber(value, value > 0 ? '#7c3aed' : undefined),
    },
    {
      title: '조정',
      key: 'adjustment',
      width: 130,
      align: 'right',
      render: (_, row) => {
        if (!row.adjustmentInbound && !row.adjustmentOutbound) return <span style={{ color: '#cbd5e1' }}>-</span>;
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            {row.adjustmentInbound > 0 && <span style={{ color: '#13c2c2' }}>+{row.adjustmentInbound.toLocaleString()}</span>}
            {row.adjustmentInbound > 0 && row.adjustmentOutbound > 0 ? ' / ' : ''}
            {row.adjustmentOutbound > 0 && <span style={{ color: '#cf1322' }}>-{row.adjustmentOutbound.toLocaleString()}</span>}
          </span>
        );
      },
    },
    {
      title: '순증감',
      dataIndex: 'net',
      key: 'net',
      width: 110,
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value > 0 ? '#52c41a' : value < 0 ? '#ff4d4f' : '#cbd5e1', fontWeight: 600 }}>
          {value ? `${value > 0 ? '+' : ''}${value.toLocaleString()}` : '-'}
        </span>
      ),
    },
    {
      title: '세부 분류',
      key: 'breakdown',
      width: 180,
      render: (_, row) => renderBreakdown(row),
    },
    {
      title: '관련 지시서',
      key: 'orders',
      width: 320,
      render: (_, row) => renderRelatedOrders(row),
    },
    {
      title: 'SKU 요약',
      dataIndex: 'skuList',
      key: 'skuList',
      width: 220,
      render: (value: string[]) => renderSkuSummary(value),
    },
    {
      title: '누적',
      dataIndex: 'cumulative',
      key: 'cumulative',
      width: 110,
      align: 'right',
      render: (value: number) => <strong>{value ? value.toLocaleString() : 0}</strong>,
    },
  ];

  const movementColumn = (title: string, key: keyof AugmentedRow, color: string): ColumnsType<AugmentedRow>[number] => ({
    title,
    dataIndex: key,
    key: String(key),
    width: 110,
    align: 'right',
    render: (value: number) => renderNumber(value, value > 0 ? color : undefined),
  });

  const monthlyTableColumns: ColumnsType<AugmentedRow> = [
    { title: '월', dataIndex: 'label', key: 'label', width: 110, align: 'center' },
    movementColumn('정상입고', 'normalInbound', '#1677ff'),
    movementColumn('정상출고', 'normalOutbound', '#fa8c16'),
    movementColumn('반품입고', 'returnInbound', '#69b1ff'),
    movementColumn('반품출고', 'returnOutbound', '#ff9c6e'),
    movementColumn('기타입고', 'etcInbound', '#36cfc9'),
    movementColumn('기타출고', 'etcOutbound', '#ff7875'),
    movementColumn('이동', 'transfer', '#7c3aed'),
    {
      title: '조정',
      key: 'adjustment',
      width: 130,
      align: 'right',
      render: (_, row) => {
        if (!row.adjustmentInbound && !row.adjustmentOutbound) return <span style={{ color: '#cbd5e1' }}>-</span>;
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            {row.adjustmentInbound > 0 && <span style={{ color: '#13c2c2' }}>+{row.adjustmentInbound.toLocaleString()}</span>}
            {row.adjustmentInbound > 0 && row.adjustmentOutbound > 0 ? ' / ' : ''}
            {row.adjustmentOutbound > 0 && <span style={{ color: '#cf1322' }}>-{row.adjustmentOutbound.toLocaleString()}</span>}
          </span>
        );
      },
    },
    {
      title: '순증감',
      dataIndex: 'net',
      key: 'net',
      width: 110,
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value > 0 ? '#52c41a' : value < 0 ? '#ff4d4f' : '#cbd5e1', fontWeight: 600 }}>
          {value ? `${value > 0 ? '+' : ''}${value.toLocaleString()}` : '-'}
        </span>
      ),
    },
    {
      title: '총 흐름',
      dataIndex: 'flow',
      key: 'flow',
      width: 110,
      align: 'right',
      render: (value: number) => <strong>{value ? value.toLocaleString() : 0}</strong>,
    },
    {
      title: '누적',
      dataIndex: 'cumulative',
      key: 'cumulative',
      width: 110,
      align: 'right',
      render: (value: number) => <strong>{value ? value.toLocaleString() : 0}</strong>,
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>입출고 현황</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          정상입고·반품입고·정상출고·반품출고·이동·기타입출고·재고조정까지 포함한 재고 흐름을 기간별로 확인할 수 있습니다.
        </Text>
      </div>

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as Tab)}
        items={[
          {
            key: 'daily',
            label: '일별 운영',
            children: (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  일자별 입·출고 흐름과 관련 지시서·SKU를 추적합니다.
                </Text>
                <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '14px 18px' } }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 24, rowGap: 10 }}>
                    <Space size={8} align="center">
                      <CalendarOutlined style={{ color: '#64748b' }} />
                      <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>기간</Text>
                      <Radio.Group size="small" value={dailyPreset} onChange={(e) => applyDailyPreset(e.target.value)}>
                        <Radio.Button value="7d">7일</Radio.Button>
                        <Radio.Button value="30d">30일</Radio.Button>
                        <Radio.Button value="90d">90일</Radio.Button>
                        <Radio.Button value="custom">사용자 지정</Radio.Button>
                      </Radio.Group>
                      <RangePicker
                        value={dailyRange}
                        onChange={(dates) => {
                          if (dates?.[0] && dates?.[1]) {
                            setDailyRange([dates[0], dates[1]]);
                            setDailyPreset('custom');
                          }
                        }}
                        disabledDate={(date) => date.isAfter(today, 'day')}
                      />
                    </Space>
                    <Space size={8} align="center">
                      <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>창고</Text>
                      <Select
                        placeholder="전체"
                        allowClear
                        style={{ width: 220 }}
                        value={warehouseId}
                        onChange={setWarehouseId}
                        options={warehouses.map((warehouse) => ({
                          label: `${warehouse.code} — ${warehouse.name}`,
                          value: warehouse.id,
                        }))}
                      />
                    </Space>
                    <div style={{ marginLeft: 'auto' }}>
                      <Space size={6}>
                        <Button size="small" type="link" onClick={() => navigate('/statistics/ranking')}>
                          품번별 출고 순위 <ArrowRightOutlined />
                        </Button>
                        <Button size="small" type="link" onClick={() => navigate('/statistics/turnover')}>
                          재고 회전율 <ArrowRightOutlined />
                        </Button>
                      </Space>
                    </div>
                  </div>
                </Card>

                {renderSummaryCards(dailySummary, '일')}

                <Card size="small" style={{ marginBottom: 12 }} title={<Text strong>일별 재고 흐름</Text>}>
                  {renderChart(dailyRows)}
                </Card>

                <Card
                  size="small"
                  title={(
                    <Space size={12} wrap>
                      <Text strong>일별 상세</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {visibleDailyRows.length.toLocaleString()} / {dailyRows.length.toLocaleString()}일 표시
                      </Text>
                      <Space size={6}>
                        <Text type="secondary" style={{ fontSize: 12 }}>변동 없는 날짜 숨기기</Text>
                        <Switch size="small" checked={hideEmptyDays} onChange={setHideEmptyDays} />
                      </Space>
                    </Space>
                  )}
                >
                  <Table
                    columns={dailyTableColumns}
                    dataSource={visibleDailyRows}
                    rowKey="key"
                    size="middle"
                    scroll={{ x: 1560 }}
                    pagination={{ pageSize: 15 }}
                    loading={dailyLoading}
                    summary={() => (
                      <Table.Summary.Row style={{ background: '#f8fafc', fontWeight: 600 }}>
                        <Table.Summary.Cell index={0} align="center">합계</Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right"><span style={{ color: '#1677ff' }}>{dailySummary.totalInbound.toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right"><span style={{ color: '#fa8c16' }}>{dailySummary.totalOutbound.toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right"><span style={{ color: '#7c3aed' }}>{dailySummary.totalTransfer.toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">
                          <span style={{ whiteSpace: 'nowrap' }}>
                            {dailySummary.totalAdjustmentInbound > 0 && <span style={{ color: '#13c2c2' }}>+{dailySummary.totalAdjustmentInbound.toLocaleString()}</span>}
                            {dailySummary.totalAdjustmentInbound > 0 && dailySummary.totalAdjustmentOutbound > 0 ? ' / ' : ''}
                            {dailySummary.totalAdjustmentOutbound > 0 && <span style={{ color: '#cf1322' }}>-{dailySummary.totalAdjustmentOutbound.toLocaleString()}</span>}
                            {!dailySummary.totalAdjustmentInbound && !dailySummary.totalAdjustmentOutbound && <span style={{ color: '#cbd5e1' }}>-</span>}
                          </span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <span style={{ color: dailySummary.net >= 0 ? '#52c41a' : '#ff4d4f' }}>
                            {dailySummary.net >= 0 ? '+' : ''}{dailySummary.net.toLocaleString()}
                          </span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} />
                        <Table.Summary.Cell index={7} />
                        <Table.Summary.Cell index={8} align="center"><Text type="secondary">-</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={9} align="right">
                          <strong>{(dailyRows.length > 0 ? dailyRows[dailyRows.length - 1].cumulative : 0).toLocaleString()}</strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'monthly',
            label: '월별 마감',
            children: (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  월 단위 마감 리포트 — 정상·반품·기타 카테고리를 분해해 누계로 보여줍니다.
                </Text>
                <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '14px 18px' } }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 24, rowGap: 10 }}>
                    <Space size={8} align="center">
                      <CalendarOutlined style={{ color: '#64748b' }} />
                      <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>기간</Text>
                      <RangePicker
                        picker="month"
                        value={monthRange}
                        onChange={(dates) => {
                          if (dates?.[0] && dates?.[1]) setMonthRange([dates[0], dates[1]]);
                        }}
                      />
                    </Space>
                    <Space size={8} align="center">
                      <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>창고</Text>
                      <Select
                        placeholder="전체"
                        allowClear
                        style={{ width: 220 }}
                        value={warehouseId}
                        onChange={setWarehouseId}
                        options={warehouses.map((warehouse) => ({
                          label: `${warehouse.code} — ${warehouse.name}`,
                          value: warehouse.id,
                        }))}
                      />
                    </Space>
                  </div>
                </Card>

                {renderSummaryCards(monthlySummary, '월')}

                <Card size="small" style={{ marginBottom: 12 }} title={<Text strong>월별 재고 흐름</Text>}>
                  {renderChart(monthlyRows, 380)}
                </Card>

                <Card
                  size="small"
                  title={(
                    <Space size={12} wrap>
                      <Text strong>월별 상세</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{monthlyRows.length.toLocaleString()}개월</Text>
                    </Space>
                  )}
                >
                  <Table
                    columns={monthlyTableColumns}
                    dataSource={monthlyRows}
                    rowKey="key"
                    size="middle"
                    scroll={{ x: 1600 }}
                    pagination={false}
                    loading={monthlyLoading}
                    summary={() => (
                      <Table.Summary.Row style={{ background: '#f8fafc', fontWeight: 600 }}>
                        <Table.Summary.Cell index={0} align="center">합계</Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right"><span style={{ color: '#1677ff' }}>{monthlyRows.reduce((sum, row) => sum + row.normalInbound, 0).toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right"><span style={{ color: '#69b1ff' }}>{monthlyRows.reduce((sum, row) => sum + row.returnInbound, 0).toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right"><span style={{ color: '#fa8c16' }}>{monthlyRows.reduce((sum, row) => sum + row.normalOutbound, 0).toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right"><span style={{ color: '#ff9c6e' }}>{monthlyRows.reduce((sum, row) => sum + row.returnOutbound, 0).toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right"><span style={{ color: '#7c3aed' }}>{monthlySummary.totalTransfer.toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right"><span style={{ color: '#36cfc9' }}>{monthlyRows.reduce((sum, row) => sum + row.etcInbound, 0).toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right"><span style={{ color: '#ff7875' }}>{monthlyRows.reduce((sum, row) => sum + row.etcOutbound, 0).toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={8} align="right"><span style={{ color: '#13c2c2' }}>{monthlyRows.reduce((sum, row) => sum + row.adjustmentInbound, 0).toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={9} align="right"><span style={{ color: '#cf1322' }}>{monthlyRows.reduce((sum, row) => sum + row.adjustmentOutbound, 0).toLocaleString()}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={10} align="right">
                          <span style={{ color: monthlySummary.net >= 0 ? '#52c41a' : '#ff4d4f' }}>
                            {monthlySummary.net >= 0 ? '+' : ''}{monthlySummary.net.toLocaleString()}
                          </span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={11} align="right"><strong>{monthlySummary.totalFlow.toLocaleString()}</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={12} align="right">
                          <strong>{(monthlyRows.length > 0 ? monthlyRows[monthlyRows.length - 1].cumulative : 0).toLocaleString()}</strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                </Card>
              </>
            ),
          },
        ]}
      />
    </>
  );
}
