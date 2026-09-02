import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppSurface } from "@/components/AppSurface";
import { useGame } from "@/game/store";

export const Route = createFileRoute("/games/resume")({ component: ResumeRoute });

function ResumeRoute() {
  useEffect(() => {
    useGame.getState().setScreen("resume");
  }, []);
  return <AppSurface />;
}