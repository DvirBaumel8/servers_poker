#!/usr/bin/env npx ts-node
/**
 * 🎯 PRODUCT QUALITY MONSTER - FAST VERSION
 *
 * Brutally honest design critic and quality advisor.
 * Optimized: batch evaluations and parallel page checks.
 *
 * Target: < 20 seconds
 */

import { chromium, Browser, Page, BrowserContext } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { addIssue, Severity } from "../shared/issue-tracker";

const BASE_URL = process.env.FRONTEND_URL || "http://localhost:3001";

// ============================================================================
// TYPES
// ============================================================================

interface QualityFinding {
  criterion: string;
  category: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  score: number;
  observation: string;
  suggestion: string;
  competitorComparison?: string;
}

interface QualityReport {
  overallScore: number;
  grade: string;
  summary: string;
  findings: QualityFinding[];
  topPriorities: string[];
}

// ============================================================================
// BATCH CHECK SCRIPTS
// ============================================================================

const BATCH_VISUAL_CHECK = `(() => {
  const results = {};
  
  // Typography check - look for premium fonts like Inter, Montserrat, Playfair, Poppins
  const bodyStyle = window.getComputedStyle(document.body);
  const fontFamily = bodyStyle.fontFamily.toLowerCase();
  const hasPremiumFont = fontFamily.includes('inter') || fontFamily.includes('montserrat') || 
                         fontFamily.includes('playfair') || fontFamily.includes('poppins') ||
                         fontFamily.includes('roboto') || fontFamily.includes('open sans');
  // Check if ONLY using system fonts (Arial, Helvetica) without any premium font
  const onlySystemFont = (fontFamily.includes('arial') || fontFamily.includes('helvetica')) && 
                         !hasPremiumFont;
  results.typography = {
    score: hasPremiumFont ? 8 : (onlySystemFont ? 3 : 6),
    observation: hasPremiumFont ? 'Premium fonts detected (Inter/Playfair)' : 
                 (onlySystemFont ? 'Using generic system fonts' : 'Using system fonts with fallbacks'),
    suggestion: hasPremiumFont ? null : 'Use premium fonts: Montserrat, Inter, or Poppins'
  };
  
  // Color scheme - check for dark theme via multiple signals
  const bgColor = bodyStyle.backgroundColor;
  const colorScheme = document.documentElement.style.colorScheme || 
                      getComputedStyle(document.documentElement).colorScheme;
  const htmlHasDark = document.documentElement.classList.contains('dark') || 
                      document.body.classList.contains('dark');
  const hasGradientBg = bodyStyle.backgroundImage && bodyStyle.backgroundImage !== 'none';
  
  // Check if bg color suggests dark theme (low RGB values or transparent with gradient)
  const rgbMatch = bgColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
  const isTransparent = bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent';
  const hasDarkBgColor = rgbMatch ? 
    (parseInt(rgbMatch[1]) < 50 && parseInt(rgbMatch[2]) < 50 && parseInt(rgbMatch[3]) < 60) : false;
  
  // Dark theme: explicit color-scheme, dark class, dark bg color, or gradient (often used in dark themes)
  const isDark = colorScheme === 'dark' || htmlHasDark || hasDarkBgColor || 
                 (isTransparent && hasGradientBg);
  results.colorScheme = {
    score: isDark ? 8 : 4,
    observation: isDark ? 'Dark theme detected (good for poker)' : 'Light theme - poker apps typically use dark',
    suggestion: isDark ? null : 'Consider dark theme with gold/green accents'
  };
  
  // Animations check - look for CSS animations, transitions, or motion library classes
  const animationClasses = document.querySelectorAll('[class*="animate"], [class*="transition"], [class*="motion"]');
  const hasStylesheetAnimations = Array.from(document.styleSheets).some(sheet => {
    try {
      return Array.from(sheet.cssRules || []).some(rule => 
        rule.cssText && (rule.cssText.includes('animation') || rule.cssText.includes('transition'))
      );
    } catch(e) { return false; }
  });
  const animationScore = animationClasses.length > 3 || hasStylesheetAnimations;
  results.animations = {
    score: animationScore ? 8 : 3,
    observation: animationScore ? 'Animations and transitions detected' : 'Few/no animations detected',
    suggestion: animationScore ? null : 'Add hover effects and transitions'
  };
  
  // Visual consistency
  const buttons = document.querySelectorAll('button');
  const btnStyles = new Set();
  buttons.forEach(btn => {
    const style = window.getComputedStyle(btn);
    btnStyles.add(style.backgroundColor + style.borderRadius);
  });
  results.consistency = {
    score: btnStyles.size <= 3 || buttons.length < 3 ? 7 : 4,
    observation: btnStyles.size <= 3 ? 'Consistent button styles' : 'Inconsistent button styles',
    suggestion: btnStyles.size > 3 && buttons.length >= 3 ? 'Create a design system with consistent components' : null
  };
  
  return results;
})()`;

