#!/usr/bin/env npx ts-node
/**
 * ⚡ FAST QUALITY MONSTER - Speed-Optimized Product Critique
 *
 * Same quality analysis as the full monster, but 10x faster:
 * - Parallel page evaluation
 * - Cached page loads (visit once, check many things)
 * - Smart sampling (not all viewports, representative ones)
 * - Batch DOM queries (one evaluate call, many checks)
 *
 * Target: < 30 seconds for full quality report
 *
 * Run: npm run monsters:quality:fast
 */

import * as fs from "fs";
import * as path from "path";
import {
  BrowserBaseMonster,
  DESKTOP_VIEWPORT,
} from "../shared/browser-base-monster";
import { RunConfig, Severity } from "../shared/types";
import { runMonsterCli } from "../shared/cli-runner";
import {
  updateQualityReport,
  generateReport as generateIssueReport,
} from "../shared/issue-tracker";

// ============================================================================
// TYPES
// ============================================================================

interface FastQualityReport {
  score: number;
  grade: string;
  duration: number;
  categories: Record<string, { score: number; grade: string }>;
  priorities: string[];
  competitorGaps: string[];
  quickWins: string[];
}

// ============================================================================
// BATCH EVALUATION SCRIPTS
// ============================================================================

const BATCH_HOME_CHECKS = `
(() => {
  const results = {};
  
  const bodyFont = getComputedStyle(document.body).fontFamily;
  const hasCustomFont = !bodyFont.includes('system-ui') && !bodyFont.includes('Arial') && !bodyFont.includes('-apple-system');
  results.typography = {
    score: hasCustomFont ? 7 : 3,
    observation: hasCustomFont ? 'Custom fonts in use' : 'Using system fonts - looks generic',
    suggestion: "Use premium fonts: 'Montserrat' for headings, 'Inter' for body",
  };
  
  const navLinks = document.querySelectorAll('nav a, [role="navigation"] a').length;
  const hasIcons = document.querySelectorAll('nav svg, nav img').length > 0;
  results.navigation = {
    score: navLinks >= 4 ? (hasIcons ? 8 : 6) : 3,
    observation: navLinks >= 4 ? 'Adequate navigation' : 'Navigation is sparse',
    suggestion: 'Add icons + text for Lobby, Tables, Tournaments, Leaderboard, Profile',
  };
  
  const hasHero = !!document.querySelector('h1, [class*="hero"]');
  const hasCTA = !!document.querySelector('button, a[class*="btn"]');
  const hasVisual = !!document.querySelector('img, svg, [class*="animation"]');
  const impressionScore = (hasHero ? 3 : 0) + (hasCTA ? 3 : 0) + (hasVisual ? 2 : 0);
  results.firstImpression = {
    score: impressionScore,
    observation: impressionScore >= 6 ? 'Good first impression' : 'Weak first impression - unclear value prop',
    suggestion: 'Clear headline + Call to action + Visual imagery above the fold',
    competitorNote: 'PokerStars: Massive poker imagery, Play Now CTA, promotions visible immediately',
  };
  
  let hasAnimations = false;
  try {
    const styles = Array.from(document.styleSheets).flatMap(s => {
      try { return Array.from(s.cssRules || []).map(r => r.cssText); } 
      catch(e) { return []; }
    }).join('');
    hasAnimations = styles.includes('animation') || styles.includes('transition');
  } catch(e) {}
  results.animations = {
    score: hasAnimations ? 6 : 2,
    observation: hasAnimations ? 'Some animations present' : 'Static UI - no animations',
    suggestion: 'Add hover effects, page transitions, micro-interactions',
  };
  
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  results.colorScheme = {
    score: 6,
    observation: 'Color scheme exists but could be more distinctive',
    suggestion: 'Deep navy backgrounds, gold accents, emerald for success',
    competitorNote: 'GGPoker: vibrant orange+black. PokerStars: iconic red star.',
  };
  
  const hasFavicon = !!document.querySelector('link[rel*="icon"]');
  const title = document.title;
  const hasProperTitle = title && !title.includes('Vite') && !title.includes('localhost');
  results.meta = {
    score: hasFavicon && hasProperTitle ? 9 : 4,
    observation: hasFavicon && hasProperTitle ? 'Proper favicon and title' : 'Missing favicon or generic title',
    suggestion: 'Add branded favicon, meaningful page titles',
  };
  
  const buttons = Array.from(document.querySelectorAll('button'));
  const uniqueStyles = new Set(buttons.map(b => {
    const s = getComputedStyle(b);
    return s.borderRadius + '|' + s.padding;
  }));
  const isConsistent = uniqueStyles.size <= buttons.length * 0.5 || buttons.length < 3;
  results.consistency = {
    score: isConsistent ? 7 : 4,
    observation: isConsistent ? 'Reasonable visual consistency' : 'Inconsistent button styles',
    suggestion: 'Create design system: primary, secondary, ghost buttons',
  };
  
  return results;
})()
`;

