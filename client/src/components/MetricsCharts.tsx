import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
      <div className="flex flex-col">
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [`${value}%`, 'IR']}
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
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="sprintTitle" 
                tick={false}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [`${value} SP`, 'Velocity']}
              />
              <Line 
                type="monotone" 
                dataKey="velocity" 
                stroke={CHART_COLOR} 
                strokeWidth={2}
                dot={{ fill: CHART_COLOR, strokeWidth: 0, r: 1 }}
                activeDot={{ r: 4, fill: CHART_COLOR }}
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
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [`${value}%`, 'СПД']}
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
          СПД (Соответствие Плану Доставки)
        </div>
      </div>
    </div>
  );
}
