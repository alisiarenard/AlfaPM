import { useQuery, useQueries } from "@tanstack/react-query";
import { useRef, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, Loader2 } from "lucide-react";

interface SpaceGroup {
  spaceId: string;
  spaceName: string;
  teamIds: string[];
}

interface MetricsPanelProps {
  teamIds: string[];
  selectedYear: string;
  spaceGroups?: SpaceGroup[];
  children?: ReactNode;
  bottomContent?: ReactNode;
  bottomExpanded?: boolean;
  onToggleBottom?: () => void;
  bottomLoading?: boolean;
}

export function MetricsPanel({ teamIds, selectedYear, spaceGroups = [], children, bottomContent, bottomExpanded = false, onToggleBottom, bottomLoading = false }: MetricsPanelProps) {
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

  const spaceIRQueries = useQueries({
    queries: spaceGroups.length > 1
      ? spaceGroups.map((group) => ({
          queryKey: ['/api/metrics/innovation-rate', { teamIds: group.teamIds.sort().join(','), year: selectedYear }],
          queryFn: async () => {
            const response = await fetch(`/api/metrics/innovation-rate?teamIds=${group.teamIds.sort().join(',')}&year=${selectedYear}`);
            if (!response.ok) throw new Error('Failed to fetch innovation rate');
            return response.json() as Promise<{ actualIR: number; plannedIR: number; diffFromPlanned: number }>;
          },
          enabled: group.teamIds.length > 0,
          placeholderData: (prev: any) => prev,
        }))
      : [],
  });

  const spaceIRData = spaceGroups.length > 1
    ? spaceGroups.map((group, i) => ({
        spaceName: group.spaceName,
        ir: (spaceIRQueries[i]?.data as any)?.actualIR ?? null,
      }))
    : [];

  const showIRTooltip = spaceGroups.length > 1 && spaceIRData.some(s => s.ir !== null);

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

  const irContent = (
    <div className="px-4 py-3 flex flex-col justify-between h-full">
      <div className="text-sm font-medium text-muted-foreground truncate">Innovation Rate</div>
      <div className="text-[28px] font-semibold" data-testid="metric-innovation-rate">
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
  );

  return (
    <div
      className={`w-full border border-border rounded-lg relative transition-opacity duration-300 ${bottomContent ? 'flex flex-col' : 'flex h-[110px]'}`}
      style={{ opacity: isIRFetching || isCostStructureFetching || isValueCostFetching ? 0.5 : 1, overflow: 'visible' }}
      data-testid="metrics-panel"
    >
      <div className="h-[110px] flex relative w-full">
        {showIRTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-[300px] shrink-0 cursor-help">
                {irContent}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex flex-col gap-1 min-w-[160px]">
              {spaceIRData.map((s) => (
                <div key={s.spaceName} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{s.spaceName}</span>
                  <span className="font-semibold">{s.ir !== null ? `${s.ir}%` : '—'}</span>
                </div>
              ))}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="w-[300px] shrink-0">
            {irContent}
          </div>
        )}
        <div className="border-l border-border my-3"></div>
        <div className="w-[300px] shrink-0 px-4 py-3 flex flex-col justify-between">
          <div className="text-sm font-medium text-muted-foreground truncate">Value/Cost</div>
          <div className="flex justify-between items-end w-full">
            <div className="flex flex-col items-center gap-1">
              <div className="text-[28px] font-semibold" data-testid="metric-value-cost-plan">
                {displayValueCost ? displayValueCost.plannedValueCost.toFixed(1) : '-'}
              </div>
              <div className="text-[0.8rem] text-muted-foreground">плановый</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-[28px] font-semibold" data-testid="metric-value-cost-actual">
                {displayValueCost ? displayValueCost.factValueCost.toFixed(1) : '-'}
              </div>
              <div className="text-[0.8rem] text-muted-foreground">фактический</div>
            </div>
          </div>
          <div></div>
        </div>
        <div className="border-l border-border my-3"></div>
        <div className="flex-1 pl-4 py-3 flex flex-col justify-between min-w-0">
          <div className="text-sm font-medium text-muted-foreground truncate">Структура затрат</div>
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
        {children}
      </div>
      {onToggleBottom && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={bottomLoading ? undefined : onToggleBottom}
              data-testid="button-toggle-flow"
              style={{
                position: 'absolute',
                left: '50%',
                top: bottomExpanded ? '220px' : '110px',
                transform: 'translateX(-50%) translateY(-50%)',
                transition: 'top 0.3s ease',
                zIndex: 20,
                cursor: bottomLoading ? 'default' : 'pointer',
              }}
              className="w-10 h-10 rounded-full border border-border bg-background flex items-center justify-center shadow-sm hover-elevate"
            >
              {bottomLoading ? (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <ChevronDown
                  className="h-4 w-4 text-muted-foreground transition-transform duration-300"
                  style={{ transform: bottomExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {bottomLoading ? 'Загрузка данных из Кайтен' : 'Показать все метрики'}
          </TooltipContent>
        </Tooltip>
      )}
      {bottomContent && (
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ maxHeight: bottomExpanded ? '120px' : '0px' }}
        >
          <div className="border-t border-border" />
          {bottomContent}
        </div>
      )}
    </div>
  );
}