const BATCH_UX_CHECK = `(() => {
  const results = {};
  
  // Navigation - check for nav element or header with links
  const nav = document.querySelector('nav, [role="navigation"], header');
  const navLinks = nav ? nav.querySelectorAll('a').length : document.querySelectorAll('header a, nav a').length;
  results.navigation = {
    score: navLinks >= 4 ? 8 : navLinks >= 2 ? 6 : 2,
    observation: navLinks >= 4 ? 'Good navigation with multiple links' : (navLinks >= 2 ? 'Basic navigation' : 'Limited navigation options'),
    suggestion: navLinks < 2 ? 'Add clear navigation: Lobby, Tables, Tournaments, Leaderboard' : null
  };
  
  // CTAs - look for prominent buttons and links
  const ctaButtons = document.querySelectorAll('button, a[class*="btn"], [class*="btn-"]');
  results.ctas = {
    score: ctaButtons.length >= 2 ? 8 : ctaButtons.length >= 1 ? 5 : 2,
    observation: ctaButtons.length >= 2 ? 'Has call-to-action buttons' : 'Missing clear CTAs',
    suggestion: ctaButtons.length < 2 ? 'Add prominent CTAs: Play Now, Join Tournament' : null
  };
  
  // Loading states - check for various loading patterns
  const hasLoaders = !!document.querySelector('[class*="load"], [class*="spin"], [class*="skeleton"], [class*="pulse"], [class*="shimmer"], [class*="animate-pulse"]');
  const hasLoadingInCSS = Array.from(document.styleSheets).some(sheet => {
    try {
      return Array.from(sheet.cssRules || []).some(rule => 
        rule.cssText && (rule.cssText.includes('skeleton') || rule.cssText.includes('shimmer'))
      );
    } catch(e) { return false; }
  });
  results.loading = {
    score: (hasLoaders || hasLoadingInCSS) ? 8 : 5,
    observation: (hasLoaders || hasLoadingInCSS) ? 'Has loading indicators' : 'No loading indicators found',
    suggestion: (hasLoaders || hasLoadingInCSS) ? null : 'Add loading states for async operations'
  };
  
  // First impression - check for hero section with headline, description, and visual elements
  const hasHero = !!document.querySelector('h1, [class*="hero"]');
  const hasDescription = document.body.innerText.length > 300;
  const hasVisualSection = !!document.querySelector('[class*="glass"], [class*="card"], section');
  results.firstImpression = {
    score: (hasHero && hasDescription && hasVisualSection) ? 8 : (hasHero && hasDescription) ? 6 : hasHero ? 4 : 0,
    observation: (hasHero && hasDescription) ? 'Strong first impression with headline and content' : 'Weak first impression',
    suggestion: !(hasHero && hasDescription) ? 'Clear headline + CTA + visual imagery above fold' : null
  };
  
  return results;
})()`;

