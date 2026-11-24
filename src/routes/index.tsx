import { createFileRoute } from "@tanstack/react-router";
import { GameScreen } from "@/components/starshard/game-screen";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GameScreen />;
}
