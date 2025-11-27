import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const hasSprints = metricsData?.hasSprints;

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Нет данных за {selectedYear} год
      </div>
    );
  }

  const xAxisLabel = hasSprints ? "Спринт" : "Месяц";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Innovation Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="sprintTitle" 
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
                  stroke="#cd253d" 
                  strokeWidth={2}
                  dot={{ fill: '#cd253d', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#cd253d' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Velocity (SP)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="sprintTitle" 
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
                  stroke="#2563eb" 
                  strokeWidth={2}
                  dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#2563eb' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">СПД (Соответствие Плану Доставки)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="sprintTitle" 
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
                  stroke="#16a34a" 
                  strokeWidth={2}
                  dot={{ fill: '#16a34a', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#16a34a' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
