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

  const chartData = metricsData?.data || [];

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Нет данных за {selectedYear} год
      </div>
    );
  }

  const avgInnovationRate = chartData.length > 0 
    ? Math.round(chartData.reduce((sum, d) => sum + d.innovationRate, 0) / chartData.length)
    : 0;
  
  const avgVelocity = chartData.length > 0 
    ? Math.round(chartData.reduce((sum, d) => sum + d.velocity, 0) / chartData.length)
    : 0;
  
  const avgDeliveryPlanCompliance = chartData.length > 0 
    ? Math.round(chartData.reduce((sum, d) => sum + d.deliveryPlanCompliance, 0) / chartData.length)
    : 0;

  // Данные для графика velocity - среднее за 2 спринта
  const velocityChartData: Array<{ sprintTitle: string; velocity: number; startDate: string; finishDate: string; month: string }> = [];
  for (let i = 0; i < chartData.length; i += 2) {
    if (i + 1 < chartData.length) {
      // Есть пара спринтов - берём среднее
      const avgVel = (chartData[i].velocity + chartData[i + 1].velocity) / 2;
      const finishDate = chartData[i + 1].finishDate;
      velocityChartData.push({
        sprintTitle: `${chartData[i].sprintTitle} - ${chartData[i + 1].sprintTitle}`,
        velocity: Math.round(avgVel * 10) / 10,
        startDate: chartData[i].startDate,
        finishDate: finishDate,
        month: format(new Date(finishDate), 'LLL', { locale: ru })
      });
    } else {
      // Нечётное количество - последний спринт как есть
      const finishDate = chartData[i].finishDate;
      velocityChartData.push({
        sprintTitle: chartData[i].sprintTitle,
        velocity: chartData[i].velocity,
        startDate: chartData[i].startDate,
        finishDate: finishDate,
        month: format(new Date(finishDate), 'LLL', { locale: ru })
      });
    }
  }

  // Среднее velocity пересчитываем по усреднённым данным
  const avgVelocityForChart = velocityChartData.length > 0 
    ? Math.round(velocityChartData.reduce((sum, d) => sum + d.velocity, 0) / velocityChartData.length)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-8 py-4">
      <div className="flex flex-col">
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="sprintTitle" 
                tick={false}
                tickLine={false}
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
                dot={{ fill: CHART_COLOR, strokeWidth: 0, r: 1 }}
                activeDot={{ r: 4, fill: CHART_COLOR }}
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
            <LineChart data={velocityChartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
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
                content={<CustomTooltip formatter={(v) => `${(v).toFixed(1)} SP`} metricName="Velocity (avg 2 sprints)" />}
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
                dot={{ fill: CHART_COLOR, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: CHART_COLOR }}
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
                dataKey="sprintTitle" 
                tick={false}
                tickLine={false}
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
                dot={{ fill: CHART_COLOR, strokeWidth: 0, r: 1 }}
                activeDot={{ r: 4, fill: CHART_COLOR }}
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