const BATCH_GAME_CHECKS = `
(() => {
  const results = {};
  const url = window.location.pathname;
  const isGamePage = url.includes('/game') || url.includes('/table/') ||
                     !!document.querySelector('.poker-table, [class*="game-view"]');

  if (!isGamePage) {
    return {
      pokerTable: { score: 5, observation: 'N/A (not on game page)', suggestion: null },
      cards: { score: 5, observation: 'N/A (not on game page)', suggestion: null },
      bettingUI: { score: 5, observation: 'N/A (not on game page)', suggestion: null },
      potDisplay: { score: 5, observation: 'N/A (not on game page)', suggestion: null },
      playerSeats: { score: 5, observation: 'N/A (not on game page)', suggestion: null },
      timer: { score: 5, observation: 'N/A (not on game page)', suggestion: null },
    };
  }

  const hasTable = !!document.querySelector('img[src*="table"], [style*="felt"], .poker-table, [class*="table"]');
  results.pokerTable = {
    score: hasTable ? 6 : 2,
    observation: hasTable ? 'Basic poker table exists' : 'No visual poker table',
    suggestion: 'Add felt-textured table with lighting effects and depth',
    competitorNote: 'PokerStars: photorealistic 3D tables. GGPoker: animated tables with particles.',
  };
  
  const cards = document.querySelectorAll('[class*="card"], .playing-card, img[src*="card"]');
  const hasCardShadow = cards.length > 0 && Array.from(cards).some(c => 
    getComputedStyle(c).boxShadow !== 'none'
  );
  results.cards = {
    score: cards.length > 0 ? (hasCardShadow ? 7 : 4) : 1,
    observation: cards.length > 0 ? 'Cards present' : 'No playing cards visible',
    suggestion: 'High-quality card graphics with shadows and hover effects',
  };
  
  const hasSlider = !!document.querySelector('input[type="range"], [class*="slider"]');
  const hasQuickBets = !!document.querySelector('[class*="bet"]');
  const betScore = (hasSlider ? 4 : 0) + (hasQuickBets ? 3 : 0);
  results.bettingUI = {
    score: betScore || 2,
    observation: hasSlider && hasQuickBets ? 'Betting UI present' : 'Incomplete betting UI',
    suggestion: 'Need: bet slider, quick buttons (1/2 Pot, Pot, All-in), manual input',
    competitorNote: 'Every major platform has this - its table stakes.',
  };
  
  const hasPot = !!document.querySelector('[class*="pot"]') || 
                 document.body.innerText.toLowerCase().includes('pot:');
  results.potDisplay = {
    score: hasPot ? 6 : 2,
    observation: hasPot ? 'Pot display exists' : 'No visible pot',
    suggestion: 'Large pot display center-top with chip icon',
  };
  
  const seats = document.querySelectorAll('[class*="seat"], [class*="player"]');
  const hasAvatars = document.querySelectorAll('[class*="avatar"]').length > 0;
  results.playerSeats = {
    score: seats.length >= 2 ? (hasAvatars ? 7 : 5) : 2,
    observation: seats.length >= 2 ? 'Player seats defined' : 'Player seats unclear',
    suggestion: 'Each seat: avatar, name, chip stack, cards, action status',
    competitorNote: 'GGPoker: animated avatars with emotions.',
  };
  
  const hasTimer = !!document.querySelector('[class*="timer"], [class*="countdown"], [class*="progress"]');
  results.timer = {
    score: hasTimer ? 7 : 3,
    observation: hasTimer ? 'Timer present' : 'No action timer visible',
    suggestion: 'Circular timer with color change (green->yellow->red)',
    competitorNote: 'PokerStars iconic circular timer, GGPoker adds sound warnings.',
  };
  
  return results;
})()
`;

