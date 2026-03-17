import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import { useLocation } from "wouter";
import { MetricsPanel } from "@/components/MetricsPanel";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { MoreVertical, Download, ChevronDown, ChevronRight, Columns, Users, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import type { DepartmentWithTeamCount, TeamRow } from "@shared/schema";
import { getKaitenCardUrl } from "@shared/kaiten.config";

const currentYear = new Date().getFullYear();

interface ProductMetricsPageProps {
  selectedDepartment: string;
  setSelectedDepartment: (dept: string) => void;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  departments?: DepartmentWithTeamCount[];
  setPageSubtitle: (subtitle: string) => void;
}

export default function ProductMetricsPage({ selectedDepartment, setSelectedDepartment, selectedYear, setSelectedYear, departments, setPageSubtitle }: ProductMetricsPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [initiativeFilter, setInitiativeFilter] = useState<string>("all");
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['Epic', 'Compliance', 'Enabler']));
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(['effectType', 'contribution', 'participants']));
  const [filterTeamIds, setFilterTeamIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingCell, setEditingCell] = useState<{ cardId: number; field: 'plannedEffect' | 'actualEffect' } | null>(null);
  const [editingCellValue, setEditingCellValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const updateEffectMutation = useMutation({
    mutationFn: async ({ cardId, plannedValue, factValue }: {
      cardId: number;
      plannedValue?: string | null;
      factValue?: string | null;
    }) => {
      const response = await fetch(`/api/kaiten/update-initiative/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedValue, factValue }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update initiative');
      }
      return response.json();
    },
    onSuccess: () => {
      setEditingCell(null);
      setEditingCellValue("");
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/initiatives-table'] });
      toast({ title: "Значение обновлено" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка обновления", description: error.message, variant: "destructive" });
    },
  });

  const startCellEdit = (cardId: number, field: 'plannedEffect' | 'actualEffect', currentValue: number | null) => {
    setEditingCell({ cardId, field });
    setEditingCellValue(currentValue !== null && currentValue > 0 ? String(currentValue) : "");
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const commitCellEdit = () => {
    if (!editingCell) return;
    const cleanedValue = editingCellValue.replace(/\s/g, '').replace(',', '.');
    const numValue = cleanedValue === '' ? null : parseFloat(cleanedValue);

    if (numValue !== null && (isNaN(numValue) || numValue < 0)) {
      toast({ title: "Некорректное значение", variant: "destructive" });
      cancelCellEdit();
      return;
    }

    const updateData: { cardId: number; plannedValue?: string | null; factValue?: string | null } = {
      cardId: editingCell.cardId,
    };

    if (editingCell.field === 'plannedEffect') {
      updateData.plannedValue = numValue !== null ? String(numValue) : null;
    } else {
      updateData.factValue = numValue !== null ? String(numValue) : null;
    }

    updateEffectMutation.mutate(updateData);
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditingCellValue("");
  };

  const parseUrlParams = useCallback(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return {
      dept: searchParams.get('dept') || '',
      year: searchParams.get('year') || currentYear.toString(),
      spaces: searchParams.get('spaces')?.split(',').filter(Boolean) || [],
      filter: searchParams.get('filter') || 'all',
    };
  }, []);

  const { data: departmentTeams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", selectedDepartment],
    enabled: !!selectedDepartment,
  });

  useEffect(() => {
    if (!isInitialLoad) return;
    const searchParams = new URLSearchParams(window.location.search);
    const urlDept = searchParams.get('dept');
    const urlYear = searchParams.get('year');
    const urlFilter = searchParams.get('filter');

    if (urlDept && departments?.some(d => d.id === urlDept)) {
      setSelectedDepartment(urlDept);
    }
    if (urlYear) {
      setSelectedYear(urlYear);
    }
    if (urlFilter && ['all', 'done', 'active', 'backlog'].includes(urlFilter)) {
      setInitiativeFilter(urlFilter);
    }
  }, [departments, isInitialLoad]);

  useEffect(() => {
    if (!departmentTeams || departmentTeams.length === 0) return;
    if (isInitialLoad) {
      const urlParams = parseUrlParams();
      if (urlParams.spaces.length > 0) {
        const spaceIdSet = new Set(urlParams.spaces);
        const teamsToSelect = departmentTeams.filter(t => spaceIdSet.has(String(t.initSpaceId || t.initBoardId)));
        if (teamsToSelect.length > 0) {
          setSelectedTeams(new Set(teamsToSelect.map(t => t.teamId)));
        } else {
          setSelectedTeams(new Set(departmentTeams.map(t => t.teamId)));
        }
      } else {
        setSelectedTeams(new Set(departmentTeams.map(t => t.teamId)));
      }
      setFilterTeamIds(new Set(departmentTeams.map(t => t.teamId)));
      setIsInitialLoad(false);
    } else {
      setSelectedTeams(new Set(departmentTeams.map(t => t.teamId)));
      setFilterTeamIds(new Set(departmentTeams.map(t => t.teamId)));
    }
  }, [departmentTeams, isInitialLoad]);

  const teamIdsArray = Array.from(selectedTeams);
  const teamIdsParam = teamIdsArray.sort().join(',');

  const spaceGroups = useMemo(() => {
    if (!departmentTeams) return [];
    const groups = new Map<string, { spaceId: string; spaceName: string; teamIds: string[] }>();
    for (const team of departmentTeams) {
      const key = String(team.initSpaceId || team.initBoardId);
      if (!groups.has(key)) {
        groups.set(key, { spaceId: key, spaceName: team.initSpaceName || `Пространство ${team.initSpaceId || team.initBoardId}`, teamIds: [] });
      }
      groups.get(key)!.teamIds.push(team.teamId);
    }
    return Array.from(groups.values());
  }, [departmentTeams]);

  const selectedSpaceIds = useMemo(() => {
    if (!spaceGroups.length) return [];
    return spaceGroups
      .filter(g => g.teamIds.every(id => selectedTeams.has(id)))
      .map(g => g.spaceId);
  }, [spaceGroups, selectedTeams]);

  const notAllSpacesSelected = spaceGroups.length > 0 && selectedSpaceIds.length < spaceGroups.length;
  const selectedSpaceNames = useMemo(() => {
    return spaceGroups
      .filter(g => g.teamIds.every(id => selectedTeams.has(id)))
      .map(g => g.spaceName);
  }, [spaceGroups, selectedTeams]);

  useEffect(() => {
    setPageSubtitle(selectedSpaceNames.length > 0 ? selectedSpaceNames.join(', ') : '');
    return () => setPageSubtitle('');
  }, [selectedSpaceNames, setPageSubtitle]);

  useEffect(() => {
    if (isInitialLoad || !selectedDepartment) return;
    const params = new URLSearchParams();
    params.set('dept', selectedDepartment);
    params.set('year', selectedYear);
    if (selectedSpaceIds.length > 0 && selectedSpaceIds.length < spaceGroups.length) {
      params.set('spaces', selectedSpaceIds.join(','));
    }
    if (initiativeFilter !== 'all') {
      params.set('filter', initiativeFilter);
    }
    const newUrl = `/product-metrics?${params.toString()}`;
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      setLocation(newUrl);
    }
  }, [selectedDepartment, selectedYear, selectedSpaceIds, initiativeFilter, isInitialLoad, spaceGroups.length]);

  const handleSyncSpaces = async () => {
    const ids = selectedSpaceIds.map(Number);
    if (ids.length === 0) return;
    setIsSyncing(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const response = await fetch('/api/kaiten/sync-spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceIds: ids }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (data.success) {
        toast({ title: "Синхронизация завершена", description: `Синхронизировано инициатив: ${data.syncedInitiatives || 0}` });
        
        queryClient.clear();
        await queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
        await queryClient.invalidateQueries({ queryKey: ['/api/metrics'] });
        await queryClient.refetchQueries({ queryKey: ['/api/metrics/initiatives-table'] });
      } else {
        toast({ title: "Ошибка синхронизации", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast({ title: "Таймаут синхронизации", description: "Синхронизация заняла больше 5 минут. Данные могли обновиться частично — обновите страницу.", variant: "destructive" });
      } else {
        toast({ title: "Ошибка", description: "Не удалось выполнить синхронизацию", variant: "destructive" });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSpaceToggle = (teamIds: string[]) => {
    const newSelectedTeams = new Set(selectedTeams);
    const allSelected = teamIds.every(id => newSelectedTeams.has(id));
    if (allSelected) {
      const remaining = new Set(Array.from(newSelectedTeams).filter(id => !teamIds.includes(id)));
      if (remaining.size === 0) {
        toast({
          title: "Ошибка",
          description: "Должно быть выбрано хотя бы одно пространство",
          variant: "destructive",
        });
        return;
      }
      teamIds.forEach(id => newSelectedTeams.delete(id));
    } else {
      teamIds.forEach(id => newSelectedTeams.add(id));
    }
    setSelectedTeams(newSelectedTeams);
  };

  interface InitiativeTableRow {
    title: string;
    type: string | null;
    cardId: number;
    spaceId: number;
    archived: boolean;
    plannedCost: number;
    actualCost: number;
    plannedEffect: number | null;
    actualEffect: number | null;
    participants: string[];
  }

  const filterTeamIdsArray = Array.from(filterTeamIds);
  const filterTeamIdsParam = filterTeamIdsArray.sort().join(',');
  const allTeamsFilterSelected = departmentTeams ? filterTeamIds.size === departmentTeams.length : true;

  const { data: initiativesTableData, isFetching: isTableFetching } = useQuery<{
    success: boolean;
    year: number;
    initiatives: InitiativeTableRow[];
  }>({
    queryKey: ['/api/metrics/initiatives-table', { teamIds: teamIdsParam, year: selectedYear, filter: initiativeFilter, filterTeamIds: filterTeamIdsParam }],
    queryFn: async () => {
      let url = `/api/metrics/initiatives-table?teamIds=${teamIdsParam}&year=${selectedYear}&filter=${initiativeFilter}&_t=${new Date().getTime()}`;
      if (!allTeamsFilterSelected && filterTeamIdsParam) {
        url += `&filterTeamIds=${filterTeamIdsParam}`;
      }
      const response = await fetch(url, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      });
      if (!response.ok) throw new Error('Failed to fetch initiatives table');
      return response.json();
    },
    enabled: teamIdsArray.length > 0,
    placeholderData: (previousData) => previousData,
  });

  const lastTableDataRef = useRef<typeof initiativesTableData | null>(null);
  if (initiativesTableData && !isTableFetching) lastTableDataRef.current = initiativesTableData;
  const displayTableData = initiativesTableData || lastTableDataRef.current;

  const toggleType = useCallback((type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleColumn = useCallback((col: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }, []);

  const visibleColCount = useMemo(() => {
    return 7 + (visibleColumns.has('effectType') ? 1 : 0) + (visibleColumns.has('contribution') ? 1 : 0) + (visibleColumns.has('participants') ? 1 : 0);
  }, [visibleColumns]);

  const groupedInitiatives = useMemo(() => {
    if (!displayTableData?.initiatives) return [];
    const types = ['Epic', 'Compliance', 'Enabler'] as const;
    return types.map(type => {
      const items = displayTableData.initiatives.filter(i => i.type === type);
      const totalPlannedCost = items.reduce((s, i) => s + i.plannedCost, 0);
      const totalPrevYearActualCost = items.reduce((s, i) => s + (i.prevYearActualCost || 0), 0);
      const totalActualCost = items.reduce((s, i) => s + i.actualCost, 0);
      const totalPlannedEffect = items.reduce((s, i) => s + (i.plannedEffect ?? 0), 0);
      const totalActualEffect = items.reduce((s, i) => s + (i.actualEffect ?? 0), 0);
      return { type, items, totalPlannedCost, totalPrevYearActualCost, totalActualCost, totalPlannedEffect, totalActualEffect };
    }).filter(g => g.items.length > 0);
  }, [displayTableData]);

  const handleDownloadReport = async () => {
    try {
      if (teamIdsArray.length === 0) {
        toast({
          title: "Ошибка",
          description: "Выберите хотя бы одну команду",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Формирование отчета",
        description: "Пожалуйста, подождите...",
      });

      const [costStructureRes, summaryReportRes] = await Promise.all([
        fetch(`/api/metrics/cost-structure?teamIds=${teamIdsParam}&year=${selectedYear}`),
        fetch(`/api/metrics/team-summary-report?teamIds=${teamIdsParam}&year=${selectedYear}`),
      ]);
      if (!costStructureRes.ok) throw new Error('Failed to fetch cost structure data');
      const data = await costStructureRes.json();
      const summaryData = summaryReportRes.ok ? await summaryReportRes.json() : null;

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const departmentName = departments?.find(d => d.id === selectedDepartment)?.department || 'Не указан';

      // === Лист 1: Сводные показатели ===
      if (summaryData?.teams?.length > 0) {
        const yr = selectedYear;
        const prevYr = yr - 1;
        const nextYr = yr + 1;
        const summarySheetData: any[][] = [
          [String(yr)],
          [
            'Команда',
            `IR ${yr}`,
            '%Compliance',
            'Стоимость команды',
            'Затраты на эпики',
            'Compliance',
            `Перенос из ${prevYr}`,
            `Затраты на эпики ${yr}`,
            `Перенос в ${nextYr}`,
            'Эффект',
            `Value/cost ${yr}`,
            `Value/cost ${yr} без compliance`,
          ],
        ];
        const teamRows = summaryData.teams as any[];
        teamRows.forEach((t: any) => {
          summarySheetData.push([
            t.teamName,
            `${t.ir}%`,
            `${t.compliancePercent}%`,
            t.teamCost || 0,
            t.epicPlannedCost || 0,
            t.complianceCost || 0,
            t.carryoverFromPrevYear || 0,
            t.epicCurrentYearCost || 0,
            t.transferToNextYear || 0,
            t.totalEffect || 0,
            t.valueCost ?? '—',
            t.valueCostNoCompliance ?? '—',
          ]);
        });
        // Итого
        const sum = (key: string) => teamRows.reduce((s: number, t: any) => s + (t[key] || 0), 0);
        const totalEffect = sum('totalEffect');
        const totalEpicActual = sum('epicCurrentYearCost') + sum('carryoverFromPrevYear');
        const totalComplianceCost = sum('complianceCost');
        const vcTotal = totalEpicActual > 0 && totalEffect > 0 ? Math.round((totalEffect / totalEpicActual) * 100) / 100 : '—';
        const vcNoCNum = totalEffect - totalComplianceCost;
        const vcNoCDen = totalEpicActual - totalComplianceCost;
        const vcNoC = vcNoCDen > 0 && vcNoCNum > 0 ? Math.round((vcNoCNum / vcNoCDen) * 100) / 100 : '—';
        const totalIrSP = teamRows.reduce((s: number, t: any) => s + (t.teamCost > 0 ? t.ir * t.teamCost / 100 : 0), 0);
        const totalTeamCost = sum('teamCost');
        const totalIr = totalTeamCost > 0 ? Math.round((totalIrSP / totalTeamCost) * 100) : 0;
        const totalCompSP = teamRows.reduce((s: number, t: any) => s + (t.teamCost > 0 ? t.compliancePercent * t.teamCost / 100 : 0), 0);
        const totalCompPercent = totalTeamCost > 0 ? Math.round((totalCompSP / totalTeamCost) * 100) : 0;
        summarySheetData.push([
          'Итого',
          `${totalIr}%`,
          `${totalCompPercent}%`,
          totalTeamCost,
          sum('epicPlannedCost'),
          totalComplianceCost,
          sum('carryoverFromPrevYear'),
          sum('epicCurrentYearCost'),
          sum('transferToNextYear'),
          totalEffect,
          vcTotal,
          vcNoC,
        ]);

        const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);
        summarySheet['!cols'] = [
          { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
          { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 24 },
        ];
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Сводные показатели');
      }

      const epicPercent = data.typePercentages['Epic'] || 0;
      const compliancePercent = data.typePercentages['Compliance'] || 0;
      const enablerPercent = data.typePercentages['Enabler'] || 0;
      const developmentPercent = epicPercent + compliancePercent + enablerPercent;
      const supportPercent = 100 - developmentPercent;
      const teamNames = data.teams.map((t: { name: string }) => t.name).join(', ');

      const costStructureData: any[][] = [
        ['Год', data.year],
        ['Блок', departmentName],
        ['Команды', teamNames],
        [''],
        ['РАЗВИТИЕ', `${developmentPercent}%`],
        ['Epic', `${epicPercent}%`],
        ['Compliance', `${compliancePercent}%`],
        ['Enabler', `${enablerPercent}%`],
        [''],
        ['ПОДДЕРЖКА', `${supportPercent}%`]
      ];

      const supportTypes = ['Service Desk', 'Bug', 'Security', 'Tech debt', 'Postmortem', 'Др. доработки'];
      for (const type of supportTypes) {
        const percentage = data.typePercentages[type] || 0;
        costStructureData.push([type, `${percentage}%`]);
      }

      const costSheet = XLSX.utils.aoa_to_sheet(costStructureData);
      costSheet['!cols'] = [{ wch: 25 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, costSheet, 'Структура затрат');

      // === Листы 3-5: Статус / Переходящие / Перенесенные ===
      const currentYear = new Date().getFullYear();
      const isCurrentYear = parseInt(selectedYear) === currentYear;
      const baseUrl = `/api/metrics/initiatives-table?teamIds=${teamIdsParam}&year=${selectedYear}`;

      const [doneRes, carryoverRes, transferredRes] = await Promise.all([
        fetch(`${baseUrl}&filter=done`),
        fetch(`${baseUrl}&filter=carryover`),
        isCurrentYear ? Promise.resolve(null) : fetch(`${baseUrl}&filter=transferred`),
      ]);

      const doneInits: any[] = doneRes?.ok ? (await doneRes.json()).initiatives || [] : [];
      const carryoverInits: any[] = carryoverRes?.ok ? (await carryoverRes.json()).initiatives || [] : [];
      const transferredInits: any[] = (!isCurrentYear && transferredRes?.ok) ? (await transferredRes!.json()).initiatives || [] : [];

      const buildInitiativesSheetRows = (initiatives: any[], isCarryover: boolean): any[][] => {
        const vcCalc = (effect: number | null, cost: number, prevCost: number) => {
          const denom = cost + prevCost;
          return effect !== null && effect > 0 && denom > 0 ? Math.round((effect / denom) * 10) / 10 : '—';
        };

        const header = [
          'Инициатива',
          'Участники',
          'Затраты (план)',
          ...(isCarryover ? ['Затраты пред. (факт)'] : []),
          'Затраты (факт)',
          'Эффект (план)',
          'Эффект (факт)',
          'V/C (план)',
          'V/C (факт)',
        ];
        const rows: any[][] = [header];

        for (const type of ['Epic', 'Compliance', 'Enabler']) {
          const group = initiatives.filter(i => i.type === type);
          if (group.length === 0) continue;

          const totPlanned = group.reduce((s, i) => s + (i.plannedCost || 0), 0);
          const totPrev = group.reduce((s, i) => s + (i.prevYearActualCost || 0), 0);
          const totActual = group.reduce((s, i) => s + (i.actualCost || 0), 0);
          const totPlannedEff = group.reduce((s, i) => s + (i.plannedEffect || 0), 0);
          const totActualEff = group.reduce((s, i) => s + (i.actualEffect || 0), 0);

          rows.push([
            `${type} — итого (${group.length})`,
            '',
            totPlanned || '—',
            ...(isCarryover ? [totPrev || '—'] : []),
            totActual || '—',
            totPlannedEff || '—',
            totActualEff || '—',
            vcCalc(totPlannedEff, totPlanned, totPrev),
            vcCalc(totActualEff, totActual, totPrev),
          ]);

          group.forEach((init) => {
            rows.push([
              init.title,
              (init.participants || []).join(', '),
              init.plannedCost || '—',
              ...(isCarryover ? [init.prevYearActualCost || '—'] : []),
              init.actualCost || '—',
              init.plannedEffect ?? '—',
              init.actualEffect ?? '—',
              vcCalc(init.plannedEffect, init.plannedCost || 0, init.prevYearActualCost || 0),
              vcCalc(init.actualEffect, init.actualCost || 0, init.prevYearActualCost || 0),
            ]);
          });
        }
        return rows;
      };

      const initSheetCols = (isCarryover: boolean) => [
        { wch: 48 }, { wch: 28 },
        { wch: 16 }, ...(isCarryover ? [{ wch: 18 }] : []),
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
      ];

      const statusSheet = XLSX.utils.aoa_to_sheet(buildInitiativesSheetRows(doneInits, false));
      statusSheet['!cols'] = initSheetCols(false);
      XLSX.utils.book_append_sheet(workbook, statusSheet, 'Статус');

      const carryoverSheet = XLSX.utils.aoa_to_sheet(buildInitiativesSheetRows(carryoverInits, true));
      carryoverSheet['!cols'] = initSheetCols(true);
      XLSX.utils.book_append_sheet(workbook, carryoverSheet, 'Переходящие');

      let transferredSheetData: any[][];
      if (isCurrentYear) {
        transferredSheetData = [['В текущем году перенесенных задач не может быть']];
      } else {
        transferredSheetData = buildInitiativesSheetRows(transferredInits, false);
      }
      const transferredSheet = XLSX.utils.aoa_to_sheet(transferredSheetData);
      transferredSheet['!cols'] = initSheetCols(false);
      XLSX.utils.book_append_sheet(workbook, transferredSheet, 'Перенесенные');

      const fileName = `Cost_Structure_${data.year}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast({ title: "Успешно", description: "Отчет успешно скачан" });
    } catch (error) {
      console.error('Error downloading report:', error);
      toast({ title: "Ошибка", description: "Не удалось сформировать отчет", variant: "destructive" });
    }
  };

  return (
    <div className="bg-background flex-1">
      <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto" data-testid="page-product-metrics">
        <div className="p-6">
          {selectedDepartment && teamIdsArray.length > 0 ? (
            <MetricsPanel teamIds={teamIdsArray} selectedYear={selectedYear}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-1 right-1"
                    data-testid="button-menu"
                  >
                    <MoreVertical className="h-4 w-4" />
                    {spaceGroups.length > 0 && spaceGroups.some(g => !g.teamIds.every(id => selectedTeams.has(id))) && (
                      <span
                        className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: '#cd253d' }}
                      />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white z-[250]">
                  {spaceGroups.length > 0 ? (
                    <>
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                        Пространства
                      </div>
                      {spaceGroups.map((group) => (
                        <DropdownMenuCheckboxItem
                          key={group.spaceName}
                          checked={group.teamIds.every(id => selectedTeams.has(id))}
                          onCheckedChange={() => handleSpaceToggle(group.teamIds)}
                          onSelect={(e) => e.preventDefault()}
                          data-testid={`menu-space-${group.spaceName}`}
                        >
                          {group.spaceName}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="flex items-center gap-2 cursor-pointer"
                        onSelect={handleDownloadReport}
                        data-testid="menu-download-report"
                      >
                        <Download className="h-4 w-4" />
                        <span>Скачать отчет</span>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Нет пространств
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </MetricsPanel>
          ) : selectedDepartment ? (
            <p className="text-muted-foreground text-center py-12">Нет команд в выбранном департаменте</p>
          ) : (
            <p className="text-muted-foreground text-center py-12">Выберите департамент для просмотра метрик</p>
          )}

          {selectedDepartment && teamIdsArray.length > 0 && (
            <div className="mt-6 border border-border rounded-lg overflow-hidden transition-opacity duration-300" style={{ opacity: isTableFetching ? 0.5 : 1 }} data-testid="initiatives-table-container">
              <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="ghost" data-testid="button-refresh" title="Обновить" onClick={handleSyncSpaces} disabled={isSyncing}>
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="relative" data-testid="button-team-selection" title="Фильтр по командам">
                      <Users className="h-4 w-4" />
                      {!allTeamsFilterSelected && (
                        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-destructive" data-testid="indicator-team-filter-active" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-card">
                    {departmentTeams?.map((team) => (
                      <DropdownMenuCheckboxItem
                        key={team.teamId}
                        checked={filterTeamIds.has(team.teamId)}
                        onCheckedChange={() => {
                          setFilterTeamIds(prev => {
                            const next = new Set(prev);
                            if (next.has(team.teamId)) {
                              if (next.size <= 1) return prev;
                              next.delete(team.teamId);
                            } else {
                              next.add(team.teamId);
                            }
                            return next;
                          });
                        }}
                        onSelect={(e) => e.preventDefault()}
                        data-testid={`toggle-team-${team.teamId}`}
                      >
                        {team.teamName}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" data-testid="button-column-visibility" title="Настроить колонки">
                      <Columns className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-card">
                    <DropdownMenuCheckboxItem checked={visibleColumns.has('effectType')} onCheckedChange={() => toggleColumn('effectType')} onSelect={(e) => e.preventDefault()} data-testid="toggle-col-effect-type">
                      Тип Эффекта
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={visibleColumns.has('contribution')} onCheckedChange={() => toggleColumn('contribution')} onSelect={(e) => e.preventDefault()} data-testid="toggle-col-contribution">
                      % вклада
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={visibleColumns.has('participants')} onCheckedChange={() => toggleColumn('participants')} onSelect={(e) => e.preventDefault()} data-testid="toggle-col-participants">
                      Участники
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
                <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
                  {([
                    { key: 'all', label: 'Все' },
                    { key: 'done', label: 'Завершенные' },
                    { key: 'carryover', label: 'Переходящие' },
                    { key: 'transferred', label: 'Перенесенные' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setInitiativeFilter(key)}
                      className={`px-4 py-1 text-xs font-medium rounded transition-colors ${
                        initiativeFilter === key
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`filter-${key}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(70vh - 48px)' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-white dark:bg-background" style={{ backdropFilter: 'blur(8px)' }}>
                    <th className="text-left px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border w-[20%]" data-testid="th-initiative">
                      Инициатива
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-planned-cost">
                      Затраты (план)
                    </th>
                    {(initiativeFilter === 'carryover' || initiativeFilter === 'all') && (
                      <th className="text-right px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-prev-year-actual-cost">
                        Затраты пред. (факт)
                      </th>
                    )}
                    <th className="text-right px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-actual-cost">
                      Затраты (факт)
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-planned-effect">
                      Эффект (план)
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-actual-effect">
                      Эффект (факт)
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-planned-vc">
                      V/C (план)
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-actual-vc">
                      V/C (факт)
                    </th>
                    {visibleColumns.has('effectType') && (
                      <th className="text-left px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-effect-type">
                        Тип Эффекта
                      </th>
                    )}
                    {visibleColumns.has('contribution') && (
                      <th className="text-right px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-contribution-percent">
                        % вклада
                      </th>
                    )}
                    {visibleColumns.has('participants') && (
                      <th className="text-left px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border" data-testid="th-participants">
                        Участники
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {groupedInitiatives.length > 0 ? (
                    groupedInitiatives.map((group) => {
                      const isExpanded = expandedTypes.has(group.type);
                      return (
                        <Fragment key={group.type}>
                          <tr
                            className="cursor-pointer select-none"
                            style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                            onClick={() => toggleType(group.type)}
                            data-testid={`row-group-${group.type}`}
                          >
                            <td className="px-4 py-2.5 border-b border-border w-[20%]">
                              <div className="flex items-center gap-2 font-semibold">
                                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                <span>{group.type}</span>
                                <span className="text-muted-foreground font-normal text-xs">({group.items.length})</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 border-b border-border text-right tabular-nums font-semibold" data-testid={`text-group-planned-cost-${group.type}`}>
                              {group.totalPlannedCost > 0 ? group.totalPlannedCost.toLocaleString('ru-RU') : '—'}
                            </td>
                            {(initiativeFilter === 'carryover' || initiativeFilter === 'all') && (
                              <td className="px-4 py-2.5 border-b border-border text-right tabular-nums font-semibold" data-testid={`text-group-prev-year-actual-cost-${group.type}`}>
                                {group.totalPrevYearActualCost > 0 ? group.totalPrevYearActualCost.toLocaleString('ru-RU') : '—'}
                              </td>
                            )}
                            <td className="px-4 py-2.5 border-b border-border text-right tabular-nums font-semibold" data-testid={`text-group-actual-cost-${group.type}`}>
                              {group.totalActualCost > 0 ? group.totalActualCost.toLocaleString('ru-RU') : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-b border-border text-right tabular-nums font-semibold" data-testid={`text-group-planned-effect-${group.type}`}>
                              {group.totalPlannedEffect > 0 ? group.totalPlannedEffect.toLocaleString('ru-RU') : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-b border-border text-right tabular-nums font-semibold" data-testid={`text-group-actual-effect-${group.type}`}>
                              {group.totalActualEffect > 0 ? group.totalActualEffect.toLocaleString('ru-RU') : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-b border-border text-right tabular-nums font-semibold" data-testid={`text-group-planned-vc-${group.type}`}>
                              {(() => { const denom = group.totalPlannedCost + group.totalPrevYearActualCost; return group.totalPlannedEffect > 0 && denom > 0 ? (Math.round((group.totalPlannedEffect / denom) * 10) / 10).toLocaleString('ru-RU') : '—'; })()}
                            </td>
                            <td className="px-4 py-2.5 border-b border-border text-right tabular-nums font-semibold" data-testid={`text-group-actual-vc-${group.type}`}>
                              {(() => { const denom = group.totalActualCost + group.totalPrevYearActualCost; return group.totalActualEffect > 0 && denom > 0 ? (Math.round((group.totalActualEffect / denom) * 10) / 10).toLocaleString('ru-RU') : '—'; })()}
                            </td>
                            {visibleColumns.has('effectType') && <td className="px-4 py-2.5 border-b border-border"></td>}
                            {visibleColumns.has('contribution') && <td className="px-4 py-2.5 border-b border-border"></td>}
                            {visibleColumns.has('participants') && <td className="px-4 py-2.5 border-b border-border"></td>}
                          </tr>
                          {isExpanded && group.items.map((init, index) => (
                            <tr
                              key={init.cardId}
                              className={index % 2 === 0 ? '' : 'bg-muted/20'}
                              data-testid={`row-initiative-${init.cardId}`}
                            >
                              <td className="px-4 py-2.5 border-b border-border w-[20%] max-w-0">
                                <div className="flex items-center min-w-0 pl-6">
                                  <a
                                    href={getKaitenCardUrl(init.spaceId, init.cardId, init.archived)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="truncate text-foreground hover:text-primary hover:underline"
                                    data-testid={`text-title-${init.cardId}`}
                                  >
                                    {init.title}
                                  </a>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 border-b border-border text-right tabular-nums" data-testid={`text-planned-cost-${init.cardId}`}>
                                {init.plannedCost > 0 ? init.plannedCost.toLocaleString('ru-RU') : '—'}
                              </td>
                              {(initiativeFilter === 'carryover' || initiativeFilter === 'all') && (
                                <td className="px-4 py-2.5 border-b border-border text-right tabular-nums" data-testid={`text-prev-year-actual-cost-${init.cardId}`}>
                                  {init.prevYearActualCost > 0 ? init.prevYearActualCost.toLocaleString('ru-RU') : '—'}
                                </td>
                              )}
                              <td className="px-4 py-2.5 border-b border-border text-right tabular-nums" data-testid={`text-actual-cost-${init.cardId}`}>
                                {init.actualCost > 0 ? init.actualCost.toLocaleString('ru-RU') : '—'}
                              </td>
                              <td
                                className={`px-4 py-2.5 border-b border-border text-right tabular-nums ${init.type === 'Epic' ? 'cursor-pointer' : ''}`}
                                style={{ minWidth: 0 }}
                                data-testid={`text-planned-effect-${init.cardId}`}
                                onClick={() => init.type === 'Epic' && !(editingCell?.cardId === init.cardId && editingCell.field === 'plannedEffect') && startCellEdit(init.cardId, 'plannedEffect', init.plannedEffect)}
                              >
                                {editingCell?.cardId === init.cardId && editingCell.field === 'plannedEffect' ? (
                                  <input
                                    ref={editInputRef}
                                    type="text"
                                    className="bg-transparent border-0 border-b border-b-border rounded-none text-right text-sm outline-none focus:ring-0 tabular-nums"
                                    style={{ width: '10ch', minWidth: '6ch', maxWidth: '100%', padding: 0, margin: 0, paddingBottom: '1px' }}
                                    size={1}
                                    value={editingCellValue}
                                    onChange={(e) => setEditingCellValue(e.target.value)}
                                    onBlur={commitCellEdit}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitCellEdit();
                                      if (e.key === 'Escape') cancelCellEdit();
                                    }}
                                    data-testid={`input-planned-effect-${init.cardId}`}
                                  />
                                ) : (
                                  init.plannedEffect !== null && init.plannedEffect > 0 ? init.plannedEffect.toLocaleString('ru-RU') : '—'
                                )}
                              </td>
                              <td
                                className={`px-4 py-2.5 border-b border-border text-right tabular-nums ${init.type === 'Epic' ? 'cursor-pointer' : ''}`}
                                style={{ minWidth: 0 }}
                                data-testid={`text-actual-effect-${init.cardId}`}
                                onClick={() => init.type === 'Epic' && !(editingCell?.cardId === init.cardId && editingCell.field === 'actualEffect') && startCellEdit(init.cardId, 'actualEffect', init.actualEffect)}
                              >
                                {editingCell?.cardId === init.cardId && editingCell.field === 'actualEffect' ? (
                                  <input
                                    ref={editInputRef}
                                    type="text"
                                    className="bg-transparent border-0 border-b border-b-border rounded-none text-right text-sm outline-none focus:ring-0 tabular-nums"
                                    style={{ width: '10ch', minWidth: '6ch', maxWidth: '100%', padding: 0, margin: 0, paddingBottom: '1px' }}
                                    size={1}
                                    value={editingCellValue}
                                    onChange={(e) => setEditingCellValue(e.target.value)}
                                    onBlur={commitCellEdit}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitCellEdit();
                                      if (e.key === 'Escape') cancelCellEdit();
                                    }}
                                    data-testid={`input-actual-effect-${init.cardId}`}
                                  />
                                ) : (
                                  init.actualEffect !== null && init.actualEffect > 0 ? init.actualEffect.toLocaleString('ru-RU') : '—'
                                )}
                              </td>
                              <td className="px-4 py-2.5 border-b border-border text-right tabular-nums" data-testid={`text-planned-vc-${init.cardId}`}>
                                {(() => {
                                  const prevCost = (init.prevYearActualCost || 0);
                                  const denom = init.plannedCost + prevCost;
                                  return init.plannedEffect !== null && denom > 0 ? (Math.round((init.plannedEffect / denom) * 10) / 10).toLocaleString('ru-RU') : '—';
                                })()}
                              </td>
                              <td className="px-4 py-2.5 border-b border-border text-right tabular-nums" data-testid={`text-actual-vc-${init.cardId}`}>
                                {(() => {
                                  const prevCost = (init.prevYearActualCost || 0);
                                  const denom = init.actualCost + prevCost;
                                  return init.actualEffect !== null && denom > 0 ? (Math.round((init.actualEffect / denom) * 10) / 10).toLocaleString('ru-RU') : '—';
                                })()}
                              </td>
                              {visibleColumns.has('effectType') && (
                                <td className="px-4 py-2.5 border-b border-border text-muted-foreground" data-testid={`text-effect-type-${init.cardId}`}>—</td>
                              )}
                              {visibleColumns.has('contribution') && (
                                <td className="px-4 py-2.5 border-b border-border text-right text-muted-foreground" data-testid={`text-contribution-percent-${init.cardId}`}>—</td>
                              )}
                              {visibleColumns.has('participants') && (
                                <td className="px-4 py-2.5 border-b border-border text-muted-foreground" data-testid={`text-participants-${init.cardId}`}>
                                  {init.participants && init.participants.length > 0 ? init.participants.join(', ') : '—'}
                                </td>
                              )}
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })
                  ) : !isTableFetching ? (
                    <tr>
                      <td colSpan={visibleColCount + 1} className="px-4 py-8 text-center text-muted-foreground">
                        Нет инициатив для отображения
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={visibleColCount + 1} className="px-4 py-8 text-center">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  )}
                </tbody>
                {displayTableData?.initiatives && displayTableData.initiatives.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="bg-muted/80 font-semibold" style={{ backdropFilter: 'blur(8px)' }}>
                      <td className="px-4 py-2.5 border-t border-border w-[20%]" data-testid="text-total-label">
                        Итого ({displayTableData.initiatives.length})
                      </td>
                      <td className="px-4 py-2.5 border-t border-border text-right tabular-nums" data-testid="text-total-planned-cost">
                        {displayTableData.initiatives.reduce((sum, i) => sum + i.plannedCost, 0).toLocaleString('ru-RU')}
                      </td>
                      {(initiativeFilter === 'carryover' || initiativeFilter === 'all') && (
                        <td className="px-4 py-2.5 border-t border-border text-right tabular-nums" data-testid="text-total-prev-year-actual-cost">
                          {displayTableData.initiatives.reduce((sum, i) => sum + (i.prevYearActualCost || 0), 0).toLocaleString('ru-RU')}
                        </td>
                      )}
                      <td className="px-4 py-2.5 border-t border-border text-right tabular-nums" data-testid="text-total-actual-cost">
                        {displayTableData.initiatives.reduce((sum, i) => sum + i.actualCost, 0).toLocaleString('ru-RU')}
                      </td>
                      {(() => {
                        const inits = displayTableData!.initiatives;
                        const totalPC = inits.reduce((s, i) => s + i.plannedCost + (i.prevYearActualCost || 0), 0);
                        const totalAC = inits.reduce((s, i) => s + i.actualCost + (i.prevYearActualCost || 0), 0);
                        const totalPE = inits.reduce((s, i) => s + (i.plannedEffect ?? 0), 0);
                        const totalAE = inits.reduce((s, i) => s + (i.actualEffect ?? 0), 0);
                        const vcPlan = totalPE > 0 && totalPC > 0 ? Math.round((totalPE / totalPC) * 10) / 10 : null;
                        const vcFact = totalAE > 0 && totalAC > 0 ? Math.round((totalAE / totalAC) * 10) / 10 : null;
                        return (
                          <>
                            <td className="px-4 py-2.5 border-t border-border text-right tabular-nums">{totalPE > 0 ? totalPE.toLocaleString('ru-RU') : '—'}</td>
                            <td className="px-4 py-2.5 border-t border-border text-right tabular-nums">{totalAE > 0 ? totalAE.toLocaleString('ru-RU') : '—'}</td>
                            <td className="px-4 py-2.5 border-t border-border text-right tabular-nums">{vcPlan !== null ? vcPlan.toLocaleString('ru-RU') : '—'}</td>
                            <td className="px-4 py-2.5 border-t border-border text-right tabular-nums">{vcFact !== null ? vcFact.toLocaleString('ru-RU') : '—'}</td>
                          </>
                        );
                      })()}
                      {visibleColumns.has('effectType') && <td className="px-4 py-2.5 border-t border-border text-muted-foreground">—</td>}
                      {visibleColumns.has('contribution') && <td className="px-4 py-2.5 border-t border-border text-right text-muted-foreground">—</td>}
                      {visibleColumns.has('participants') && <td className="px-4 py-2.5 border-t border-border text-muted-foreground">—</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