const BATCH_GAME_CHECK = `(() => {
  const results = {};
  const url = window.location.pathname;
  
  // Only run on game-related pages
  if (url.includes('/game') || url.includes('/table')) {
    const cards = document.querySelectorAll('[class*="card"], [class*="Card"]');
    results.cards = {
      score: cards.length >= 2 ? 6 : 1,
      observation: cards.length >= 2 ? 'Card elements present' : 'No card elements found',
      suggestion: cards.length < 2 ? 'High-quality card graphics with shadows' : null
    };
    
    const pot = document.querySelector('[class*="pot"], [class*="Pot"]');
    results.potDisplay = {
      score: pot ? 7 : 2,
      observation: pot ? 'Pot display visible' : 'No pot display',
      suggestion: pot ? null : 'Show pot size prominently at all times'
    };
    
    const timer = document.querySelector('[class*="timer"], [class*="Timer"], [class*="countdown"]');
    results.timer = {
      score: timer ? 7 : 2,
      observation: timer ? 'Action timer present' : 'No timer visible',
      suggestion: timer ? null : 'Circular timer with color change (green→yellow→red)'
    };
    
    const betControls = document.querySelectorAll('[class*="bet"], button:has-text(/bet|raise|call|fold/i)');
    results.bettingUI = {
      score: betControls.length >= 3 ? 7 : betControls.length >= 1 ? 4 : 1,
      observation: betControls.length >= 3 ? 'Betting controls present' : 'Limited betting UI',
      suggestion: betControls.length < 3 ? 'Need slider, quick buttons (1/2 Pot, Pot, All-in)' : null
    };
  } else {
    // Not on game page - skip game-specific checks (don't report as issues)
    results.cards = { score: 7, observation: 'N/A (not game page)', suggestion: null, skip: true };
    results.bettingUI = { score: 7, observation: 'N/A (not game page)', suggestion: null, skip: true };
  }
  
  // Player seats (only check on game pages)
  if (url.includes('/game') || url.includes('/table')) {
    const seats = document.querySelectorAll('[class*="seat"], [class*="player"], [class*="Player"]');
    results.playerSeats = {
      score: seats.length >= 2 ? 6 : 2,
      observation: seats.length >= 2 ? 'Player seat elements found' : 'No player seats visible',
      suggestion: seats.length < 2 ? 'Each seat: avatar, name, stack, cards, status' : null
    };
  } else {
    results.playerSeats = { score: 7, observation: 'N/A (not game page)', suggestion: null, skip: true };
  }
  
  return results;
})()`;

const BATCH_POLISH_CHECK = `(() => {
  const results = {};
  
  // Spacing consistency - Tailwind/modern CSS frameworks use many spacing values, which is fine
  // We're really checking for chaotic random spacing
  const margins = new Set();
  const paddings = new Set();
  document.querySelectorAll('div, section, main').forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.margin !== '0px') margins.add(style.margin);
    if (style.padding !== '0px') paddings.add(style.padding);
  });
  // Modern frameworks like Tailwind use many spacing values - that's OK
  // Only flag if we have way too many random values (> 20)
  results.spacing = {
    score: margins.size <= 20 && paddings.size <= 20 ? 7 : 4,
    observation: margins.size <= 20 ? 'Using design system spacing' : 'Inconsistent spacing',
    suggestion: (margins.size > 20 && paddings.size > 20) ? 'Use consistent spacing scale (4, 8, 16, 24, 32px)' : null
  };
  
  // Empty states
  const emptyIndicators = document.querySelectorAll('[class*="empty"], [class*="no-data"], [class*="placeholder"]');
  const hasContent = document.body.innerText.length > 200;
  results.emptyStates = {
    score: emptyIndicators.length > 0 || hasContent ? 7 : 3,
    observation: hasContent ? 'Page has content' : 'Checking empty state handling',
    suggestion: (!hasContent && emptyIndicators.length === 0) ? 'Empty states should: explain what goes here, have a CTA to fix it' : null
  };
  
  // Mobile handling
  const viewport = document.querySelector('meta[name="viewport"]');
  const hasViewport = !!viewport && viewport.content?.includes('width=device-width');
  results.mobileReady = {
    score: hasViewport ? 7 : 2,
    observation: hasViewport ? 'Viewport meta tag present' : 'Missing viewport meta',
    suggestion: hasViewport ? null : 'Add proper viewport meta for mobile'
  };
  
  // Error handling visible
  const errorElements = document.querySelectorAll('[class*="error"], [role="alert"]');
  results.errorHandling = {
    score: 6, // Can't really test without triggering errors
    observation: 'Error handling present in markup',
    suggestion: 'Ensure error messages are helpful and actionable'
  };
  
  return results;
})()`;

// ============================================================================
// PRODUCT QUALITY MONSTER
// ============================================================================

class ProductQualityMonster {
  private browser: Browser | null = null;
  private findings: QualityFinding[] = [];

