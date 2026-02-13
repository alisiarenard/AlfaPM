import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { TeamRow } from "@shared/schema";

interface MetricsChartsProps {
  team: TeamRow;
  selectedYear: string;
}

interface MetricDataPoint {
  sprintId: number;
  sprintTitle: string;
  startDate: string;
  finishDate: string;
  velocity: number;
  innovationRate: number;
  deliveryPlanCompliance: number;
}

interface MetricsDynamicsResponse {
  success: boolean;
  teamId: string;
  year: number;
  hasSprints: boolean;
  data: MetricDataPoint[];
}

const CHART_COLOR = "#cd253d";
const AVG_LINE_COLOR = "#888888";

function formatDateRange(startDate: string, finishDate: string): string {
  const start = new Date(startDate);
  const finish = new Date(finishDate);
  return `${format(start, 'd MMM', { locale: ru })} - ${format(finish, 'd MMM yyyy', { locale: ru })}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { startDate: string; finishDate: string }; value: number }>;
  label?: string;
  formatter: (value: number) => string;
  metricName: string;
}

function CustomTooltip({ active, payload, formatter, metricName }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  
  const data = payload[0].payload;
  const value = payload[0].value;
  const dateRange = formatDateRange(data.startDate, data.finishDate);
  
  return (
    <div 
      style={{ 
        backgroundColor: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '6px',
        padding: '8px 12px'
      }}
    >
      <p style={{ color: 'hsl(var(--foreground))', margin: 0, marginBottom: '4px', fontSize: '12px' }}>
        {dateRange}
      </p>
      <p style={{ color: 'hsl(var(--foreground))', margin: 0, fontSize: '14px', fontWeight: 500 }}>
        {metricName}: {formatter(value)}
      </p>
    </div>
  );
}

export function MetricsCharts({ team, selectedYear }: MetricsChartsProps) {
  const { data: metricsData, isLoading, error } = useQuery<MetricsDynamicsResponse>({
    queryKey: ["/api/metrics/dynamics", team.teamId, selectedYear],
    queryFn: async () => {
      console.log(`[MetricsCharts] Fetching metrics for team ${team.teamId}, year ${selectedYear}`);
      const response = await fetch(`/api/metrics/dynamics?teamId=${team.teamId}&year=${selectedYear}`);
      const data = await response.json();
      console.log(`[MetricsCharts] Response:`, data);
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch metrics dynamics');
      }
      return data;
    },
    enabled: !!team.teamId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="loader"></span>
      </div>
    );
  }

  if (error) {
    console.error('[MetricsCharts] Error:', error);
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Ошибка загрузки данных: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  const allMonths = Array.from({ length: 12 }, (_, i) => ({
    monthIndex: i,
    monthLabel: format(new Date(parseInt(selectedYear), i, 1), 'LLL', { locale: ru }),
  }));

  const rawChartData = metricsData?.data || [];
  
  const chartData = allMonths.map(m => {
    const pointsInMonth = rawChartData.filter(d => new Date(d.finishDate).getMonth() === m.monthIndex);
    if (pointsInMonth.length === 0) {
      return { monthIndex: m.monthIndex, month: m.monthLabel, innovationRate: null as number | null, velocity: null as number | null, deliveryPlanCompliance: null as number | null, startDate: '', finishDate: '' };
    }
    const last = pointsInMonth[pointsInMonth.length - 1];
    const avgIR = pointsInMonth.reduce((s, p) => s + p.innovationRate, 0) / pointsInMonth.length;
    const avgVel = pointsInMonth.reduce((s, p) => s + p.velocity, 0) / pointsInMonth.length;
    const avgDPC = pointsInMonth.reduce((s, p) => s + p.deliveryPlanCompliance, 0) / pointsInMonth.length;
    return {
      monthIndex: m.monthIndex,
      month: m.monthLabel,
      innovationRate: Math.round(avgIR * 10) / 10,
      velocity: Math.round(avgVel * 10) / 10,
      deliveryPlanCompliance: Math.round(avgDPC * 10) / 10,
      startDate: pointsInMonth[0].startDate,
      finishDate: last.finishDate,
    };
  });

  if (rawChartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Нет данных за {selectedYear} год
      </div>
    );
  }

  const renderDot = (dataKey: string) => (props: any) => {
    const { cx, cy, payload } = props;
    if (payload[dataKey] === null || payload[dataKey] === undefined) return <circle cx={0} cy={0} r={0} fill="none" />;
    return <circle cx={cx} cy={cy} r={2} fill={CHART_COLOR} strokeWidth={0} />;
  };

  const dataWithIR = chartData.filter(d => d.innovationRate !== null);
  const avgInnovationRate = dataWithIR.length > 0 
    ? Math.round(dataWithIR.reduce((sum, d) => sum + (d.innovationRate ?? 0), 0) / dataWithIR.length)
    : 0;
  
  const dataWithDPC = chartData.filter(d => d.deliveryPlanCompliance !== null);
  const avgDeliveryPlanCompliance = dataWithDPC.length > 0 
    ? Math.round(dataWithDPC.reduce((sum, d) => sum + (d.deliveryPlanCompliance ?? 0), 0) / dataWithDPC.length)
    : 0;

  const dataWithVel = chartData.filter(d => d.velocity !== null);
  const avgVelocityForChart = dataWithVel.length > 0 
    ? Math.round(dataWithVel.reduce((sum, d) => sum + (d.velocity ?? 0), 0) / dataWithVel.length)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-8 py-4">
      <div className="flex flex-col">
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip 
                content={<CustomTooltip formatter={(v) => `${v}%`} metricName="IR" />}
              />
              <ReferenceLine 
                y={avgInnovationRate} 
                stroke={AVG_LINE_COLOR} 
                strokeDasharray="5 5"
                strokeWidth={1}
              />
              <Line 
                type="monotone" 
                dataKey="innovationRate" 
                stroke={CHART_COLOR} 
                strokeWidth={2}
                dot={renderDot('innovationRate')}
                activeDot={{ r: 4, fill: CHART_COLOR }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-center text-sm font-medium text-muted-foreground mt-2">
          Innovation Rate
        </div>
      </div>

      <div className="flex flex-col">
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip 
                content={<CustomTooltip formatter={(v) => `${(v).toFixed(1)} SP`} metricName="Velocity" />}
              />
              <ReferenceLine 
                y={avgVelocityForChart} 
                stroke={AVG_LINE_COLOR} 
                strokeDasharray="5 5"
                strokeWidth={1}
              />
              <Line 
                type="monotone" 
                dataKey="velocity" 
                stroke={CHART_COLOR} 
                strokeWidth={2}
                dot={renderDot('velocity')}
                activeDot={{ r: 4, fill: CHART_COLOR }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-center text-sm font-medium text-muted-foreground mt-2">
          Velocity (SP)
        </div>
      </div>

      <div className="flex flex-col">
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip 
                content={<CustomTooltip formatter={(v) => `${v}%`} metricName="СПД" />}
              />
              <ReferenceLine 
                y={avgDeliveryPlanCompliance} 
                stroke={AVG_LINE_COLOR} 
                strokeDasharray="5 5"
                strokeWidth={1}
              />
              <Line 
                type="monotone" 
                dataKey="deliveryPlanCompliance" 
                stroke={CHART_COLOR} 
                strokeWidth={2}
                dot={renderDot('deliveryPlanCompliance')}
                activeDot={{ r: 4, fill: CHART_COLOR }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-center text-sm font-medium text-muted-foreground mt-2">
          Соблюдение плана доставки (СПД)
        </div>
      </div>
    </div>
  );
}
