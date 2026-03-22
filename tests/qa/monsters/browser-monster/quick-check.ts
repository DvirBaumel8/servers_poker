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

import { Page } from "playwright";
import {
  BrowserBaseMonster,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
} from "../shared/browser-base-monster";
import { RunConfig, Severity } from "../shared/types";
import { runMonsterCli } from "../shared/cli-runner";

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
  
  const font = getComputedStyle(document.body).fontFamily.toLowerCase();
  const hasPremiumFont = font.includes('inter') || font.includes('montserrat') || 
                         font.includes('playfair') || font.includes('poppins');
  report.quality.typography = hasPremiumFont ? 8 : 3;
  
  const navLinks = document.querySelectorAll('nav a, header a').length;
  report.quality.navigation = navLinks >= 4 ? 8 : navLinks >= 2 ? 6 : 2;
  
  const hasHero = !!document.querySelector('h1');
  const hasCTA = !!document.querySelector('button, a.btn-primary, [class*="btn"]');
  const hasDescription = document.body.innerText.length > 200;
  report.quality.firstImpression = (hasHero ? 4 : 0) + (hasCTA ? 3 : 0) + (hasDescription ? 3 : 0);
  
  let hasAnim = false;
  const hasMotionClasses = document.querySelectorAll('[class*="animate"], [class*="motion"], [class*="transition"]').length > 0;
  try {
    const css = Array.from(document.styleSheets).flatMap(s => {
      try { return Array.from(s.cssRules).map(r => r.cssText); } catch(e) { return []; }
    }).join('');
    hasAnim = css.includes('animation') || css.includes('transition') || css.includes('@keyframes');
  } catch(e) {}
  report.quality.animations = (hasAnim || hasMotionClasses) ? 8 : 2;
  
  const buttons = Array.from(document.querySelectorAll('button'));
  const styles = new Set(buttons.map(b => getComputedStyle(b).borderRadius));
  report.quality.consistency = styles.size <= 3 || buttons.length < 3 ? 7 : 4;
  
  const hasFavicon = !!document.querySelector('link[rel*="icon"]');
  const goodTitle = document.title && !document.title.includes('Vite');
  report.quality.polish = (hasFavicon ? 5 : 0) + (goodTitle ? 5 : 0);
  
  const scores = Object.values(report.quality);
  report.score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  
  return report;
})()
`;

const GAME_PAGE_CHECK = `
(() => {
  const quality = {};
  const url = window.location.pathname;
  
  const isGamePage = url.includes('/game') || url.includes('/table/') || 
                     document.querySelector('[class*="poker-table"], [class*="game-view"]');
  
  if (!isGamePage) {
    return { 
      pokerTable: 5, cards: 5, bettingUI: 5, playerSeats: 5, timer: 5,
      _skipped: true 
    };
  }
  
  const hasTable = !!document.querySelector('[class*="table"], [class*="poker"]');
  quality.pokerTable = hasTable ? 5 : 1;
  
  const hasCards = !!document.querySelector('[class*="card"]');
  quality.cards = hasCards ? 5 : 1;
  
  const hasSlider = !!document.querySelector('input[type="range"]');
  const hasBetBtns = !!document.querySelector('[class*="bet"]');
  quality.bettingUI = (hasSlider ? 4 : 0) + (hasBetBtns ? 4 : 0) || 1;
  
  const seats = document.querySelectorAll('[class*="seat"], [class*="player"]').length;
  quality.playerSeats = seats >= 2 ? 6 : 2;
  
  const hasTimer = !!document.querySelector('[class*="timer"], [class*="countdown"]');
  quality.timer = hasTimer ? 7 : 2;
  
  return quality;
})()
`;

// ============================================================================
// QUICK CHECK MONSTER
// ============================================================================

class QuickCheckMonster extends BrowserBaseMonster {
  constructor() {
    super({
      name: "Quick Check",
      type: "quick-check",
      timeout: 30000,
    });
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    console.log("\n" + "═".repeat(50));
    console.log("  ⚡ QUICK CHECK - Bug + Quality in < 5 seconds");
    console.log("═".repeat(50) + "\n");

    let bugs: Array<{ sev: string; msg: string }> = [];
    let qualityScores: Record<string, number> = {};

    // Check 1: Home page (bugs + quality)
    const ctx1 = await this.createContext(DESKTOP_VIEWPORT);
    const { page: page1 } = await this.createPage(ctx1);

    console.log("  📍 Checking home page...");
    this.recordCheck();
    const homeLoaded = await this.navigateTo(page1, "/", {
      waitForSelector: 'h1, main, [class*="hero"], [class*="home"]',
    });
    if (homeLoaded) {
      const homeResult = (await page1.evaluate(MEGA_CHECK)) as {
        bugs: Array<{ sev: string; msg: string }>;
        quality: Record<string, number>;
      };
      bugs = homeResult.bugs;
      qualityScores = { ...homeResult.quality };
      this.recordTest(true);
    } else {
      this.recordTest(false);
    }
    await ctx1.close();

    // Check 2: Game page (game-specific quality)
    const ctx2 = await this.createContext(DESKTOP_VIEWPORT);
    const { page: page2 } = await this.createPage(ctx2);

    console.log("  📍 Checking game interface...");
    this.recordCheck();
    const tablesLoaded = await this.navigateTo(page2, "/tables");
    if (tablesLoaded) {
      const gameResult = (await page2.evaluate(GAME_PAGE_CHECK)) as Record<
        string,
        number
      >;
      qualityScores = { ...qualityScores, ...gameResult };
      this.recordTest(true);
    } else {
      this.recordTest(false);
    }
    await ctx2.close();

    // Check 3: Mobile (quick overflow check)
    const ctx3 = await this.createContext(MOBILE_VIEWPORT);
    const { page: page3 } = await this.createPage(ctx3);

    console.log("  📍 Checking mobile...");
    this.recordCheck();
    const mobileLoaded = await this.navigateTo(page3, "/");
    if (mobileLoaded) {
      const mobileOverflow = await page3.evaluate(
        `document.body.scrollWidth > window.innerWidth`,
      );
      if (mobileOverflow) {
        bugs.push({ sev: "low", msg: "Mobile horizontal overflow" });
      }
      this.recordTest(true);
    } else {
      this.recordTest(false);
    }
    await ctx3.close();

    // Track bugs as findings
    for (const bug of bugs) {
      this.addFinding({
        category: "BUG",
        severity: bug.sev as Severity,
        title: bug.msg.split(":")[0] || bug.msg,
        description: bug.msg,
        location: { page: "/" },
        reproducible: true,
        tags: ["quick-check"],
      });
    }

    // Track quality issues (scores < 4)
    for (const [key, score] of Object.entries(qualityScores)) {
      if (key.startsWith("_")) continue;
      this.recordCheck();
      if (score < 4) {
        this.addFinding({
          category: "UX",
          severity: (score < 2 ? "high" : "medium") as Severity,
          title: `Low ${key} score`,
          description: `${key} scored ${score}/10. ${getQualitySuggestion(key)}`,
          location: { page: "/" },
          reproducible: true,
          tags: ["quality", key],
        });
      }
    }

    // Print quality summary
    const allScores = Object.entries(qualityScores)
      .filter(([key]) => !key.startsWith("_"))
      .map(([, score]) => score as number);
    const finalScore =
      allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0;
    const grade =
      finalScore >= 8
        ? "A"
        : finalScore >= 6
          ? "B"
          : finalScore >= 4
            ? "C"
            : "F";

    console.log(`\n  🎨 QUALITY: ${finalScore}/10 (${grade})`);

    const categories: Record<string, string[]> = {
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
  }
}

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

runMonsterCli(new QuickCheckMonster(), "quick-check");