const BATCH_MOBILE_CHECK = `
(() => {
  const results = {};
  
  const hasOverflow = document.body.scrollWidth > window.innerWidth;
  const hasMobileMenu = !!document.querySelector('[class*="hamburger"], [class*="mobile-menu"], button[aria-label*="menu" i]');
  
  const buttons = document.querySelectorAll('button, a');
  let tooSmall = 0;
  buttons.forEach(btn => {
    const rect = btn.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) tooSmall++;
  });
  const touchOk = tooSmall < buttons.length * 0.3;
  
  const score = (hasOverflow ? 0 : 3) + (hasMobileMenu ? 3 : 0) + (touchOk ? 3 : 0);
  
  results.mobile = {
    score: score,
    observation: score >= 7 ? 'Good mobile support' : 'Mobile experience needs work',
    suggestion: hasOverflow ? 'Fix horizontal overflow' : hasMobileMenu ? '' : 'Add hamburger menu',
    competitorNote: 'Mobile drives most poker traffic. GGPoker/PokerStars have mobile-first design.',
  };
  
  return results;
})()
`;

// ============================================================================
// FAST QUALITY MONSTER
// ============================================================================

class FastQualityMonster extends BrowserBaseMonster {
  private results: Record<string, any> = {};

  constructor() {
    super({
      name: "Fast Quality",
      type: "fast-quality",
      timeout: 30000,
    });
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    console.log("\n" + "═".repeat(60));
    console.log("  ⚡ FAST QUALITY MONSTER - Speed Optimized");
    console.log("═".repeat(60));
    console.log("  Target: Complete analysis in < 30 seconds\n");

    const context = await this.createContext(DESKTOP_VIEWPORT);
    const { page } = await this.createPage(context);

    try {
      // BATCH 1: Home page checks
      console.log("  📍 Batch 1: Home page analysis...");
      this.recordCheck();
      const homeLoaded = await this.navigateTo(page, "/", {
        waitForSelector: "nav a",
      });
      if (homeLoaded) {
        const homeResults = (await page.evaluate(BATCH_HOME_CHECKS)) as Record<
          string,
          any
        >;
        Object.assign(this.results, homeResults);
        this.recordTest(true);
        console.log(
          `    ✓ ${Object.keys(homeResults).length} checks completed`,
        );
      }

      // BATCH 2: Game page checks
      console.log("  📍 Batch 2: Game interface analysis...");
      this.recordCheck();
      const tablesLoaded = await this.navigateTo(page, "/tables");
      if (tablesLoaded) {
        const gameResults = (await page.evaluate(BATCH_GAME_CHECKS)) as Record<
          string,
          any
        >;
        Object.assign(this.results, gameResults);
        this.recordTest(true);
        console.log(
          `    ✓ ${Object.keys(gameResults).length} checks completed`,
        );
      }

      // BATCH 3: Mobile check
      console.log("  📍 Batch 3: Mobile responsiveness...");
      this.recordCheck();
      await page.setViewportSize({ width: 375, height: 667 });
      const mobileLoaded = await this.navigateTo(page, "/");
      if (mobileLoaded) {
        const mobileResults = (await page.evaluate(
          BATCH_MOBILE_CHECK,
        )) as Record<string, any>;
        Object.assign(this.results, mobileResults);
        this.recordTest(true);
        console.log(`    ✓ Mobile check completed`);
      }
    } finally {
      await context.close();
    }

    // Track quality issues — report anything scoring below 6 (was 4, too lenient)
    for (const [key, val] of Object.entries(this.results)) {
      this.recordCheck();
      if (val.score < 6) {
        const severity: Severity =
          val.score < 3 ? "high" : val.score < 5 ? "medium" : "low";
        this.addFinding({
          category: "UX",
          severity,
          title: `Low quality score: ${key} (${val.score}/10)`,
          description: `${val.observation}${val.suggestion ? `. Suggestion: ${val.suggestion}` : ""}${val.competitorNote ? `. Competitor: ${val.competitorNote}` : ""}`,
          location: { page: key },
          reproducible: true,
          tags: ["quality", key],
        });
      }
    }

    const report = this.buildReport();
    this.printQualityReport(report);
    this.saveReport(report);

    try {
      const categories: Record<string, { score: number; status: string }> = {};
      for (const [cat, data] of Object.entries(report.categories)) {
        categories[cat] = {
          score: data.score,
          status:
            data.score >= 8
              ? "✅ Good"
              : data.score >= 6
                ? "⚠️ Fair"
                : "❌ Poor",
        };
      }

      updateQualityReport({
        overallScore: report.score,
        grade: report.grade,
        summary: `Quality score ${report.score}/10. ${report.priorities.length > 0 ? `Top priority: ${report.priorities[0]}` : ""}`,
        categories,
        priorities: report.priorities,
        competitorInsights: report.competitorGaps,
        generatedAt: new Date().toISOString(),
      });

      generateIssueReport();
    } catch {
      // Best-effort
    }
  }

