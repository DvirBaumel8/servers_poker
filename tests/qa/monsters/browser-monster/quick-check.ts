#!/usr/bin/env npx ts-node
/**
 * ⚡ QUICK CHECK - Combined Fast QA in < 5 seconds
 *
 * Runs both Bug Detection + Quality Critique in one go.
 * Perfect for: pre-commit, CI, development feedback loop.
 *
 * All issues are tracked in the unified issue tracker.
 *
 * Run: npm run monsters:quick-check
 */

import { chromium, Browser, Page } from "playwright";
import {
  addIssue,
  printSummary,
  generateReport,
  Severity,
} from "../shared/issue-tracker";

const BASE_URL = process.env.FRONTEND_URL || "http://localhost:3001";

// ============================================================================
// ALL CHECKS IN ONE MEGA-BATCH
// ============================================================================

const MEGA_CHECK = `
(() => {
  const report = {
    bugs: [],
    quality: {},
    score: 0,
  };

  // ===================== BUG DETECTION =====================
  
  // React crash
  if (document.body.innerText.includes('Something went wrong')) {
    report.bugs.push({ sev: 'critical', msg: 'React crash - error boundary triggered' });
  }
  
  // Blank page
  if (document.body.innerText.trim().length < 20) {
    report.bugs.push({ sev: 'high', msg: 'Page appears blank/empty' });
  }
  
  // Horizontal overflow
  if (document.body.scrollWidth > window.innerWidth + 10) {
    report.bugs.push({ sev: 'low', msg: 'Horizontal scroll detected' });
  }
  
  // Missing alt text
  const noAlt = document.querySelectorAll('img:not([alt])').length;
  if (noAlt > 0) report.bugs.push({ sev: 'low', msg: noAlt + ' images without alt text' });
  
  // Unlabeled buttons
  const noLabel = Array.from(document.querySelectorAll('button:not([aria-label])')).filter(b => !b.textContent?.trim()).length;
  if (noLabel > 0) report.bugs.push({ sev: 'medium', msg: noLabel + ' buttons without labels' });
  
  // Empty links
  const emptyLinks = document.querySelectorAll('a[href="#"], a[href=""], a:not([href])').length;
  if (emptyLinks > 0) report.bugs.push({ sev: 'low', msg: emptyLinks + ' links without href' });

  // ===================== QUALITY SCORES =====================
  
  // Typography (0-10) - check for premium fonts like Inter, Montserrat, Playfair
  const font = getComputedStyle(document.body).fontFamily.toLowerCase();
  const hasPremiumFont = font.includes('inter') || font.includes('montserrat') || 
                         font.includes('playfair') || font.includes('poppins');
  report.quality.typography = hasPremiumFont ? 8 : 3;
  
  // Navigation (0-10) - check nav links and header navigation
  const navLinks = document.querySelectorAll('nav a, header a').length;
  report.quality.navigation = navLinks >= 4 ? 8 : navLinks >= 2 ? 6 : 2;
  
  // Hero/CTA (0-10) - check for headline, description, and call-to-action
  const hasHero = !!document.querySelector('h1');
  const hasCTA = !!document.querySelector('button, a.btn-primary, [class*="btn"]');
  const hasDescription = document.body.innerText.length > 200;
  report.quality.firstImpression = (hasHero ? 4 : 0) + (hasCTA ? 3 : 0) + (hasDescription ? 3 : 0);
  
  // Animations (0-10) - check for CSS animations, transitions, or motion classes
  let hasAnim = false;
  const hasMotionClasses = document.querySelectorAll('[class*="animate"], [class*="motion"], [class*="transition"]').length > 0;
  try {
    const css = Array.from(document.styleSheets).flatMap(s => {
      try { return Array.from(s.cssRules).map(r => r.cssText); } catch(e) { return []; }
    }).join('');
    hasAnim = css.includes('animation') || css.includes('transition') || css.includes('@keyframes');
  } catch(e) { /* Cross-origin stylesheets may throw - safely ignore */ }
  report.quality.animations = (hasAnim || hasMotionClasses) ? 8 : 2;
  
  // Consistency (0-10)
  const buttons = Array.from(document.querySelectorAll('button'));
  const styles = new Set(buttons.map(b => getComputedStyle(b).borderRadius));
  report.quality.consistency = styles.size <= 3 || buttons.length < 3 ? 7 : 4;
  
  // Favicon (0-10)
  const hasFavicon = !!document.querySelector('link[rel*="icon"]');
  const goodTitle = document.title && !document.title.includes('Vite');
  report.quality.polish = (hasFavicon ? 5 : 0) + (goodTitle ? 5 : 0);
  
  // Calculate overall score
  const scores = Object.values(report.quality);
  report.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  
  return report;
})()
`;

