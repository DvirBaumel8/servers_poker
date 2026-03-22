import { motion } from "framer-motion";
import { Button, SurfaceCard } from "../components/ui/primitives";

export function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <SurfaceCard className="space-y-6">
          <div className="space-y-2">
            <div className="text-7xl font-display font-bold gold-gradient-text">
              404
            </div>
            <h1 className="text-2xl font-semibold text-white">
              Page Not Found
            </h1>
            <p className="text-slate-400">
              The page you&apos;re looking for doesn&apos;t exist or has been
              moved.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asLink="/">Go Home</Button>
            <Button variant="secondary" asLink="/tables">
              View Tables
            </Button>
          </div>
        </SurfaceCard>
      </motion.div>
    </div>
  );
}
