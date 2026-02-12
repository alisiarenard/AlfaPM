import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TeamMetricsPanelProps {
  teamId: string;
  selectedYear: string;
}

export function TeamMetricsPanel({ teamId, selectedYear }: TeamMetricsPanelProps) {
  const teamIdsParam = teamId;

  const { data: innovationRateData, isFetching: isIRFetching } = useQuery<{
    actualIR: number;
    plannedIR: number;
    diffFromPlanned: number;
    totalSP: number;
    innovationSP: number;
  }>({
    queryKey: ['/api/metrics/innovation-rate', { teamIds: teamIdsParam, year: selectedYear }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/innovation-rate?teamIds=${teamIdsParam}&year=${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch innovation rate');
      return response.json();
    },
    enabled: !!teamId,
    placeholderData: (previousData) => previousData,
  });

  const lastIRRef = useRef<typeof innovationRateData | null>(null);
  if (innovationRateData && !isIRFetching) lastIRRef.current = innovationRateData;
  const displayIR = innovationRateData || lastIRRef.current;

  const { data: sprintStatsData, isFetching: isSprintStatsFetching } = useQuery<{
    avgVelocity: number | null;
    avgSPD: number | null;
    year: number;
    teamId: string;
  }>({
    queryKey: ['/api/metrics/team-sprint-stats', { teamId, year: selectedYear }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/team-sprint-stats?teamId=${teamId}&year=${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch sprint stats');
      return response.json();
    },
    enabled: !!teamId,
    placeholderData: (previousData) => previousData,
  });

  const lastSprintStatsRef = useRef<typeof sprintStatsData | null>(null);
  if (sprintStatsData && !isSprintStatsFetching) lastSprintStatsRef.current = sprintStatsData;
  const displaySprintStats = sprintStatsData || lastSprintStatsRef.current;

  const { data: costStructureData, isFetching: isCostStructureFetching } = useQuery<{
    success: boolean;
    year: number;
    totalSP: number;
    typeStats: Record<string, number>;
    typePercentages: Record<string, number>;
    teams: Array<{ id: string; name: string }>;
  }>({
    queryKey: ['/api/metrics/cost-structure', { teamIds: teamIdsParam, year: selectedYear }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/cost-structure?teamIds=${teamIdsParam}&year=${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch cost structure');
      return response.json();
    },
    enabled: !!teamId,
    placeholderData: (previousData) => previousData,
  });

  const lastCostStructureRef = useRef<typeof costStructureData | null>(null);
  if (costStructureData && !isCostStructureFetching) lastCostStructureRef.current = costStructureData;
  const displayCostStructure = costStructureData || lastCostStructureRef.current;

  const isFetching = isIRFetching || isSprintStatsFetching || isCostStructureFetching;

  const costTypes = [
    { key: 'Epic', color: '#cd253d' },
    { key: 'Compliance', color: '#cd253d' },
    { key: 'Enabler', color: '#cd253d' },
    { key: 'Security', color: undefined },
    { key: 'Service Desk', color: undefined },
    { key: 'Postmortem', color: undefined },
    { key: 'Tech debt', color: undefined },
    { key: 'Bug', color: undefined },
    { key: 'Др. доработки', color: undefined, minWidth: '80px' },
  ];

  return (
    <div
      className="w-full h-[110px] border border-border rounded-lg flex relative transition-opacity duration-300 mb-4"
      style={{ opacity: isFetching ? 0.5 : 1 }}
      data-testid="team-metrics-panel"
    >
      <div className="w-[17%] px-4 py-3 flex flex-col justify-between">
        <div className="text-sm font-bold text-muted-foreground">Innovation Rate</div>
        <div className="text-3xl font-semibold" data-testid="team-metric-innovation-rate">
          {displayIR ? `${displayIR.actualIR}%` : '-'}
        </div>
        <div className="text-[0.8rem] text-muted-foreground truncate">
          {displayIR && (
            <span
              className="font-semibold"
              style={{ color: displayIR.diffFromPlanned >= 0 ? '#16a34a' : '#cd253d' }}
            >
              {displayIR.diffFromPlanned >= 0 ? '+' : ''}{displayIR.diffFromPlanned}%
            </span>
          )}
          {displayIR && ' от планового значения'}
        </div>
      </div>
      <div className="border-l border-border my-3"></div>
      <div className="w-[10%] px-4 py-3 flex flex-col justify-between">
        <div className="text-sm font-bold text-muted-foreground">Velocity</div>
        <div className="text-3xl font-semibold" data-testid="team-metric-velocity">
          {displaySprintStats?.avgVelocity !== null && displaySprintStats?.avgVelocity !== undefined ? displaySprintStats.avgVelocity : '-'}
        </div>
        <div className="text-[0.8rem] text-muted-foreground truncate">
          {displaySprintStats?.avgVelocity !== null ? 'среднее за год' : 'нет данных'}
        </div>
      </div>
      <div className="border-l border-border my-3"></div>
      <div className="w-[10%] px-4 py-3 flex flex-col justify-between">
        <div className="text-sm font-bold text-muted-foreground whitespace-nowrap">СПД</div>
        <div className="text-3xl font-semibold" data-testid="team-metric-spd">
          {displaySprintStats?.avgSPD !== null && displaySprintStats?.avgSPD !== undefined ? `${displaySprintStats.avgSPD}%` : '-'}
        </div>
        <div className="text-[0.8rem] text-muted-foreground truncate">
          {displaySprintStats?.avgSPD !== null ? 'среднее за год' : 'нет данных'}
        </div>
      </div>
      <div className="border-l border-border my-3"></div>
      <div className="flex-1 pl-4 py-3 flex flex-col justify-between">
        <div className="text-sm font-bold text-muted-foreground">Структура затрат</div>
        <div className="flex gap-2 items-end flex-1">
          {costTypes.map((type) => (
            <Tooltip key={type.key}>
              <TooltipTrigger asChild>
                <div
                  className="flex flex-col items-center gap-1 flex-1 cursor-help"
                  style={type.minWidth ? { minWidth: type.minWidth } : undefined}
                >
                  <div
                    className={`text-[1rem] font-semibold ${type.color ? '' : 'text-muted-foreground'}`}
                    style={type.color ? { color: type.color } : undefined}
                    data-testid={`team-cost-${type.key.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {displayCostStructure?.typePercentages?.[type.key] || 0}%
                  </div>
                  <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">{type.key}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>{(displayCostStructure?.typeStats?.[type.key] || 0).toFixed(1)} SP</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
