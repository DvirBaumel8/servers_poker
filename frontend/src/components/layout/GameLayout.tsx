import { Outlet } from "react-router-dom";

export function GameLayout() {
  return (
    <div className="min-h-screen bg-shell-gradient">
      <Outlet />
    </div>
  );
}
