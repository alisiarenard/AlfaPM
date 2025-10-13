import { TeamHeader } from "@/components/TeamHeader";
import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Upload, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { TeamData } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function HomePage() {
  const [jsonInput, setJsonInput] = useState("");
  const [uploadError, setUploadError] = useState("");

  const { data: teamDataArray, isLoading, error } = useQuery<TeamData[]>({
    queryKey: ["/api/team-data"],
  });

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

  if (!teamDataArray || teamDataArray.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-[1200px] mx-auto">
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
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-medium text-muted-foreground">Initiatives Timeline</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              queryClient.setQueryData(["/api/team-data"], null);
            }}
            data-testid="button-clear-data"
          >
            Очистить данные
          </Button>
        </div>
        
        <div className="p-6">
          <Tabs defaultValue={teamDataArray[0].team.teamId} className="w-full">
            <TabsList className="mb-6" data-testid="tabs-teams">
              {teamDataArray.map((teamData) => (
                <TabsTrigger 
                  key={teamData.team.teamId} 
                  value={teamData.team.teamId}
                  data-testid={`tab-team-${teamData.team.teamId}`}
                >
                  {teamData.team.name}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {teamDataArray.map((teamData) => (
              <TabsContent key={teamData.team.teamId} value={teamData.team.teamId}>
                <TeamHeader team={teamData.team} initiatives={teamData.initiatives} />
                <div className="mt-6">
                  <InitiativesTimeline initiatives={teamData.initiatives} team={teamData.team} />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
