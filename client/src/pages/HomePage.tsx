import { TeamHeader } from "@/components/TeamHeader";
import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Upload, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { TeamData, Department, TeamRow } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function HomePage() {
  const [jsonInput, setJsonInput] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [initialLoadAttempted, setInitialLoadAttempted] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("");

  const { data: teamDataArray, isLoading, error } = useQuery<TeamData[]>({
    queryKey: ["/api/team-data"],
  });

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: departmentTeams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", selectedDepartment],
    enabled: !!selectedDepartment,
  });

  useEffect(() => {
    if (departments && departments.length > 0 && !selectedDepartment) {
      setSelectedDepartment(departments[0].id);
    }
  }, [departments, selectedDepartment]);

  useEffect(() => {
    if (departmentTeams && departmentTeams.length > 0) {
      setActiveTab(departmentTeams[0].teamId);
    }
  }, [departmentTeams]);

  useEffect(() => {
    const loadInitialData = async () => {
      if (!initialLoadAttempted && (!teamDataArray || teamDataArray.length === 0)) {
        setInitialLoadAttempted(true);
        try {
          const response = await fetch("/team-data.json");
          if (!response.ok) {
            console.error("Failed to fetch team-data.json:", response.status);
            setUploadError("Не удалось загрузить файл с данными команд");
            return;
          }

          const data = await response.json();
          const postResponse = await fetch("/api/team-data", {
            method: "POST",
            body: JSON.stringify(data),
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!postResponse.ok) {
            console.error("Failed to upload initial data:", postResponse.status);
            setUploadError("Не удалось загрузить начальные данные");
            return;
          }

          await queryClient.invalidateQueries({ queryKey: ["/api/team-data"] });
        } catch (error) {
          console.error("Failed to load initial data:", error);
          setUploadError("Ошибка при загрузке начальных данных");
        }
      }
    };

    loadInitialData();
  }, [teamDataArray, initialLoadAttempted]);

  const handleUpload = async () => {
    setUploadError("");
    
    try {
      const parsedData = JSON.parse(jsonInput);
      
      const response = await fetch("/api/team-data", {
        method: "POST",
        body: JSON.stringify(parsedData),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      await queryClient.invalidateQueries({ queryKey: ["/api/team-data"] });
      setJsonInput("");
    } catch (error) {
      if (error instanceof SyntaxError) {
        setUploadError("Invalid JSON format. Please check your data.");
      } else {
        setUploadError("Failed to upload data. Please try again.");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка данных...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Ошибка при загрузке данных. Пожалуйста, перезагрузите страницу.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!teamDataArray || teamDataArray.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-[1200px] xl:max-w-none xl:w-4/5 mx-auto">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
            <h2 className="text-sm font-medium text-muted-foreground">Initiatives Timeline</h2>
          </div>

          <div className="max-w-4xl mx-auto p-6 mt-12">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                Загрузите данные инициатив
              </h1>
              <p className="text-muted-foreground">
                Вставьте JSON данные в формате API для отображения временной шкалы
              </p>
            </div>

            {uploadError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <Textarea
                placeholder='[{"team": {"boardId": "...", "teamId": "...", "name": "...", "velocity": 42, "sprintDuration": 14}, "initiatives": [...]}]'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
                data-testid="textarea-json-input"
              />
              
              <Button 
                onClick={handleUpload} 
                className="w-full gap-2"
                disabled={!jsonInput.trim()}
                data-testid="button-upload-data"
              >
                <Upload className="h-4 w-4" />
                Загрузить данные
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1200px] xl:max-w-none xl:w-4/5 mx-auto" data-testid="main-container">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-medium text-muted-foreground">Initiatives Timeline</h2>
          <Select 
            value={selectedDepartment} 
            onValueChange={setSelectedDepartment}
            data-testid="select-department"
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Выберите департамент" />
            </SelectTrigger>
            <SelectContent>
              {departments?.map((dept) => (
                <SelectItem key={dept.id} value={dept.id} data-testid={`option-department-${dept.id}`}>
                  {dept.department}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="p-6">
          {departmentTeams && departmentTeams.length > 0 && activeTab ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6" data-testid="tabs-teams">
                {departmentTeams.map((team) => (
                  <TabsTrigger 
                    key={team.teamId} 
                    value={team.teamId}
                    data-testid={`tab-team-${team.teamId}`}
                  >
                    {team.teamName}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {departmentTeams.map((team) => {
                const teamData = teamDataArray?.find(td => td.team.teamId === team.teamId);
                return (
                  <TabsContent key={team.teamId} value={team.teamId}>
                    {teamData ? (
                      <>
                        <TeamHeader team={teamData.team} initiatives={teamData.initiatives} />
                        <div className="mt-6">
                          <InitiativesTimeline initiatives={teamData.initiatives} team={teamData.team} />
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        Нет данных для команды {team.teamName}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Нет команд в выбранном департаменте
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
