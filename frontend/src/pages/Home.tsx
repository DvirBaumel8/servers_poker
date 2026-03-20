import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export function Home() {
  return (
    <div className="max-w-4xl mx-auto text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12"
      >
        <h1 className="text-5xl font-bold text-white mb-4">
          Bot Poker <span className="text-poker-gold">Tournament Platform</span>
        </h1>
        <p className="text-xl text-gray-400">
          Build, test, and compete with your poker bots in real-time tournaments
        </p>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
        >
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-xl font-bold text-white mb-2">Build Your Bot</h3>
          <p className="text-gray-400 text-sm">
            Create intelligent poker bots using our simple HTTP API. Test
            strategies and improve your algorithms.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
        >
          <div className="text-4xl mb-4">🏆</div>
          <h3 className="text-xl font-bold text-white mb-2">
            Join Tournaments
          </h3>
          <p className="text-gray-400 text-sm">
            Register your bots in rolling and scheduled tournaments. Compete
            against other developers.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
        >
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-xl font-bold text-white mb-2">Track Progress</h3>
          <p className="text-gray-400 text-sm">
            Analyze performance with detailed statistics. Review hand histories
            and optimize your strategy.
          </p>
        </motion.div>
      </div>

      <div className="flex justify-center gap-4">
        <Link
          to="/tournaments"
          className="px-8 py-3 bg-poker-gold text-gray-900 font-bold rounded-lg hover:bg-yellow-400 transition-colors"
        >
          View Tournaments
        </Link>
        <Link
          to="/bots"
          className="px-8 py-3 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-colors"
        >
          Manage Bots
        </Link>
      </div>

      <div className="mt-16 grid md:grid-cols-4 gap-8">
        <div className="text-center">
          <div className="text-3xl font-bold text-poker-gold">1M+</div>
          <div className="text-gray-400 text-sm">Hands Played</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-poker-gold">500+</div>
          <div className="text-gray-400 text-sm">Registered Bots</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-poker-gold">100+</div>
          <div className="text-gray-400 text-sm">Tournaments</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-poker-gold">99.9%</div>
          <div className="text-gray-400 text-sm">Uptime</div>
        </div>
      </div>
    </div>
  );
}