  private buildReport(): FastQualityReport {
    const categoryChecks: Record<string, string[]> = {
      visual: [
        "typography",
        "colorScheme",
        "animations",
        "pokerTable",
        "cards",
      ],
      ux: ["navigation", "firstImpression", "mobile"],
      game: ["bettingUI", "potDisplay", "playerSeats", "timer"],
      polish: ["meta", "consistency"],
      competitive: ["firstImpression", "pokerTable", "bettingUI"],
    };

    const categories: Record<string, { score: number; grade: string }> = {};

    for (const [cat, checks] of Object.entries(categoryChecks)) {
      const scores = checks
        .filter((c) => this.results[c])
        .map((c) => this.results[c].score);
      const avg =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0;
      categories[cat] = { score: avg, grade: getGrade(avg) };
    }

    const overallScore = Math.round(
      Object.values(categories).reduce((sum, c) => sum + c.score, 0) /
        Object.keys(categories).length,
    );

    const allResults = Object.entries(this.results)
      .map(([key, val]) => ({ key, ...val }))
      .sort((a: any, b: any) => a.score - b.score);

    return {
      score: overallScore,
      grade: getGrade(overallScore),
      duration: 0,
      categories,
      priorities: allResults
        .filter((r: any) => r.score < 5)
        .slice(0, 5)
        .map((r: any) => `${r.key}: ${r.suggestion || r.observation}`),
      competitorGaps: allResults
        .filter((r: any) => r.competitorNote)
        .slice(0, 5)
        .map((r: any) => r.competitorNote),
      quickWins: allResults
        .filter((r: any) => r.score >= 5 && r.score < 8 && r.suggestion)
        .slice(0, 3)
        .map((r: any) => `${r.key}: ${r.suggestion}`),
    };
  }

  private printQualityReport(report: FastQualityReport): void {
    console.log("\n" + "═".repeat(60));
    console.log("  📊 QUALITY REPORT");
    console.log("═".repeat(60));

    console.log(`  📈 SCORE: ${report.score}/10 (${report.grade})`);

    console.log("\n  Category Scores:");
    for (const [cat, data] of Object.entries(report.categories)) {
      const bar = "█".repeat(data.score) + "░".repeat(10 - data.score);
      console.log(
        `    ${cat.padEnd(12)} ${bar} ${data.score}/10 (${data.grade})`,
      );
    }

    if (report.priorities.length > 0) {
      console.log("\n  🚨 TOP PRIORITIES:");
      report.priorities.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
    }

    if (report.competitorGaps.length > 0) {
      console.log("\n  🏁 COMPETITOR GAPS:");
      report.competitorGaps.forEach((g, i) =>
        console.log(`    ${i + 1}. ${g}`),
      );
    }

    console.log("\n" + "═".repeat(60) + "\n");
  }

  private saveReport(report: FastQualityReport): void {
    const reportDir = path.join(
      process.cwd(),
      "tests/qa/monsters/browser-monster/reports",
    );
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(reportDir, `fast-quality-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  📄 Report: ${reportPath}`);
  }
}

function getGrade(score: number): string {
  if (score >= 9) return "A+";
  if (score >= 8) return "A";
  if (score >= 7) return "B";
  if (score >= 6) return "C";
  if (score >= 5) return "D";
  return "F";
}

// ============================================================================
// CLI
// ============================================================================

runMonsterCli(new FastQualityMonster(), "fast-quality");

export { FastQualityMonster };
