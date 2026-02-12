import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricsPanelProps {
  teamIds: string[];
  selectedYear: string;
}

export function MetricsPanel({ teamIds, selectedYear }: MetricsPanelProps) {
  const teamIdsParam = teamIds.sort().join(',');

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
    enabled: teamIds.length > 0,
    placeholderData: (previousData) => previousData,
  });

  const lastSuccessfulDataRef = useRef<typeof innovationRateData | null>(null);
  if (innovationRateData && !isIRFetching) {
    lastSuccessfulDataRef.current = innovationRateData;
  }
  const displayIR = innovationRateData || lastSuccessfulDataRef.current;

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
    enabled: teamIds.length > 0,
    placeholderData: (previousData) => previousData,
  });

  const lastSuccessfulCostStructureRef = useRef<typeof costStructureData | null>(null);
  if (costStructureData && !isCostStructureFetching) {
    lastSuccessfulCostStructureRef.current = costStructureData;
  }
  const displayCostStructure = costStructureData || lastSuccessfulCostStructureRef.current;

  const { data: valueCostData, isFetching: isValueCostFetching } = useQuery<{
    success: boolean;
    plannedValueCost: number;
    factValueCost: number;
    sumPlannedValue: number;
    sumPlannedCost: number;
    sumFactValue: number;
    sumFactCost: number;
  }>({
    queryKey: ['/api/metrics/value-cost', { teamIds: teamIdsParam, year: selectedYear }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/value-cost?teamIds=${teamIdsParam}&year=${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch value/cost');
      return response.json();
    },
    enabled: teamIds.length > 0,
    placeholderData: (previousData) => previousData,
  });

  const lastSuccessfulValueCostRef = useRef<typeof valueCostData | null>(null);
  if (valueCostData && !isValueCostFetching) {
    lastSuccessfulValueCostRef.current = valueCostData;
  }
  const displayValueCost = valueCostData || lastSuccessfulValueCostRef.current;

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
      className="w-full h-[110px] border border-border rounded-lg flex relative transition-opacity duration-300"
      style={{ opacity: isIRFetching || isCostStructureFetching || isValueCostFetching ? 0.5 : 1 }}
      data-testid="metrics-panel"
    >
      <div className="w-[17%] px-4 py-3 flex flex-col justify-between">
        <div className="text-sm font-bold text-muted-foreground">Innovation Rate</div>
        <div className="text-3xl font-semibold" data-testid="metric-innovation-rate">
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
      <div className="w-[17%] px-4 py-3 flex flex-col justify-between">
        <div className="text-sm font-bold text-muted-foreground">Value/Cost</div>
        <div className="flex justify-between items-end w-full">
          <div className="flex flex-col items-center gap-1">
            <div className="text-3xl font-semibold" data-testid="metric-value-cost-plan">
              {displayValueCost ? displayValueCost.plannedValueCost.toFixed(1) : '-'}
            </div>
            <div className="text-[0.8rem] text-muted-foreground">плановый</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-3xl font-semibold" data-testid="metric-value-cost-actual">
              {displayValueCost ? displayValueCost.factValueCost.toFixed(1) : '-'}
            </div>
            <div className="text-[0.8rem] text-muted-foreground">фактический</div>
          </div>
        </div>
        <div></div>
      </div>
      <div className="border-l border-border my-3"></div>
      <div className="w-[66%] pl-4 py-3 flex flex-col justify-between">
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
                    data-testid={`cost-${type.key.toLowerCase().replace(/\s+/g, '-')}`}
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
