import { useState } from 'react';
import { Typography, DatePicker, Table, Card, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { MonthlyTurnover } from '@/types/statistics';
import { useMonthlyTurnovers } from '@/hooks/useStatisticsQuery';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const today = dayjs();

const columns: ColumnsType<MonthlyTurnover> = [
  { title: '월', dataIndex: 'month', key: 'month', width: 120, align: 'center', render: (v: string) => v?.slice(0, 7) ?? v },
  { title: '출고수량', dataIndex: 'outbound_qty', key: 'oq', width: 120, align: 'right', render: (v: number) => (v ?? 0).toLocaleString() },
  { title: '평균재고', dataIndex: 'average_inventory', key: 'ai', width: 120, align: 'right', render: (v: number) => (v ?? 0).toLocaleString() },
  {
    title: '회전율', dataIndex: 'turnover_rate', key: 'tr', width: 100, align: 'right',
    sorter: (a, b) => a.turnover_rate - b.turnover_rate,
    render: (v: number) => {
      const color = v === 0 ? '#ff4d4f' : v < 0.3 ? '#fa8c16' : '#52c41a';
      return <strong style={{ color }}>{(v ?? 0).toFixed(2)}</strong>;
    },
  },
];

export default function TurnoverPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([today.subtract(5, 'month').startOf('month'), today]);
  const from = range[0].format('YYYY-MM');
  const to = range[1].format('YYYY-MM');

  const { data: turnovers = [], isLoading } = useMonthlyTurnovers(from, to);

  const chartData = turnovers.map((r) => ({
    월: r.month.slice(0, 7),
    회전율: r.turnover_rate,
    출고수량: r.outbound_qty,
    평균재고: r.average_inventory,
  }));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>재고 회전율</Title>
        <Space>
          <RangePicker picker="month" value={range} onChange={(d) => { if (d?.[0] && d?.[1]) setRange([d[0], d[1]]); }} />
        </Space>
      </div>

      <Card style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="월" fontSize={12} />
            <YAxis yAxisId="rate" fontSize={12} orientation="left" domain={[0, 'auto']} />
            <YAxis yAxisId="qty" fontSize={12} orientation="right" />
            <Tooltip />
            <Legend />
            <Line yAxisId="rate" type="monotone" dataKey="회전율" stroke="#52c41a" strokeWidth={2} dot={{ r: 4 }} />
            <Line yAxisId="qty" type="monotone" dataKey="출고수량" stroke="#1677ff" strokeWidth={1} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Table columns={columns} dataSource={turnovers} rowKey="month" size="middle" pagination={false} loading={isLoading} />
    </>
  );
}
