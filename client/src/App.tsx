import { Switch, Route, useLocation, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Users, LayoutDashboard, Settings, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import HomePage from "@/pages/HomePage";
import ProductMetricsPage from "@/pages/ProductMetricsPage";
import SettingsPage from "@/pages/SettingsPage";
import PersonalMetricsPage from "@/pages/PersonalMetricsPage";
import NotFound from "@/pages/not-found";
import logoImage from "@assets/b65ec2efbce39c024d959704d8bc5dfa_1760955834035.jpg";
import type { DepartmentWithTeamCount } from "@shared/schema";
import { setKaitenDomain } from "@shared/kaiten.config";

const currentYear = new Date().getFullYear();

export type SpaceGroup = { spaceId: string; spaceName: string; teamIds: string[] };
export type SpaceFilterState = {
  spaceGroups: SpaceGroup[];
  selectedSpaceIds: string[];
  onToggleSpace: (teamIds: string[]) => void;
  onSelectAll: () => void;
};

function SpaceMultiSelect({ spaceGroups, selectedSpaceIds, onToggleSpace, onSelectAll }: SpaceFilterState) {
  const allSelected = selectedSpaceIds.length === spaceGroups.length;
  const triggerLabel = allSelected
    ? "Все команды"
    : selectedSpaceIds
        .map(id => spaceGroups.find(g => g.spaceId === id)?.spaceName || id)
        .join(", ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="bg-white max-w-[240px] min-w-[160px] justify-between gap-1 px-3"
          data-testid="select-spaces"
        >
          <span className="truncate text-sm font-normal">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-white z-[250]">
        <DropdownMenuCheckboxItem
          checked={allSelected}
          onCheckedChange={() => { if (!allSelected) onSelectAll(); }}
          onSelect={(e) => e.preventDefault()}
          data-testid="space-option-all"
        >
          Все команды
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {spaceGroups.map((group) => (
          <DropdownMenuCheckboxItem
            key={group.spaceId}
            checked={!allSelected && selectedSpaceIds.includes(group.spaceId)}
            onCheckedChange={() => onToggleSpace(group.teamIds)}
            onSelect={(e) => e.preventDefault()}
            data-testid={`space-option-${group.spaceId}`}
          >
            {group.spaceName}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const navItems = [
  { path: "/", icon: Users, label: "Командные метрики" },
  { path: "/product-metrics", icon: LayoutDashboard, label: "Продуктовые метрики" },
];

function Sidebar() {
  const [location, setLocation] = useLocation();

  return (
    <div className="w-[70px] min-w-[70px] h-screen sticky top-0 border-r border-border bg-card flex flex-col items-center py-4 justify-between">
      <div className="flex flex-col items-center gap-2">
        <img src={logoImage} alt="Logo" className="w-10 h-10 rounded-md mb-4" />
        {navItems.map((item) => (
          <Tooltip key={item.path}>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={location === item.path || (item.path !== "/" && location.startsWith(item.path)) ? "bg-accent" : ""}
                onClick={() => setLocation(item.path)}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setLocation("/settings")}
            data-testid="button-settings"
          >
            <Settings className="h-5 w-5 text-white" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Настройки</TooltipContent>
      </Tooltip>
    </div>
  );
}

function AppLayout() {
  const [location] = useLocation();
  const [matchPersonal, personalParams] = useRoute("/personal-metrics/:departmentId");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [pageSubtitle, setPageSubtitle] = useState<string>("");
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilterState | null>(null);

  const isProductMetricsPage = location.startsWith("/product-metrics");

  const { data: departments } = useQuery<DepartmentWithTeamCount[]>({
    queryKey: ["/api/departments"],
  });

  useEffect(() => {
    if (matchPersonal && personalParams?.departmentId) {
      setSelectedDepartment(personalParams.departmentId);
    }
  }, [matchPersonal, personalParams?.departmentId]);

  const isSettingsPage = location.startsWith("/settings");
  const isPersonalMetricsPage = location.startsWith("/personal-metrics");
  const pageTitle = isSettingsPage
    ? "Настройки"
    : isPersonalMetricsPage
    ? "Персональные метрики"
    : navItems.find(item =>
        item.path === "/" ? location === "/" || location.startsWith("/?") : location.startsWith(item.path)
      )?.label || "Командные метрики";

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className="bg-card">
          <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto">
            <div className="flex items-start justify-between px-6 pt-[20px] min-h-[52px]">
              <div className="flex flex-col">
                <h2 className="text-2xl font-bold text-foreground" data-testid="text-page-title">{pageTitle}</h2>
                {pageSubtitle && !isPersonalMetricsPage && (
                  <span className="text-sm font-bold text-destructive" data-testid="text-page-subtitle">{pageSubtitle}</span>
                )}
              </div>
              {!isSettingsPage && (
                <div className="flex items-center gap-3">
                  {isProductMetricsPage && spaceFilter && spaceFilter.spaceGroups.length > 0 && (
                    <SpaceMultiSelect
                      spaceGroups={spaceFilter.spaceGroups}
                      selectedSpaceIds={spaceFilter.selectedSpaceIds}
                      onToggleSpace={spaceFilter.onToggleSpace}
                      onSelectAll={spaceFilter.onSelectAll}
                    />
                  )}
                  <Select
                    value={selectedDepartment}
                    onValueChange={setSelectedDepartment}
                    data-testid="select-department"
                  >
                    <SelectTrigger className="w-[250px] bg-white">
                      <SelectValue placeholder="Выберите департамент" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {departments?.map((dept) => (
                        <SelectItem
                          key={dept.id}
                          value={dept.id}
                          data-testid={`option-department-${dept.id}`}
                        >
                          {dept.department} {dept.teamCount === 0 ? "(нет команд)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={selectedYear}
                    onValueChange={setSelectedYear}
                    data-testid="select-year"
                  >
                    <SelectTrigger className="w-[120px] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="2025" data-testid="option-year-2025">
                        2025
                      </SelectItem>
                      <SelectItem
                        value="2026"
                        data-testid="option-year-2026"
                        disabled={currentYear < 2026}
                      >
                        2026
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>

        <Switch>
          <Route path="/">
            <HomePage
              selectedDepartment={selectedDepartment}
              setSelectedDepartment={setSelectedDepartment}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              departments={departments}
              setPageSubtitle={setPageSubtitle}
            />
          </Route>
          <Route path="/product-metrics">
            <ProductMetricsPage
              selectedDepartment={selectedDepartment}
              setSelectedDepartment={setSelectedDepartment}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              departments={departments}
              setPageSubtitle={setPageSubtitle}
              setSpaceFilter={setSpaceFilter}
            />
          </Route>
          <Route path="/settings">
            <SettingsPage />
          </Route>
          <Route path="/personal-metrics/:departmentId">
            <PersonalMetricsPage
              selectedDepartment={selectedDepartment}
              selectedYear={selectedYear}
            />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.kaitenDomain) {
          setKaitenDomain(data.kaitenDomain);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <AppLayout />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
