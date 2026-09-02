import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppSurface } from "@/components/AppSurface";
import { useGame } from "@/game/store";

export const Route = createFileRoute("/games")({ component: BrowseRoute });

function BrowseRoute() {
  useEffect(() => {
    useGame.getState().setScreen("browse");
  }, []);
  return <AppSurface />;
}