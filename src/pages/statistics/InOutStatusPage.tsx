import { useState } from 'react';
import { Typography, DatePicker, Table, Card, Tabs, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { DailyInOut, MonthlyInOut } from '@/types/statistics';
import { useDailyInOut, useMonthlyInOut } from '@/hooks/useStatisticsQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const today = dayjs();

const dailyColumns: ColumnsType<DailyInOut> = [
  { title: '일자', dataIndex: 'date', key: 'date', width: 120, align: 'center' },
  { title: '입고수량', dataIndex: 'inbound_qty', key: 'iq', width: 120, align: 'right', render: (v: number) => <span style={{ color: '#1677ff' }}>{(v ?? 0).toLocaleString()}</span> },
  { title: '출고수량', dataIndex: 'outbound_qty', key: 'oq', width: 120, align: 'right', render: (v: number) => <span style={{ color: '#fa8c16' }}>{(v ?? 0).toLocaleString()}</span> },
];

const monthlyColumns: ColumnsType<MonthlyInOut> = [
  { title: '월', dataIndex: 'month', key: 'month', width: 120, align: 'center', render: (v: string) => v?.slice(0, 7) ?? v },
  { title: '입고수량', dataIndex: 'inbound_qty', key: 'iq', width: 120, align: 'right', render: (v: number) => <span style={{ color: '#1677ff' }}>{(v ?? 0).toLocaleString()}</span> },
  { title: '출고수량', dataIndex: 'outbound_qty', key: 'oq', width: 120, align: 'right', render: (v: number) => <span style={{ color: '#fa8c16' }}>{(v ?? 0).toLocaleString()}</span> },
];

export default function InOutStatusPage() {
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');
  const [dailyRange, setDailyRange] = useState<[Dayjs, Dayjs]>([today.subtract(29, 'day'), today]);
  const [monthRange, setMonthRange] = useState<[Dayjs, Dayjs]>([today.subtract(3, 'month').startOf('month'), today]);
  const [warehouseId, setWarehouseId] = useState<string | undefined>(undefined);
  const { data: warehouses = [] } = useWarehouses();

  const dailyFrom = dailyRange[0].format('YYYY-MM-DD');
  const dailyTo = dailyRange[1].format('YYYY-MM-DD');
  const monthFrom = monthRange[0].format('YYYY-MM');
  const monthTo = monthRange[1].format('YYYY-MM');

  const { data: dailyData = [], isLoading: dailyLoading } = useDailyInOut(dailyFrom, dailyTo, warehouseId);
  const { data: monthlyData = [], isLoading: monthlyLoading } = useMonthlyInOut(monthFrom, monthTo);

  const dailyChart = dailyData.map((r) => ({ date: r.date.slice(5), 입고수량: r.inbound_qty, 출고수량: r.outbound_qty }));
  const monthlyChart = monthlyData.map((r) => ({ date: r.month.slice(0, 7), 입고수량: r.inbound_qty, 출고수량: r.outbound_qty }));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>입출고 현황</Title>
      </div>

      <Tabs activeKey={tab} onChange={(k) => setTab(k as 'daily' | 'monthly')} items={[
        {
          key: 'daily',
          label: '일별',
          children: (
            <>
              <Space style={{ marginBottom: 16 }}>
                <RangePicker value={dailyRange} onChange={(d) => { if (d?.[0] && d?.[1]) setDailyRange([d[0], d[1]]); }} />
                <Select placeholder="창고 (전체)" allowClear style={{ width: 200 }} value={warehouseId} onChange={setWarehouseId}
                  options={warehouses.map((w) => ({ label: `${w.code} — ${w.name}`, value: w.id }))} />
              </Space>
              <Card style={{ marginBottom: 24 }}>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={dailyChart} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="입고수량" stroke="#1677ff" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="출고수량" stroke="#fa8c16" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Table columns={dailyColumns} dataSource={dailyData} rowKey="date" size="middle" pagination={{ pageSize: 15 }} loading={dailyLoading} />
            </>
          ),
        },
        {
          key: 'monthly',
          label: '월별',
          children: (
            <>
              <Space style={{ marginBottom: 16 }}>
                <RangePicker picker="month" value={monthRange} onChange={(d) => { if (d?.[0] && d?.[1]) setMonthRange([d[0], d[1]]); }} />
              </Space>
              <Card style={{ marginBottom: 24 }}>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={monthlyChart} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="입고수량" stroke="#1677ff" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="출고수량" stroke="#fa8c16" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Table columns={monthlyColumns} dataSource={monthlyData} rowKey="month" size="middle" loading={monthlyLoading} />
            </>
          ),
        },
      ]} />
    </>
  );
}
