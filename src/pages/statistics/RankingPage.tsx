import { useState, useMemo } from 'react';
import { Typography, DatePicker, Table, Card, Tag, InputNumber, Space, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useSkuRankings } from '@/hooks/useStatisticsQuery';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const today = dayjs();
const medalColor = ['#faad14', '#bfbfbf', '#d48806'];
const barColors = [
  '#1677ff', '#2f9cff', '#52b0ff', '#73c0ff', '#95d0ff',
  '#aed8ff', '#c5e2ff', '#d9ecff', '#e8f3ff', '#f0f7ff',
];

export default function RankingPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([today.subtract(29, 'day'), today]);
  const [limit, setLimit] = useState(10);

  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');
  const { data: skuRankings = [], isLoading } = useSkuRankings(from, to, limit);

  // ratio를 프론트에서 계산
  const totalQty = useMemo(() => skuRankings.reduce((s, r) => s + r.outbound_qty, 0), [skuRankings]);
  const enriched = useMemo(
    () => skuRankings.map((r) => ({ ...r, ratio: totalQty > 0 ? (r.outbound_qty / totalQty) * 100 : 0 })),
    [skuRankings, totalQty],
  );

  const chartData = useMemo(
    () => [...enriched].reverse().map((r) => ({ sku: r.sku, 출고수량: r.outbound_qty, rank: r.rank })),
    [enriched],
  );

  const columns: ColumnsType<typeof enriched[number]> = [
    {
      title: '순위', dataIndex: 'rank', key: 'rank', width: 70, align: 'center',
      render: (v: number) => v <= 3
        ? <Tag color={medalColor[v - 1]} style={{ fontWeight: 'bold', minWidth: 28, textAlign: 'center' }}>{v}</Tag>
        : v,
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '출고수량', dataIndex: 'outbound_qty', key: 'oq', width: 120, align: 'right', render: (v: number) => (v ?? 0).toLocaleString() },
    { title: '비율', dataIndex: 'ratio', key: 'ratio', width: 90, align: 'right', render: (v: number) => `${v.toFixed(1)}%` },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>품번별 출고 순위</Title>
        <Space>
          <RangePicker value={range} onChange={(d) => { if (d?.[0] && d?.[1]) setRange([d[0], d[1]]); }} />
          <Space.Compact size="small">
            <Button size="small" disabled style={{ cursor: 'default' }}>Top</Button>
            <InputNumber min={5} max={50} value={limit} onChange={(v) => setLimit(Number(v ?? 10))} style={{ width: 60 }} />
          </Space.Compact>
        </Space>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={Math.max(300, skuRankings.length * 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" fontSize={12} />
            <YAxis type="category" dataKey="sku" fontSize={11} width={150} />
            <Tooltip />
            <Bar dataKey="출고수량" radius={[0, 4, 4, 0]}>
              {chartData.map((_entry, idx) => (
                <Cell key={idx} fill={barColors[chartData.length - 1 - idx] ?? '#1677ff'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table columns={columns} dataSource={enriched} rowKey="rank" size="middle" pagination={false} loading={isLoading} />
    </>
  );
}
