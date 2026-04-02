#!/usr/bin/env npx ts-node
/**
 * CLI script to run automated poker game tests
 * Usage: npx ts-node scripts/run-poker-tests.ts --games=100 --bots=8
 */

import { runSimulatedGame } from '../src/testing-utilities/game-simulator'
import { CoverageTracker } from '../src/testing-utilities/coverage-tracker'

// Parse command line arguments
const args = process.argv.slice(2)
let gameCount = 10
let botCount = 6

for (const arg of args) {
  if (arg.startsWith('--games=')) {
    gameCount = parseInt(arg.split('=')[1], 10)
  }
  if (arg.startsWith('--bots=')) {
    botCount = parseInt(arg.split('=')[1], 10)
  }
}

// Validate inputs
if (botCount < 2 || botCount > 9) {
  console.error('❌ Bot count must be between 2 and 9')
  process.exit(1)
}

if (gameCount < 1) {
  console.error('❌ Game count must be at least 1')
  process.exit(1)
}

async function main() {
  console.log(`\n🎰 Poker Game Automated Testing System\n`)
  console.log(`Running ${gameCount} simulated games with ${botCount} bots each...\n`)

  const startTime = Date.now()
  let passCount = 0
  let failCount = 0
  const allBugs = []
  const coverageTracker = CoverageTracker.loadFromFile()

  for (let i = 0; i < gameCount; i++) {
    const gameStartTime = Date.now()
    try {
      const result = await runSimulatedGame({
        botCount,
        startingChips: 1000,
        smallBlind: 10,
        bigBlind: 20,
      })

      const duration = Date.now() - gameStartTime
      const status = result.success ? '✓' : '✗'
      const actionCount = result.gameLog.length

      if (result.success) {
        passCount++
        console.log(`Game ${i + 1}/${gameCount}: ${status} Success (${actionCount} actions, ${duration}ms)`)
      } else {
        failCount++
        const bugSummary = result.errors.length > 0
          ? ` - ${result.errors[0].invariant}`
          : ' - Unknown failure'
        console.log(`Game ${i + 1}/${gameCount}: ${status} FAILED${bugSummary}`)
      }

      allBugs.push(...result.errors)
      coverageTracker.mergeGameCoverage(result.coverageHits)
    } catch (e) {
      failCount++
      console.log(`Game ${i + 1}/${gameCount}: ✗ CRASHED - ${(e as Error).message}`)
    }
  }

  const totalDuration = Date.now() - startTime

  // Print summary
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Results: ${passCount} passed, ${failCount} failed`)
  console.log(`Total bugs found: ${allBugs.length}`)
  console.log(`Total time: ${(totalDuration / 1000).toFixed(2)}s`)
  console.log(`${'─'.repeat(60)}\n`)

  // Print coverage
  const coverage = coverageTracker.getData()
  console.log('📊 Scenario Coverage:')
  console.log(`  • All-in with side pots: ${coverage.allInWithSidePots}`)
  console.log(`  • Heads-up (2 players): ${coverage.headsUp}`)
  console.log(`  • Split pot: ${coverage.splitPot}`)
  console.log(`  • Player elimination: ${coverage.playerElimination}`)
  console.log(`  • Everyone folds to blind: ${coverage.everyoneFoldsToBlind}`)
  console.log(`  • Showdown: ${coverage.showdown}`)

  // Save files
  const bugsFile = `${process.cwd()}/POKER_BUGS.md`
  const coverageFile = coverageTracker.saveToFile()

  if (allBugs.length > 0) {
    console.log(`\n🐛 Bugs logged to ${bugsFile}`)

    // Write POKER_BUGS.md
    let bugContent = `# Poker Game Bugs - Auto-Generated\n\n`
    bugContent += `Last updated: ${new Date().toISOString()}\n`
    bugContent += `Total bugs found: ${allBugs.length}\n\n`

    allBugs.forEach((bug, idx) => {
      bugContent += `## Bug #${idx + 1} - ${bug.timestamp}\n`
      bugContent += `**Severity**: ${bug.severity}\n`
      bugContent += `**Invariant Broken**: ${bug.invariant}\n`
      bugContent += `**Game ID**: ${bug.gameId}\n`
      bugContent += `**Action #**: ${bug.actionNumber}\n\n`
      bugContent += `### Error Details:\n\`\`\`json\n`
      bugContent += JSON.stringify(bug.errorDetails, null, 2)
      bugContent += `\n\`\`\`\n\n`
      bugContent += `### Last 10 Actions:\n`
      bug.lastActions.forEach((action, actionIdx) => {
        bugContent += `- ${action}\n`
      })
      bugContent += `\n---\n\n`
    })

    const fs = require('fs')
    fs.writeFileSync(bugsFile, bugContent, 'utf-8')
  } else {
    console.log(`\n✅ No bugs found!`)
  }

  console.log(`📈 Coverage saved to ${coverageFile}\n`)

  // Exit with appropriate code
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(`\n❌ Fatal error: ${(e as Error).message}`)
  process.exit(1)
})
