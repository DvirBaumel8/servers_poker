import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SHORTCUT_MAP: Record<string, string> = {
  "1": "/tables",
  "2": "/tournaments",
  "3": "/bots",
  "4": "/leaderboard",
};

export function useKeyboardNav() {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        const path = SHORTCUT_MAP[e.key];
        if (path) {
          e.preventDefault();
          navigate(path);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);
}