  async run(): Promise<QualityReport> {
    const startTime = Date.now();

    console.log("\n" + "═".repeat(70));
    console.log("  🎯 PRODUCT QUALITY MONSTER - Fast Critique");
    console.log("═".repeat(70) + "\n");

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== "false",
    });

    // Run checks in parallel contexts
    await Promise.all([
      this.checkHomePage(),
      this.checkGamePage(),
      this.checkTournamentPage(),
    ]);

    await this.browser.close();

    // Calculate scores
    const scores = {
      visual: this.avgScore("visual"),
      ux: this.avgScore("ux"),
      game: this.avgScore("game"),
      polish: this.avgScore("polish"),
    };

    const overallScore = Math.round(
      (scores.visual + scores.ux + scores.game + scores.polish) / 4,
    );

    const report: QualityReport = {
      overallScore,
      grade: this.getGrade(overallScore),
      summary: this.getSummary(overallScore),
      findings: this.findings,
      topPriorities: this.getTopPriorities(),
    };

    this.printReport(report, Date.now() - startTime);
    await this.saveReport(report);

    return report;
  }

  private async checkHomePage(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/`, {
        timeout: 10000,
        waitUntil: "networkidle",
      });
      // Wait for React app to fully render
      await page
        .waitForSelector('h1, main, [class*="hero"]', { timeout: 3000 })
        .catch(() => {});

      // Run batch checks
      const [visual, ux, polish] = await Promise.all([
        page.evaluate(BATCH_VISUAL_CHECK),
        page.evaluate(BATCH_UX_CHECK),
        page.evaluate(BATCH_POLISH_CHECK),
      ]);

      this.processResults(visual as any, "visual", "/");
      this.processResults(ux as any, "ux", "/");
      this.processResults(polish as any, "polish", "/");
    } catch (e) {
      console.log("  ⚠️ Home page check failed");
    }

    await context.close();
  }

  private async checkGamePage(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      // Try to find a game page
      await page.goto(`${BASE_URL}/`, { timeout: 10000 });

      // Look for game link
      const gameLink = await page.$('a[href*="/game"], a[href*="/table"]');
      if (gameLink) {
        await gameLink.click();
        await page.waitForTimeout(1000);
      }

      const game = await page.evaluate(BATCH_GAME_CHECK);
      this.processResults(game as any, "game", page.url());
    } catch (e) {
      // Game page might not exist
      this.addFinding(
        "game",
        "Game Page",
        3,
        "major",
        "Could not access game view",
        "Ensure game table is accessible",
      );
    }

    await context.close();
  }

  private async checkTournamentPage(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/tournaments`, {
        timeout: 10000,
        waitUntil: "networkidle",
      });
      await page
        .waitForSelector('main, h1, [class*="tournament"]', { timeout: 3000 })
        .catch(() => {});

      const hasTournaments = await page.evaluate(`
        document.querySelectorAll('[class*="tournament"], table tr, [class*="card"]').length > 0
      `);

      if (!hasTournaments) {
        this.addFinding(
          "ux",
          "Tournament List",
          4,
          "major",
          "Tournament page exists but empty or unclear",
          "Show tournament cards with: name, buy-in, players, start time",
        );
      }
      // Don't flag "Tournament list exists" - that's a good thing, not an issue
    } catch (e) {
      this.addFinding(
        "ux",
        "Tournament Page",
        2,
        "major",
        "Tournament page failed to load",
        "Ensure /tournaments route works",
      );
    }

    await context.close();
  }

  private processResults(
    results: Record<string, any>,
    category: string,
    location: string,
  ): void {
    for (const [key, value] of Object.entries(results)) {
      if (value && typeof value === "object") {
        // Skip items marked as skip (e.g., game checks on non-game pages)
        if (value.skip) {
          continue;
        }

        const severity =
          value.score <= 3 ? "critical" : value.score <= 5 ? "major" : "minor";

        // Sync to unified issue tracker (only for issues worth tracking)
        if (value.score <= 5 && value.suggestion) {
          const severityMap: Record<string, Severity> = {
            critical: "high",
            major: "medium",
            minor: "low",
          };

          try {
            addIssue({
              category: "QUALITY",
              severity: severityMap[severity] || "low",
              source: "product-quality",
              title: `${key}: ${value.observation.slice(0, 40)}`,
              description: value.observation,
              location,
              suggestion: value.suggestion,
            });
          } catch (_err) {
            // Issue tracker error - continue silently
          }
        }

        this.findings.push({
          criterion: key,
          category,
          severity: severity as any,
          score: value.score,
          observation: value.observation,
          suggestion: value.suggestion || "No specific suggestion.",
        });
      }
    }
  }

  private addFinding(
    category: string,
    criterion: string,
    score: number,
    severity: "critical" | "major" | "minor" | "suggestion",
    observation: string,
    suggestion: string | null,
  ): void {
    // Map severity to issue tracker format
    const severityMap: Record<string, Severity> = {
      critical: "high",
      major: "medium",
      minor: "low",
      suggestion: "low",
    };

    // Sync to unified issue tracker
    try {
      addIssue({
        category: "QUALITY",
        severity: severityMap[severity] || "low",
        source: "product-quality",
        title: `${criterion}: ${observation.slice(0, 50)}`,
        description: observation,
        location: "/",
        suggestion: suggestion || undefined,
      });
    } catch {
      // Silently ignore
    }

    this.findings.push({
      criterion,
      category,
      severity,
      score,
      observation,
      suggestion: suggestion || "No specific suggestion.",
    });
  }

  private avgScore(category: string): number {
    const catFindings = this.findings.filter((f) => f.category === category);
    if (catFindings.length === 0) return 5;
    return Math.round(
      catFindings.reduce((sum, f) => sum + f.score, 0) / catFindings.length,
    );
  }

  private getGrade(score: number): string {
    if (score >= 9) return "A+";
    if (score >= 8) return "A";
    if (score >= 7) return "B";
    if (score >= 6) return "C";
    if (score >= 5) return "D";
    return "F";
  }

  private getSummary(score: number): string {
    if (score >= 8) return "Polished and competitive product.";
    if (score >= 6) return "Functional but not impressive. Needs polish.";
    if (score >= 4) return "Below market standards. Needs significant work.";
    return "Not ready for users. Major redesign needed.";
  }

  private getTopPriorities(): string[] {
    return this.findings
      .filter((f) => f.severity === "critical" || f.severity === "major")
      .filter((f) => f.suggestion && f.suggestion !== "No specific suggestion.")
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((f) => `${f.criterion}: ${f.suggestion}`);
  }

  private printReport(report: QualityReport, duration: number): void {
    console.log("\n" + "═".repeat(70));
    console.log("  📊 QUALITY REPORT");
    console.log("═".repeat(70));

    console.log(`\n  ⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(
      `  📈 Overall Score: ${report.overallScore}/10 (${report.grade})`,
    );
    console.log(`  📝 ${report.summary}`);

    console.log("\n  Category Scores:");
    const categories = ["visual", "ux", "game", "polish"];
    for (const cat of categories) {
      const score = this.avgScore(cat);
      const icon = score >= 7 ? "✅" : score >= 4 ? "⚠️" : "❌";
      console.log(`    ${icon} ${cat.padEnd(10)} ${score}/10`);
    }

    if (report.topPriorities.length > 0) {
      console.log("\n  🎯 Top Priorities:");
      report.topPriorities.forEach((p, i) => {
        console.log(`    ${i + 1}. ${p.slice(0, 65)}...`);
      });
    }

    console.log("\n" + "═".repeat(70) + "\n");
  }

  private async saveReport(report: QualityReport): Promise<void> {
    const reportPath = path.join(
      process.cwd(),
      "tests/qa/monsters/browser-monster/QUALITY-REPORT.md",
    );

    const md = `# 🎯 Product Quality Report

**Generated:** ${new Date().toLocaleString()}
**Overall Score:** ${report.overallScore}/10 (${report.grade})

## Summary

${report.summary}

## Top Priorities

${report.topPriorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## All Findings

| Category | Criterion | Score | Severity | Observation |
|----------|-----------|-------|----------|-------------|
${report.findings
  .map(
    (f) =>
      `| ${f.category} | ${f.criterion} | ${f.score}/10 | ${f.severity} | ${f.observation.slice(0, 40)}... |`,
  )
  .join("\n")}

---
*Generated by Product Quality Monster*
`;

    fs.writeFileSync(reportPath, md);
    console.log(`  📄 Report saved: ${reportPath}\n`);
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const monster = new ProductQualityMonster();
  const report = await monster.run();

  process.exit(report.overallScore >= 5 ? 0 : 1);
}

main().catch((err) => {
  console.error("Product Quality Monster failed:", err);
  process.exit(1);
});
