import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { MetricsPanel } from "@/components/MetricsPanel";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { MoreVertical, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { DepartmentWithTeamCount, TeamRow } from "@shared/schema";

interface ProductMetricsPageProps {
  selectedDepartment: string;
  selectedYear: string;
  departments?: DepartmentWithTeamCount[];
}

export default function ProductMetricsPage({ selectedDepartment, selectedYear, departments }: ProductMetricsPageProps) {
  const { toast } = useToast();
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());

  const { data: departmentTeams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", selectedDepartment],
    enabled: !!selectedDepartment,
  });

  useEffect(() => {
    if (departmentTeams) {
      setSelectedTeams(new Set(departmentTeams.map(team => team.teamId)));
    }
  }, [selectedDepartment, departmentTeams]);

  const teamIdsArray = Array.from(selectedTeams);
  const teamIdsParam = teamIdsArray.sort().join(',');

  const handleTeamToggle = (teamId: string) => {
    const newSelectedTeams = new Set(selectedTeams);
    if (newSelectedTeams.has(teamId)) {
      if (newSelectedTeams.size <= 1) {
        toast({
          title: "Ошибка",
          description: "Должна быть выбрана хотя бы одна команда",
          variant: "destructive",
        });
        return;
      }
      newSelectedTeams.delete(teamId);
    } else {
      newSelectedTeams.add(teamId);
    }
    setSelectedTeams(newSelectedTeams);
  };

  interface InitiativeTableRow {
    title: string;
    type: string | null;
    cardId: number;
    plannedCost: number;
    actualCost: number;
    plannedEffect: number | null;
    actualEffect: number | null;
  }

  const { data: initiativesTableData, isFetching: isTableFetching } = useQuery<{
    success: boolean;
    year: number;
    initiatives: InitiativeTableRow[];
  }>({
    queryKey: ['/api/metrics/initiatives-table', { teamIds: teamIdsParam, year: selectedYear }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/initiatives-table?teamIds=${teamIdsParam}&year=${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch initiatives table');
      return response.json();
    },
    enabled: teamIdsArray.length > 0,
    placeholderData: (previousData) => previousData,
  });

  const lastTableDataRef = useRef<typeof initiativesTableData | null>(null);
  if (initiativesTableData && !isTableFetching) lastTableDataRef.current = initiativesTableData;
  const displayTableData = initiativesTableData || lastTableDataRef.current;

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

      const response = await fetch(`/api/metrics/cost-structure?teamIds=${teamIdsParam}&year=${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch cost structure data');
      const data = await response.json();

      const selectedTeamsData = departmentTeams?.filter(t => selectedTeams.has(t.teamId)) || [];
      const initiativesPromises = selectedTeamsData.map(async (team) => {
        const url = `/api/initiatives/board/${team.initBoardId}?sprintBoardId=${team.sprintBoardId}&teamId=${team.teamId}&year=${selectedYear}&forReport=true&_t=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const initiatives = await res.json();
        return initiatives.map((init: any) => ({ ...init, team }));
      });

      const initiativesArrays = await Promise.all(initiativesPromises);
      const allInitiatives = initiativesArrays.flat();

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const departmentName = departments?.find(d => d.id === selectedDepartment)?.department || 'Не указан';

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

      const uniqueTeamsMap = new Map<string, any>();
      allInitiatives.forEach((initiative: any) => {
        if (initiative.team && initiative.team.teamId && !uniqueTeamsMap.has(initiative.team.teamId)) {
          uniqueTeamsMap.set(initiative.team.teamId, initiative.team);
        }
      });
      const sortedTeams = Array.from(uniqueTeamsMap.values()).sort((a, b) => a.teamName.localeCompare(b.teamName));

      const initiativesSheetData: any[][] = [];
      initiativesSheetData.push([
        '#', 'инициативы', 'сроки', '', '', 'затраты', '', 'тип эффекта', 'эффект по данным', 'эффект', '', '', 'V/C', '',
        ...sortedTeams.map(team => team.teamName)
      ]);
      initiativesSheetData.push([
        '', '', 'план', 'прод', 'эффект', 'план', 'факт текущего', '', '', 'план', 'факт', '% вклада', 'план', 'факт',
        ...sortedTeams.map(() => '')
      ]);

      const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return '—';
        try {
          const date = new Date(dateString);
          return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
        } catch { return '—'; }
      };

      const initiativesByCardId = new Map<number, any[]>();
      allInitiatives.forEach((initiative: any) => {
        if (!initiativesByCardId.has(initiative.cardId)) {
          initiativesByCardId.set(initiative.cardId, []);
        }
        initiativesByCardId.get(initiative.cardId)!.push(initiative);
      });

      const processedInitiatives: any[] = [];
      initiativesByCardId.forEach((initiatives) => {
        const firstInit = initiatives[0];
        const plannedSize = firstInit.size || 0;
        let totalActualCost = 0;
        let totalActualSp = 0;
        let weightedSpPrice = 0;
        const spByTeamId = new Map<string, number>();

        initiatives.forEach((initiative: any) => {
          const team = initiative.team;
          let actualSize = 0;
          if (initiative.sprints && Array.isArray(initiative.sprints)) {
            for (const sprint of initiative.sprints) {
              if (sprint.tasks && Array.isArray(sprint.tasks)) {
                for (const task of sprint.tasks) {
                  if (task.state === '3-done' && task.condition !== '3 - deleted') {
                    actualSize += task.size || 0;
                  }
                }
              } else {
                actualSize += sprint.sp || 0;
              }
            }
          }
          totalActualCost += actualSize * team.spPrice;
          totalActualSp += actualSize;
          weightedSpPrice += actualSize * team.spPrice;
          spByTeamId.set(team.teamId, (spByTeamId.get(team.teamId) || 0) + actualSize);
        });

        const avgSpPrice = totalActualSp > 0 ? weightedSpPrice / totalActualSp : firstInit.team?.spPrice || 0;
        const totalPlannedCost = plannedSize * avgSpPrice;

        let plannedValue: number | null;
        let factValue: number | null;
        if (firstInit.type === 'Compliance' || firstInit.type === 'Enabler') {
          plannedValue = totalPlannedCost;
          factValue = totalActualCost;
        } else {
          plannedValue = firstInit.plannedValue && firstInit.plannedValue.trim() !== '' ? parseFloat(firstInit.plannedValue) : null;
          factValue = firstInit.factValue && firstInit.factValue.trim() !== '' ? parseFloat(firstInit.factValue) : null;
        }

        const plannedValueCost = plannedValue !== null && totalPlannedCost > 0 ? Math.round((plannedValue / totalPlannedCost) * 10) / 10 : null;
        const factValueCost = factValue !== null && totalActualCost > 0 ? Math.round((factValue / totalActualCost) * 10) / 10 : null;
        const productionDate = firstInit.state === '3-done' ? firstInit.dueDate : null;

        processedInitiatives.push({
          type: firstInit.type || '—', title: firstInit.title, cardId: firstInit.cardId,
          dueDate: firstInit.dueDate, doneDate: productionDate,
          totalPlannedCost, totalActualCost, plannedValue, factValue,
          plannedValueCost, factValueCost, spByTeamId
        });
      });

      const addInitiativesGroup = (initiatives: any[], typeName: string) => {
        const initiativesWithActualCosts = initiatives.filter(init => init.totalActualCost > 0);
        if (initiativesWithActualCosts.length === 0) return;

        let sumPlannedCost = 0, sumActualCost = 0, sumPlannedValue = 0, sumFactValue = 0;
        initiativesWithActualCosts.forEach((init) => {
          sumPlannedCost += init.totalPlannedCost;
          sumActualCost += init.totalActualCost;
          if (init.plannedValue !== null) sumPlannedValue += init.plannedValue;
          if (init.factValue !== null) sumFactValue += init.factValue;
        });

        const totalPlannedValueCost = sumPlannedValue > 0 && sumPlannedCost > 0 ? Math.round((sumPlannedValue / sumPlannedCost) * 10) / 10 : '—';
        const totalFactValueCost = sumFactValue > 0 && sumActualCost > 0 ? Math.round((sumFactValue / sumActualCost) * 10) / 10 : '—';

        const teamSpTotals = new Map<string, number>();
        initiativesWithActualCosts.forEach((init) => {
          init.spByTeamId?.forEach((sp: number, teamId: string) => {
            teamSpTotals.set(teamId, (teamSpTotals.get(teamId) || 0) + sp);
          });
        });

        initiativesSheetData.push([
          'Всего', typeName, '', '', '', sumPlannedCost, sumActualCost, '', '',
          sumPlannedValue || '—', sumFactValue || '—', '', totalPlannedValueCost, totalFactValueCost,
          ...sortedTeams.map(team => teamSpTotals.get(team.teamId) || 0)
        ]);

        let rowNumber = 1;
        initiativesWithActualCosts.forEach((init) => {
          initiativesSheetData.push([
            rowNumber++, init.title, formatDate(init.dueDate), formatDate(init.doneDate), '—',
            init.totalPlannedCost, init.totalActualCost, '', '',
            init.plannedValue ?? '—', init.factValue ?? '—', '',
            init.plannedValueCost ?? '—', init.factValueCost ?? '—',
            ...sortedTeams.map(team => init.spByTeamId?.get(team.teamId) || 0)
          ]);
        });
      };

      addInitiativesGroup(processedInitiatives.filter(i => i.type === 'Epic'), 'Epic');
      addInitiativesGroup(processedInitiatives.filter(i => i.type === 'Compliance'), 'Compliance');
      addInitiativesGroup(processedInitiatives.filter(i => i.type === 'Enabler'), 'Enabler');

      const initiativesSheet = XLSX.utils.aoa_to_sheet(initiativesSheetData);
      initiativesSheet['!cols'] = [
        { wch: 6 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 },
        { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        ...sortedTeams.map(() => ({ wch: 12 }))
      ];
      XLSX.utils.book_append_sheet(workbook, initiativesSheet, 'Инициативы');

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
                    {departmentTeams && selectedTeams.size < departmentTeams.length && (
                      <span
                        className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: '#cd253d' }}
                      />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white z-[250]">
                  {departmentTeams && departmentTeams.length > 0 ? (
                    <>
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                        Команды
                      </div>
                      {departmentTeams.map((team) => (
                        <DropdownMenuCheckboxItem
                          key={team.teamId}
                          checked={selectedTeams.has(team.teamId)}
                          onCheckedChange={() => handleTeamToggle(team.teamId)}
                          onSelect={(e) => e.preventDefault()}
                          data-testid={`menu-team-${team.teamId}`}
                        >
                          {team.teamName}
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
                      Нет команд
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
            <div className="mt-6" data-testid="initiatives-table-container">
              <div
                className="border border-border rounded-lg overflow-hidden transition-opacity duration-300"
                style={{ opacity: isTableFetching ? 0.5 : 1 }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground border-b border-border w-[30%]" data-testid="th-initiative">
                        Инициатива
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground border-b border-border" data-testid="th-planned-cost">
                        Затраты (план)
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground border-b border-border" data-testid="th-actual-cost">
                        Затраты (факт)
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground border-b border-border" data-testid="th-planned-effect">
                        Эффект (план)
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground border-b border-border" data-testid="th-actual-effect">
                        Эффект (факт)
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground border-b border-border" data-testid="th-ar-percent">
                        % АР
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground border-b border-border" data-testid="th-effect-type">
                        Тип Эффекта
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground border-b border-border" data-testid="th-contribution-percent">
                        % вклада
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground border-b border-border" data-testid="th-justification">
                        Обоснование
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTableData?.initiatives && displayTableData.initiatives.length > 0 ? (
                      displayTableData.initiatives.map((init, index) => (
                        <tr
                          key={init.cardId}
                          className={`hover-elevate ${index % 2 === 0 ? '' : 'bg-muted/20'}`}
                          data-testid={`row-initiative-${init.cardId}`}
                        >
                          <td className="px-4 py-2.5 border-b border-border">
                            <div className="flex items-center gap-2">
                              {init.type && (
                                <span
                                  className="inline-flex items-center justify-center w-6 h-6 text-[0.65rem] font-semibold rounded-full shrink-0"
                                  style={{
                                    backgroundColor: init.type === 'Epic' ? 'rgba(205, 37, 61, 0.15)' : init.type === 'Compliance' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(156, 163, 175, 0.2)',
                                    color: init.type === 'Epic' ? '#cd253d' : init.type === 'Compliance' ? '#3b82f6' : '#9ca3af',
                                  }}
                                  title={init.type}
                                  data-testid={`badge-type-${init.cardId}`}
                                >
                                  {init.type.charAt(0)}
                                </span>
                              )}
                              <span className="truncate" data-testid={`text-title-${init.cardId}`}>{init.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-right tabular-nums" data-testid={`text-planned-cost-${init.cardId}`}>
                            {init.plannedCost > 0 ? init.plannedCost.toLocaleString('ru-RU') : '—'}
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-right tabular-nums" data-testid={`text-actual-cost-${init.cardId}`}>
                            {init.actualCost > 0 ? init.actualCost.toLocaleString('ru-RU') : '—'}
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-right text-muted-foreground" data-testid={`text-planned-effect-${init.cardId}`}>
                            —
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-right text-muted-foreground" data-testid={`text-actual-effect-${init.cardId}`}>
                            —
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-right text-muted-foreground" data-testid={`text-ar-percent-${init.cardId}`}>
                            —
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-muted-foreground" data-testid={`text-effect-type-${init.cardId}`}>
                            —
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-right text-muted-foreground" data-testid={`text-contribution-percent-${init.cardId}`}>
                            —
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-muted-foreground" data-testid={`text-justification-${init.cardId}`}>
                            —
                          </td>
                        </tr>
                      ))
                    ) : !isTableFetching ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                          Нет инициатив для отображения
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {displayTableData?.initiatives && displayTableData.initiatives.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/30 font-semibold">
                        <td className="px-4 py-2.5 border-t border-border" data-testid="text-total-label">
                          Итого ({displayTableData.initiatives.length})
                        </td>
                        <td className="px-4 py-2.5 border-t border-border text-right tabular-nums" data-testid="text-total-planned-cost">
                          {displayTableData.initiatives.reduce((sum, i) => sum + i.plannedCost, 0).toLocaleString('ru-RU')}
                        </td>
                        <td className="px-4 py-2.5 border-t border-border text-right tabular-nums" data-testid="text-total-actual-cost">
                          {displayTableData.initiatives.reduce((sum, i) => sum + i.actualCost, 0).toLocaleString('ru-RU')}
                        </td>
                        <td className="px-4 py-2.5 border-t border-border text-right text-muted-foreground">—</td>
                        <td className="px-4 py-2.5 border-t border-border text-right text-muted-foreground">—</td>
                        <td className="px-4 py-2.5 border-t border-border text-right text-muted-foreground">—</td>
                        <td className="px-4 py-2.5 border-t border-border text-muted-foreground">—</td>
                        <td className="px-4 py-2.5 border-t border-border text-muted-foreground">—</td>
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
