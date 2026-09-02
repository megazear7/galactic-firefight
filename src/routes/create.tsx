import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppSurface } from "@/components/AppSurface";
import { useGame } from "@/game/store";

export const Route = createFileRoute("/create")({ component: CreateRoute });

function CreateRoute() {
  useEffect(() => {
    useGame.getState().startSetup();
  }, []);
  return <AppSurface />;
}