const GAME_PAGE_CHECK = `
(() => {
  const quality = {};
  const url = window.location.pathname;
  
  // Only evaluate game elements if we're on a game/table page
  const isGamePage = url.includes('/game') || url.includes('/table/') || 
                     document.querySelector('[class*="poker-table"], [class*="game-view"]');
  
  if (!isGamePage) {
    // Not a game page - skip game-specific checks (return neutral scores)
    return { 
      pokerTable: 5, 
      cards: 5, 
      bettingUI: 5, 
      playerSeats: 5, 
      timer: 5,
      _skipped: true 
    };
  }
  
  // Poker table
  const hasTable = !!document.querySelector('[class*="table"], [class*="poker"]');
  quality.pokerTable = hasTable ? 5 : 1;
  
  // Cards
  const hasCards = !!document.querySelector('[class*="card"]');
  quality.cards = hasCards ? 5 : 1;
  
  // Betting UI
  const hasSlider = !!document.querySelector('input[type="range"]');
  const hasBetBtns = !!document.querySelector('[class*="bet"]');
  quality.bettingUI = (hasSlider ? 4 : 0) + (hasBetBtns ? 4 : 0) || 1;
  
  // Player seats
  const seats = document.querySelectorAll('[class*="seat"], [class*="player"]').length;
  quality.playerSeats = seats >= 2 ? 6 : 2;
  
  // Timer
  const hasTimer = !!document.querySelector('[class*="timer"], [class*="countdown"]');
  quality.timer = hasTimer ? 7 : 2;
  
  return quality;
})()
`;

// ============================================================================
// QUICK CHECK RUNNER
// ============================================================================

