import { createFileRoute } from "@tanstack/react-router";
import { GameRoute } from "./game.$gameId";

export const Route = createFileRoute("/game/$gameId/roster")({
  component: () => <GameRoute roster />,
});