async function quickCheck(): Promise<void> {
  const start = Date.now();

  console.log("\n" + "═".repeat(50));
  console.log("  ⚡ QUICK CHECK - Bug + Quality in < 5 seconds");
  console.log("═".repeat(50) + "\n");

  const browser = await chromium.launch({ headless: true });

  let bugs: any[] = [];
  let qualityScores: Record<string, number> = {};
  let overallScore = 0;

  try {
    // Check 1: Home page (bugs + quality)
    const ctx1 = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page1 = await ctx1.newPage();

    console.log("  📍 Checking home page...");
    await page1.goto(`${BASE_URL}/`, {
      waitUntil: "networkidle",
      timeout: 10000,
    });
    // Wait for React app to render (check for h1 or main content)
    await page1
      .waitForSelector('h1, main, [class*="hero"], [class*="home"]', {
        timeout: 3000,
      })
      .catch(() => {});
    const homeResult = (await page1.evaluate(MEGA_CHECK)) as any;
    bugs = homeResult.bugs;
    qualityScores = { ...homeResult.quality };
    overallScore = homeResult.score;
    await ctx1.close();

    // Check 2: Game page (game-specific quality)
    const ctx2 = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page2 = await ctx2.newPage();

    console.log("  📍 Checking game interface...");
    await page2.goto(`${BASE_URL}/tables`, {
      waitUntil: "networkidle",
      timeout: 10000,
    });
    await page2
      .waitForSelector('main, h1, [class*="table"]', { timeout: 3000 })
      .catch(() => {});
    const gameResult = (await page2.evaluate(GAME_PAGE_CHECK)) as Record<
      string,
      number
    >;
    qualityScores = { ...qualityScores, ...gameResult };
    await ctx2.close();

    // Check 3: Mobile (quick overflow check)
    const ctx3 = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
    const page3 = await ctx3.newPage();

    console.log("  📍 Checking mobile...");
    await page3.goto(`${BASE_URL}/`, {
      waitUntil: "networkidle",
      timeout: 10000,
    });
    await page3.waitForSelector("h1, main", { timeout: 3000 }).catch(() => {});
    const mobileOverflow = await page3.evaluate(
      `document.body.scrollWidth > window.innerWidth`,
    );
    if (mobileOverflow) {
      bugs.push({ sev: "low", msg: "Mobile horizontal overflow" });
    }
    await ctx3.close();
  } catch (err) {
    bugs.push({
      sev: "high",
      msg: `Page load error: ${String(err).slice(0, 50)}`,
    });
  }

  await browser.close();

  // Calculate final score (filter out internal flags)
  const allScores = Object.entries(qualityScores)
    .filter(([key]) => !key.startsWith("_"))
    .map(([, score]) => score as number);
  const finalScore = Math.round(
    allScores.reduce((a, b) => a + b, 0) / allScores.length,
  );
  const grade =
    finalScore >= 8 ? "A" : finalScore >= 6 ? "B" : finalScore >= 4 ? "C" : "F";

  const duration = ((Date.now() - start) / 1000).toFixed(1);

  // ===================== SAVE TO UNIFIED TRACKER =====================

  // Save bugs to tracker
  for (const bug of bugs) {
    addIssue({
      category: "BUG",
      severity: bug.sev as Severity,
      source: "quick-check",
      title: bug.msg.split(":")[0] || bug.msg,
      description: bug.msg,
      location: "/",
    });
  }

  // Save quality issues (scores < 4) to tracker
  for (const [key, score] of Object.entries(qualityScores)) {
    // Skip internal flags
    if (key.startsWith("_")) continue;

    if (score < 4) {
      addIssue({
        category: "QUALITY",
        severity: score < 2 ? "high" : "medium",
        source: "quick-check",
        title: `Low ${key} score`,
        description: `${key} scored ${score}/10`,
        location: "/",
        suggestion: getQualitySuggestion(key),
      });
    }
  }

  // ===================== PRINT REPORT =====================

  console.log("\n" + "─".repeat(50));
  console.log(`  ⏱️  Completed in ${duration}s`);
  console.log("─".repeat(50));

  // Bugs
  const critical = bugs.filter((b) => b.sev === "critical").length;
  const high = bugs.filter((b) => b.sev === "high").length;
  const medium = bugs.filter((b) => b.sev === "medium").length;
  const low = bugs.filter((b) => b.sev === "low").length;

  console.log(`\n  🐛 BUGS: ${bugs.length} found`);
  if (bugs.length > 0) {
    console.log(
      `     🔴 ${critical} critical | 🟠 ${high} high | 🟡 ${medium} medium | 🟢 ${low} low`,
    );
    bugs.slice(0, 5).forEach((b) => {
      const icon =
        b.sev === "critical"
          ? "🔴"
          : b.sev === "high"
            ? "🟠"
            : b.sev === "medium"
              ? "🟡"
              : "🟢";
      console.log(`     ${icon} ${b.msg}`);
    });
  } else {
    console.log("     ✅ No bugs detected!");
  }

  // Quality
  console.log(`\n  🎨 QUALITY: ${finalScore}/10 (${grade})`);

  const categories = {
    Visual: ["typography", "animations", "pokerTable", "cards"],
    UX: ["navigation", "firstImpression"],
    Game: ["bettingUI", "playerSeats", "timer"],
    Polish: ["consistency", "polish"],
  };

  for (const [cat, keys] of Object.entries(categories)) {
    const catScores = keys
      .filter((k) => qualityScores[k] !== undefined)
      .map((k) => qualityScores[k]);
    if (catScores.length > 0) {
      const avg = Math.round(
        catScores.reduce((a, b) => a + b, 0) / catScores.length,
      );
      const bar = "█".repeat(avg) + "░".repeat(10 - avg);
      console.log(`     ${cat.padEnd(8)} ${bar} ${avg}/10`);
    }
  }

  // Verdict
  console.log("\n" + "─".repeat(50));
  const passed = critical === 0 && high === 0 && finalScore >= 4;
  if (passed) {
    console.log("  ✅ QUICK CHECK PASSED");
  } else {
    console.log("  ❌ QUICK CHECK FAILED - Issues need attention");
  }
  console.log("─".repeat(50) + "\n");

  // Show tracker summary
  printSummary();

  process.exit(passed ? 0 : 1);
}

// ============================================================================
// QUALITY SUGGESTIONS
// ============================================================================

function getQualitySuggestion(key: string): string {
  const suggestions: Record<string, string> = {
    typography: "Use premium fonts: Montserrat for headings, Inter for body",
    navigation: "Add icons + text for Lobby, Tables, Tournaments, Leaderboard",
    firstImpression: "Clear headline + CTA + visual imagery above fold",
    animations: "Add hover effects, page transitions, micro-interactions",
    pokerTable: "Add felt-textured table with lighting and depth",
    cards: "High-quality card graphics with shadows",
    bettingUI: "Need slider, quick buttons (1/2 Pot, Pot, All-in)",
    playerSeats: "Each seat: avatar, name, stack, cards, status",
    timer: "Circular timer with color change (green→yellow→red)",
  };
  return suggestions[key] || "Improve this area";
}

// ============================================================================
// RUN
// ============================================================================

quickCheck().catch((err) => {
  console.error("Quick check crashed:", err);
  process.exit(1);
});
