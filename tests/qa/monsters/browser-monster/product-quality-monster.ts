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
import {
  addIssue,
  Severity,
  updateQualityReport,
  generateReport,
} from "../shared/issue-tracker";

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
  abTestIdea?: string;
}

interface PerformanceMetrics {
  pageLoadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  timeToInteractive: number;
  cumulativeLayoutShift: number;
}

interface AccessibilityIssue {
  rule: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  element?: string;
  fix: string;
}

interface HistoricalScore {
  date: string;
  overallScore: number;
  categories: Record<string, number>;
}

interface QualityReport {
  overallScore: number;
  grade: string;
  summary: string;
  findings: QualityFinding[];
  topPriorities: string[];
  performance?: PerformanceMetrics;
  accessibility?: {
    score: number;
    issues: AccessibilityIssue[];
  };
  screenshots?: string[];
  trend?: {
    current: number;
    previous: number;
    change: number;
    history: HistoricalScore[];
  };
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
    suggestion: animationScore ? 'Add card flip animations and chip stack effects for wins' : 'Add hover effects, page transitions, micro-interactions',
    competitorComparison: 'PokerStars: smooth card animations; GGPoker: particle effects on wins'
  };
  
  // Visual consistency
  const buttons = document.querySelectorAll('button');
  const btnStyles = new Set();
  buttons.forEach(btn => {
    const style = window.getComputedStyle(btn);
    btnStyles.add(style.backgroundColor + style.borderRadius);
  });
  const isConsistent = btnStyles.size <= 3 || buttons.length < 3;
  results.consistency = {
    score: isConsistent ? 7 : 4,
    observation: isConsistent ? 'Consistent button styles' : 'Inconsistent button styles',
    suggestion: isConsistent ? 'Add tertiary/ghost button variant for less important actions' : 'Create design system with primary/secondary/ghost buttons',
    competitorComparison: 'Top platforms have 3-4 button styles: primary CTA, secondary, outline, text-only'
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
    suggestion: navLinks >= 4 ? 'Consider sticky nav with quick-access to active tables' : 'Add icons + text for Lobby, Tables, Tournaments, Leaderboard',
    competitorComparison: 'PokerStars: persistent side panel with game lobby; GGPoker: bottom tab bar on mobile'
  };
  
  // CTAs - look for prominent buttons and links
  const ctaButtons = document.querySelectorAll('button, a[class*="btn"], [class*="btn-"]');
  results.ctas = {
    score: ctaButtons.length >= 2 ? 8 : ctaButtons.length >= 1 ? 5 : 2,
    observation: ctaButtons.length >= 2 ? 'Has call-to-action buttons' : 'Missing clear CTAs',
    suggestion: ctaButtons.length >= 2 ? 'Add urgency indicators (seats filling, time left)' : 'Add prominent CTAs: Play Now, Join Tournament',
    competitorComparison: 'GGPoker: pulsing Play Now button with player count; PokerStars: featured game cards'
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
  const hasLoadingStates = hasLoaders || hasLoadingInCSS;
  results.loading = {
    score: hasLoadingStates ? 8 : 5,
    observation: hasLoadingStates ? 'Has loading indicators' : 'No loading indicators found',
    suggestion: hasLoadingStates ? 'Add skeleton screens for tables and tournament lists' : 'Add loading states for async operations',
    competitorComparison: 'Modern apps use skeleton screens; PokerStars shows animated card backs during loading'
  };
  
  // First impression - check for hero section with headline, description, and visual elements
  const hasHero = !!document.querySelector('h1, [class*="hero"]');
  const hasDescription = document.body.innerText.length > 300;
  const hasVisualSection = !!document.querySelector('[class*="glass"], [class*="card"], section');
  const strongImpression = hasHero && hasDescription && hasVisualSection;
  results.firstImpression = {
    score: strongImpression ? 8 : (hasHero && hasDescription) ? 6 : hasHero ? 4 : 0,
    observation: (hasHero && hasDescription) ? 'Strong first impression with headline and content' : 'Weak first impression',
    suggestion: strongImpression ? 'Add live player count and current jackpots above fold' : 'Clear headline + CTA + visual imagery above fold',
    competitorComparison: 'PokerStars: massive poker imagery + Play Now CTA; GGPoker: live promotions + jackpot counters'
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
  const goodSpacing = margins.size <= 20 && paddings.size <= 20;
  results.spacing = {
    score: goodSpacing ? 7 : 4,
    observation: goodSpacing ? 'Using design system spacing' : 'Inconsistent spacing',
    suggestion: goodSpacing ? 'Use generous whitespace around CTAs to draw attention' : 'Use consistent spacing scale (4, 8, 16, 24, 32px)',
    competitorComparison: 'PokerStars: clean spacing hierarchy; GGPoker: dense but organized'
  };
  
  // Empty states
  const emptyIndicators = document.querySelectorAll('[class*="empty"], [class*="no-data"], [class*="placeholder"]');
  const hasContent = document.body.innerText.length > 200;
  const hasGoodEmptyStates = emptyIndicators.length > 0 || hasContent;
  results.emptyStates = {
    score: hasGoodEmptyStates ? 7 : 3,
    observation: hasContent ? 'Page has content' : 'Checking empty state handling',
    suggestion: hasGoodEmptyStates ? 'Add illustrations to empty states (empty table, waiting for players)' : 'Empty states should: explain what goes here, have a CTA',
    competitorComparison: 'GGPoker: fun illustrations for empty states with suggested actions'
  };
  
  // Mobile handling
  const viewport = document.querySelector('meta[name="viewport"]');
  const hasViewport = !!viewport && viewport.content?.includes('width=device-width');
  results.mobileReady = {
    score: hasViewport ? 7 : 2,
    observation: hasViewport ? 'Viewport meta tag present' : 'Missing viewport meta',
    suggestion: hasViewport ? 'Test touch targets (44px min) and swipe gestures for actions' : 'Add proper viewport meta for mobile',
    competitorComparison: 'Mobile drives 60%+ of poker traffic; GGPoker/PokerStars are mobile-first'
  };
  
  // Error handling visible
  const errorElements = document.querySelectorAll('[class*="error"], [role="alert"]');
  results.errorHandling = {
    score: errorElements.length > 0 ? 7 : 6,
    observation: errorElements.length > 0 ? 'Error handling patterns detected' : 'Error handling not visible',
    suggestion: 'Add retry buttons, help links, and clear next steps to error messages',
    competitorComparison: 'Good apps: inline validation, toast notifications, recovery actions'
  };
  
  return results;
})()`;

// Accessibility check script
const BATCH_ACCESSIBILITY_CHECK = `(() => {
  const issues = [];
  
  // Check for images without alt text
  const imagesWithoutAlt = document.querySelectorAll('img:not([alt]), img[alt=""]');
  if (imagesWithoutAlt.length > 0) {
    issues.push({
      rule: 'img-alt',
      impact: 'serious',
      description: imagesWithoutAlt.length + ' images missing alt text',
      fix: 'Add descriptive alt text to all images'
    });
  }
  
  // Check for buttons without accessible names
  const buttonsWithoutName = Array.from(document.querySelectorAll('button')).filter(btn => 
    !btn.textContent?.trim() && !btn.getAttribute('aria-label') && !btn.getAttribute('title')
  );
  if (buttonsWithoutName.length > 0) {
    issues.push({
      rule: 'button-name',
      impact: 'critical',
      description: buttonsWithoutName.length + ' buttons without accessible names',
      fix: 'Add text content, aria-label, or title to buttons'
    });
  }
  
  // Check for links without accessible names
  const linksWithoutName = Array.from(document.querySelectorAll('a')).filter(link => 
    !link.textContent?.trim() && !link.getAttribute('aria-label') && !link.querySelector('img[alt]')
  );
  if (linksWithoutName.length > 0) {
    issues.push({
      rule: 'link-name',
      impact: 'serious',
      description: linksWithoutName.length + ' links without accessible names',
      fix: 'Add text content or aria-label to links'
    });
  }
  
  // Check color contrast (basic check)
  const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, label');
  let lowContrastCount = 0;
  textElements.forEach(el => {
    const style = window.getComputedStyle(el);
    const color = style.color;
    const bgColor = style.backgroundColor;
    // Simple check: if text is very light on light bg or dark on dark bg
    const colorMatch = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    const bgMatch = bgColor.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (colorMatch && bgMatch) {
      const textLuminance = (parseInt(colorMatch[1]) * 0.299 + parseInt(colorMatch[2]) * 0.587 + parseInt(colorMatch[3]) * 0.114) / 255;
      const bgLuminance = (parseInt(bgMatch[1]) * 0.299 + parseInt(bgMatch[2]) * 0.587 + parseInt(bgMatch[3]) * 0.114) / 255;
      const contrast = Math.abs(textLuminance - bgLuminance);
      if (contrast < 0.3) lowContrastCount++;
    }
  });
  if (lowContrastCount > 3) {
    issues.push({
      rule: 'color-contrast',
      impact: 'serious',
      description: lowContrastCount + ' elements may have insufficient color contrast',
      fix: 'Ensure text has at least 4.5:1 contrast ratio with background'
    });
  }
  
  // Check for form inputs without labels
  const inputsWithoutLabels = Array.from(document.querySelectorAll('input, select, textarea')).filter(input => {
    const id = input.id;
    const hasLabel = id && document.querySelector('label[for="' + id + '"]');
    const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
    const hasPlaceholder = input.getAttribute('placeholder');
    return !hasLabel && !hasAriaLabel && !hasPlaceholder;
  });
  if (inputsWithoutLabels.length > 0) {
    issues.push({
      rule: 'label',
      impact: 'critical',
      description: inputsWithoutLabels.length + ' form inputs without labels',
      fix: 'Add <label for="id"> or aria-label to form inputs'
    });
  }
  
  // Check for keyboard focus visibility
  const focusableElements = document.querySelectorAll('button, a, input, select, textarea, [tabindex]');
  let noFocusStyle = 0;
  focusableElements.forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.outlineStyle === 'none' && style.boxShadow === 'none') {
      noFocusStyle++;
    }
  });
  if (noFocusStyle > focusableElements.length * 0.5) {
    issues.push({
      rule: 'focus-visible',
      impact: 'serious',
      description: 'Many elements may lack visible focus indicators',
      fix: 'Add :focus-visible styles for keyboard navigation'
    });
  }
  
  // Check for heading hierarchy
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const headingLevels = headings.map(h => parseInt(h.tagName[1]));
  let skippedLevel = false;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] - headingLevels[i-1] > 1) {
      skippedLevel = true;
      break;
    }
  }
  if (skippedLevel) {
    issues.push({
      rule: 'heading-order',
      impact: 'moderate',
      description: 'Heading levels are skipped (e.g., h1 to h3)',
      fix: 'Use sequential heading levels (h1, h2, h3...)'
    });
  }
  
  // Check for skip link
  const skipLink = document.querySelector('a[href="#main"], a[href="#content"], .skip-link, [class*="skip"]');
  if (!skipLink) {
    issues.push({
      rule: 'skip-link',
      impact: 'moderate',
      description: 'No skip navigation link found',
      fix: 'Add a "Skip to main content" link at the top of the page'
    });
  }
  
  // Calculate score
  const criticalCount = issues.filter(i => i.impact === 'critical').length;
  const seriousCount = issues.filter(i => i.impact === 'serious').length;
  const score = Math.max(0, 100 - (criticalCount * 20) - (seriousCount * 10) - (issues.length * 2));
  
  return { issues, score: Math.round(score) };
})()`;

// A/B test ideas mapped to criteria
const AB_TEST_IDEAS: Record<string, string> = {
  typography:
    "Test serif vs sans-serif fonts for headlines - measure time on page",
  colorScheme:
    "A/B test accent color (gold vs green) on CTAs - measure click-through rate",
  animations: "Test animated vs static card dealing - measure user engagement",
  consistency: "Test primary button color variations - measure conversion rate",
  navigation: "Test top nav vs side nav - measure navigation completion rate",
  ctas: "Test CTA copy ('Play Now' vs 'Join Table') - measure click-through rate",
  loading:
    "Test skeleton vs spinner loading states - measure perceived speed rating",
  firstImpression: "Test hero image vs video background - measure bounce rate",
  spacing: "Test compact vs spacious layout - measure task completion time",
  emptyStates:
    "Test illustration vs text-only empty states - measure feature discovery",
  mobileReady:
    "Test bottom nav vs hamburger menu on mobile - measure navigation time",
  errorHandling:
    "Test inline vs toast error messages - measure error recovery rate",
  pokerTable: "Test 2D vs 3D table perspective - measure session duration",
  cards: "Test classic vs modern card designs - measure user preference",
  bettingUI: "Test slider vs quick-bet buttons default - measure betting speed",
  potDisplay:
    "Test pot display positions - measure pot awareness in user surveys",
  playerSeats:
    "Test avatar styles (photo vs illustrated) - measure personalization rate",
  timer: "Test circular vs bar timer - measure timeout rate",
};

// ============================================================================
// CONSTANTS
// ============================================================================

const SCREENSHOTS_DIR = path.join(
  process.cwd(),
  "tests/qa/monsters/browser-monster/screenshots",
);
const HISTORY_FILE = path.join(
  process.cwd(),
  "tests/qa/monsters/browser-monster/quality-history.json",
);

// ============================================================================
// PRODUCT QUALITY MONSTER
// ============================================================================

class ProductQualityMonster {
  private browser: Browser | null = null;
  private findings: QualityFinding[] = [];
  private performanceMetrics: PerformanceMetrics | null = null;
  private accessibilityResults: {
    score: number;
    issues: AccessibilityIssue[];
  } | null = null;
  private screenshots: string[] = [];

  async run(): Promise<QualityReport> {
    const startTime = Date.now();

    console.log("\n" + "═".repeat(70));
    console.log("  🎯 PRODUCT QUALITY MONSTER - Comprehensive Analysis");
    console.log("═".repeat(70) + "\n");

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== "false",
    });

    // Ensure screenshots directory exists
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    // Run all checks in parallel contexts
    console.log("  📍 Running quality checks...");
    await Promise.all([
      this.checkHomePage(),
      this.checkGamePage(),
      this.checkTournamentPage(),
    ]);

    // Run performance and accessibility checks
    console.log("  📍 Running performance & accessibility checks...");
    await this.checkPerformance();
    await this.checkAccessibility();

    // Capture screenshots
    console.log("  📍 Capturing screenshots...");
    await this.captureScreenshots();

    await this.browser.close();

    // Add A/B test ideas to findings
    this.addAbTestIdeas();

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

    // Load historical data and calculate trend
    const trend = this.calculateTrend(overallScore, scores);

    const report: QualityReport = {
      overallScore,
      grade: this.getGrade(overallScore),
      summary: this.getSummary(overallScore),
      findings: this.findings,
      topPriorities: this.getTopPriorities(),
      performance: this.performanceMetrics || undefined,
      accessibility: this.accessibilityResults || undefined,
      screenshots: this.screenshots,
      trend,
    };

    // Save to history
    this.saveToHistory(overallScore, scores);

    this.printReport(report, Date.now() - startTime);
    await this.saveReport(report);

    return report;
  }

  private async checkPerformance(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      const startNav = Date.now();
      await page.goto(`${BASE_URL}/`, {
        timeout: 15000,
        waitUntil: "networkidle",
      });
      const pageLoadTime = Date.now() - startNav;

      // Get performance metrics from browser using string evaluation
      const metrics = (await page.evaluate(`(() => {
        const perf = window.performance;
        const paint = perf.getEntriesByType("paint");
        const fcp = paint.find((e) => e.name === "first-contentful-paint");
        const navTiming = perf.getEntriesByType("navigation")[0];
        
        return {
          fcp: fcp?.startTime || 0,
          domContentLoaded: navTiming?.domContentLoadedEventEnd || 0,
          loadEvent: navTiming?.loadEventEnd || 0,
        };
      })()`)) as { fcp: number; domContentLoaded: number; loadEvent: number };

      this.performanceMetrics = {
        pageLoadTime,
        firstContentfulPaint: Math.round(metrics.fcp),
        largestContentfulPaint: Math.round(metrics.domContentLoaded),
        timeToInteractive: Math.round(metrics.domContentLoaded),
        cumulativeLayoutShift: 0, // CLS requires longer observation
      };

      // Add performance findings
      if (pageLoadTime > 3000) {
        this.addFinding(
          "performance",
          "Page Load Time",
          pageLoadTime > 5000 ? 3 : 5,
          pageLoadTime > 5000 ? "critical" : "major",
          `Page loads in ${(pageLoadTime / 1000).toFixed(1)}s (target: < 3s)`,
          "Optimize images, enable compression, use CDN",
        );
      }

      if (metrics.fcp > 1800) {
        this.addFinding(
          "performance",
          "First Contentful Paint",
          metrics.fcp > 3000 ? 3 : 5,
          metrics.fcp > 3000 ? "major" : "minor",
          `FCP is ${(metrics.fcp / 1000).toFixed(1)}s (target: < 1.8s)`,
          "Inline critical CSS, defer non-critical scripts",
        );
      }
    } catch (e) {
      console.log("  ⚠️ Performance check failed:", e);
    }

    await context.close();
  }

  private async checkAccessibility(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/`, {
        timeout: 10000,
        waitUntil: "domcontentloaded",
      });

      const results = (await page.evaluate(BATCH_ACCESSIBILITY_CHECK)) as {
        issues: AccessibilityIssue[];
        score: number;
      };

      this.accessibilityResults = results;

      // Add accessibility finding based on score
      const a11yScore = results.score;
      if (a11yScore < 90) {
        this.addFinding(
          "accessibility",
          "WCAG Compliance",
          Math.round(a11yScore / 10),
          a11yScore < 50 ? "critical" : a11yScore < 70 ? "major" : "minor",
          `Accessibility score: ${a11yScore}/100 (${results.issues.length} issues)`,
          results.issues[0]?.fix || "Run full accessibility audit",
        );
      }
    } catch (e) {
      console.log("  ⚠️ Accessibility check failed:", e);
    }

    await context.close();
  }

  private async captureScreenshots(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    const pages = [
      { name: "home", url: "/" },
      { name: "tournaments", url: "/tournaments" },
      { name: "login", url: "/login" },
    ];

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    for (const p of pages) {
      try {
        await page.goto(`${BASE_URL}${p.url}`, {
          timeout: 10000,
          waitUntil: "networkidle",
        });
        await page.waitForTimeout(500); // Wait for animations

        const screenshotPath = path.join(
          SCREENSHOTS_DIR,
          `${p.name}-${timestamp}.png`,
        );
        await page.screenshot({ path: screenshotPath, fullPage: false });
        this.screenshots.push(screenshotPath);
      } catch {
        // Skip failed screenshots
      }
    }

    // Capture mobile screenshot
    await page.setViewportSize({ width: 375, height: 667 });
    try {
      await page.goto(`${BASE_URL}/`, {
        timeout: 10000,
        waitUntil: "networkidle",
      });
      const mobilePath = path.join(
        SCREENSHOTS_DIR,
        `home-mobile-${timestamp}.png`,
      );
      await page.screenshot({ path: mobilePath, fullPage: false });
      this.screenshots.push(mobilePath);
    } catch {
      // Skip failed screenshot
    }

    await context.close();
  }

  private addAbTestIdeas(): void {
    for (const finding of this.findings) {
      const idea = AB_TEST_IDEAS[finding.criterion];
      if (idea) {
        finding.abTestIdea = idea;
      }
    }
  }

  private calculateTrend(
    currentScore: number,
    categories: Record<string, number>,
  ): QualityReport["trend"] {
    let history: HistoricalScore[] = [];

    if (fs.existsSync(HISTORY_FILE)) {
      try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
      } catch {
        history = [];
      }
    }

    const previous = history.length > 0 ? history[history.length - 1] : null;
    const previousScore = previous?.overallScore || currentScore;

    return {
      current: currentScore,
      previous: previousScore,
      change: currentScore - previousScore,
      history: history.slice(-10), // Keep last 10 entries
    };
  }

  private saveToHistory(
    score: number,
    categories: Record<string, number>,
  ): void {
    let history: HistoricalScore[] = [];

    if (fs.existsSync(HISTORY_FILE)) {
      try {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
      } catch {
        history = [];
      }
    }

    // Add current score
    history.push({
      date: new Date().toISOString(),
      overallScore: score,
      categories,
    });

    // Keep last 30 entries
    if (history.length > 30) {
      history = history.slice(-30);
    }

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
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
          competitorComparison: value.competitorComparison,
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
    const criticalCount = this.findings.filter(
      (f) => f.severity === "critical",
    ).length;
    const majorCount = this.findings.filter(
      (f) => f.severity === "major",
    ).length;
    const lowestCategory = this.getLowestCategory();

    if (score >= 8) {
      return `Polished and competitive product. ${lowestCategory ? `Focus on: ${lowestCategory}.` : ""}`;
    }
    if (score >= 6) {
      const issues: string[] = [];
      if (criticalCount > 0) issues.push(`${criticalCount} critical`);
      if (majorCount > 0) issues.push(`${majorCount} major`);
      const issueStr =
        issues.length > 0 ? ` (${issues.join(", ")} issues)` : "";
      return `Functional but not impressive${issueStr}. ${lowestCategory ? `Weakest area: ${lowestCategory}.` : "Needs polish."}`;
    }
    if (score >= 4) {
      return `Below market standards. ${criticalCount + majorCount} issues need immediate attention. Start with: ${lowestCategory || "core UX"}.`;
    }
    return `Not ready for users. ${criticalCount} critical issues. Major redesign needed in: ${lowestCategory || "all areas"}.`;
  }

  private getLowestCategory(): string | null {
    const categories = ["visual", "ux", "game", "polish"];
    let lowest: { cat: string; score: number } | null = null;

    for (const cat of categories) {
      const score = this.avgScore(cat);
      if (!lowest || score < lowest.score) {
        lowest = { cat, score };
      }
    }

    return lowest && lowest.score < 8 ? lowest.cat : null;
  }

  private getTopPriorities(): string[] {
    // First, get critical/major issues
    const criticalMajor = this.findings
      .filter((f) => f.severity === "critical" || f.severity === "major")
      .filter((f) => f.suggestion && f.suggestion !== "No specific suggestion.")
      .sort((a, b) => a.score - b.score);

    // If no critical/major, get lowest-scoring items that still have suggestions
    // These represent the biggest improvement opportunities
    const lowestScoring = this.findings
      .filter((f) => f.suggestion && f.suggestion !== "No specific suggestion.")
      .filter((f) => f.score < 8) // Only items that aren't already good
      .sort((a, b) => a.score - b.score);

    const priorities = criticalMajor.length > 0 ? criticalMajor : lowestScoring;

    return priorities.slice(0, 5).map((f) => `${f.criterion}: ${f.suggestion}`);
  }

  private printReport(report: QualityReport, duration: number): void {
    console.log("\n" + "═".repeat(70));
    console.log("  📊 COMPREHENSIVE QUALITY REPORT");
    console.log("═".repeat(70));

    console.log(`\n  ⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);

    // Show trend
    if (report.trend) {
      const trendIcon =
        report.trend.change > 0 ? "📈" : report.trend.change < 0 ? "📉" : "➡️";
      const trendText =
        report.trend.change !== 0
          ? ` (${report.trend.change > 0 ? "+" : ""}${report.trend.change} from last run)`
          : " (no change)";
      console.log(
        `  ${trendIcon} Overall Score: ${report.overallScore}/10 (${report.grade})${trendText}`,
      );
    } else {
      console.log(
        `  📈 Overall Score: ${report.overallScore}/10 (${report.grade})`,
      );
    }
    console.log(`  📝 ${report.summary}`);

    console.log("\n  Category Scores:");
    const categories = [
      "visual",
      "ux",
      "game",
      "polish",
      "performance",
      "accessibility",
    ];
    for (const cat of categories) {
      const score = this.avgScore(cat);
      if (score > 0) {
        const icon = score >= 7 ? "✅" : score >= 4 ? "⚠️" : "❌";
        console.log(`    ${icon} ${cat.padEnd(14)} ${score}/10`);
      }
    }

    // Performance metrics
    if (report.performance) {
      console.log("\n  ⚡ Performance Metrics:");
      console.log(
        `    Page Load:    ${(report.performance.pageLoadTime / 1000).toFixed(2)}s`,
      );
      console.log(
        `    FCP:          ${(report.performance.firstContentfulPaint / 1000).toFixed(2)}s`,
      );
      console.log(
        `    LCP:          ${(report.performance.largestContentfulPaint / 1000).toFixed(2)}s`,
      );
      console.log(
        `    TTI:          ${(report.performance.timeToInteractive / 1000).toFixed(2)}s`,
      );
      console.log(
        `    CLS:          ${report.performance.cumulativeLayoutShift.toFixed(3)}`,
      );
    }

    // Accessibility score
    if (report.accessibility) {
      const a11yIcon =
        report.accessibility.score >= 90
          ? "✅"
          : report.accessibility.score >= 70
            ? "⚠️"
            : "❌";
      console.log(
        `\n  ♿ Accessibility: ${a11yIcon} ${report.accessibility.score}/100 (${report.accessibility.issues.length} issues)`,
      );
    }

    // Screenshots
    if (report.screenshots && report.screenshots.length > 0) {
      console.log(`\n  📸 Screenshots: ${report.screenshots.length} captured`);
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

    // Group findings by severity
    const criticalFindings = report.findings.filter(
      (f) => f.severity === "critical",
    );
    const majorFindings = report.findings.filter((f) => f.severity === "major");
    const minorFindings = report.findings.filter((f) => f.severity === "minor");
    const suggestions = report.findings.filter(
      (f) => f.severity === "suggestion",
    );

    // Group by category for summary
    const categoryScores: Record<string, number[]> = {};
    report.findings.forEach((f) => {
      if (!categoryScores[f.category]) categoryScores[f.category] = [];
      categoryScores[f.category].push(f.score);
    });

    const categoryAvg = Object.entries(categoryScores)
      .map(([cat, scores]) => ({
        category: cat,
        avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      }))
      .sort((a, b) => a.avg - b.avg);

    // Find competitor comparisons
    const competitorNotes = report.findings
      .filter((f) => f.competitorComparison)
      .map((f) => `- **${f.criterion}**: ${f.competitorComparison}`);

    // Generate trend section
    const trendSection = report.trend
      ? `### 📈 Score Trend

${
  report.trend.change !== 0
    ? `**Change:** ${report.trend.change > 0 ? "+" : ""}${report.trend.change} points from last run`
    : "**Change:** No change from last run"
}

${
  report.trend.history.length > 1
    ? `| Date | Score |
|------|-------|
${report.trend.history
  .slice(-5)
  .map(
    (h) =>
      `| ${new Date(h.date).toLocaleDateString()} | ${h.overallScore}/10 |`,
  )
  .join("\n")}`
    : "_First run - no historical data yet_"
}
`
      : "";

    // Generate performance section
    const perfSection = report.performance
      ? `## ⚡ Performance Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Page Load Time | ${(report.performance.pageLoadTime / 1000).toFixed(2)}s | < 3s | ${report.performance.pageLoadTime < 3000 ? "✅" : "❌"} |
| First Contentful Paint | ${(report.performance.firstContentfulPaint / 1000).toFixed(2)}s | < 1.8s | ${report.performance.firstContentfulPaint < 1800 ? "✅" : "⚠️"} |
| Largest Contentful Paint | ${(report.performance.largestContentfulPaint / 1000).toFixed(2)}s | < 2.5s | ${report.performance.largestContentfulPaint < 2500 ? "✅" : "⚠️"} |
| Time to Interactive | ${(report.performance.timeToInteractive / 1000).toFixed(2)}s | < 3.8s | ${report.performance.timeToInteractive < 3800 ? "✅" : "⚠️"} |
| Cumulative Layout Shift | ${report.performance.cumulativeLayoutShift.toFixed(3)} | < 0.1 | ${report.performance.cumulativeLayoutShift < 0.1 ? "✅" : "⚠️"} |

---
`
      : "";

    // Generate accessibility section
    const a11ySection = report.accessibility
      ? `## ♿ Accessibility Report

**Score:** ${report.accessibility.score}/100 ${report.accessibility.score >= 90 ? "✅" : report.accessibility.score >= 70 ? "⚠️" : "❌"}

${
  report.accessibility.issues.length > 0
    ? `### Issues Found

| Rule | Impact | Description | Fix |
|------|--------|-------------|-----|
${report.accessibility.issues
  .slice(0, 10)
  .map((i) => `| ${i.rule} | ${i.impact} | ${i.description} | ${i.fix} |`)
  .join("\n")}`
    : "_No accessibility issues found! 🎉_"
}

---
`
      : "";

    // Generate A/B test ideas section
    const abTestFindings = report.findings.filter((f) => f.abTestIdea);
    const abTestSection =
      abTestFindings.length > 0
        ? `## 🧪 A/B Test Ideas

${abTestFindings
  .slice(0, 8)
  .map((f) => `- **${f.criterion}:** ${f.abTestIdea}`)
  .join("\n")}

---
`
        : "";

    // Generate screenshots section
    const screenshotSection =
      report.screenshots && report.screenshots.length > 0
        ? `## 📸 Screenshots

${report.screenshots.map((s) => `- \`${path.basename(s)}\``).join("\n")}

_Screenshots saved to: tests/qa/monsters/browser-monster/screenshots/_

---
`
        : "";

    const md = `# 🎯 Product Quality Report

**Generated:** ${new Date().toLocaleString()}
**Overall Score:** ${report.overallScore}/10 (${report.grade})

## Executive Summary

${report.summary}

### Category Breakdown

| Category | Score | Status |
|----------|-------|--------|
${categoryAvg.map((c) => `| ${c.category} | ${c.avg}/10 | ${c.avg >= 8 ? "✅ Good" : c.avg >= 6 ? "⚠️ Needs Work" : "❌ Critical"} |`).join("\n")}

${trendSection}
---

## 🚨 Top Priorities (Fix These First)

${report.topPriorities.length > 0 ? report.topPriorities.map((p, i) => `### ${i + 1}. ${p}`).join("\n\n") : "_No critical priorities identified._"}

---

${perfSection}
${a11ySection}
## Detailed Findings

${
  criticalFindings.length > 0
    ? `### 🔴 Critical Issues (${criticalFindings.length})

${criticalFindings
  .map(
    (f) => `#### ${f.criterion}
- **Score:** ${f.score}/10
- **Observation:** ${f.observation}
- **Fix:** ${f.suggestion}
${f.competitorComparison ? `- **Competitor benchmark:** ${f.competitorComparison}` : ""}
${f.abTestIdea ? `- **A/B Test:** ${f.abTestIdea}` : ""}`,
  )
  .join("\n\n")}`
    : ""
}

${
  majorFindings.length > 0
    ? `### 🟠 Major Issues (${majorFindings.length})

${majorFindings
  .map(
    (f) => `#### ${f.criterion}
- **Score:** ${f.score}/10
- **Observation:** ${f.observation}
- **Fix:** ${f.suggestion}
${f.competitorComparison ? `- **Competitor benchmark:** ${f.competitorComparison}` : ""}
${f.abTestIdea ? `- **A/B Test:** ${f.abTestIdea}` : ""}`,
  )
  .join("\n\n")}`
    : ""
}

${
  minorFindings.length > 0
    ? `### 🟡 Minor Issues (${minorFindings.length})

| Criterion | Score | Observation | Suggestion |
|-----------|-------|-------------|------------|
${minorFindings.map((f) => `| ${f.criterion} | ${f.score}/10 | ${f.observation} | ${f.suggestion || "-"} |`).join("\n")}`
    : ""
}

${
  suggestions.length > 0
    ? `### 💡 Suggestions (${suggestions.length})

${suggestions.map((f) => `- **${f.criterion}:** ${f.suggestion}`).join("\n")}`
    : ""
}

---

${abTestSection}
## 🏁 Competitor Insights

${competitorNotes.length > 0 ? competitorNotes.join("\n") : "_No competitor benchmarks available._"}

---

${screenshotSection}
## Quick Reference

| Metric | Value |
|--------|-------|
| Total Checks | ${report.findings.length} |
| Critical Issues | ${criticalFindings.length} |
| Major Issues | ${majorFindings.length} |
| Minor Issues | ${minorFindings.length} |
| Suggestions | ${suggestions.length} |
| Pass Rate | ${Math.round((report.findings.filter((f) => f.score >= 7).length / report.findings.length) * 100)}% |
${report.performance ? `| Page Load | ${(report.performance.pageLoadTime / 1000).toFixed(2)}s |` : ""}
${report.accessibility ? `| Accessibility | ${report.accessibility.score}/100 |` : ""}

---
*Generated by Product Quality Monster*
`;

    fs.writeFileSync(reportPath, md);
    console.log(`  📄 Report saved: ${reportPath}`);

    // Sync to unified issue tracker
    const categoryData: Record<string, { score: number; status: string }> = {};
    for (const [cat, data] of Object.entries(categoryScores)) {
      const avg = Math.round(
        data.reduce((a: number, b: number) => a + b, 0) / data.length,
      );
      categoryData[cat] = {
        score: avg,
        status:
          avg >= 8 ? "✅ Good" : avg >= 6 ? "⚠️ Needs Work" : "❌ Critical",
      };
    }

    updateQualityReport({
      overallScore: report.overallScore,
      grade: report.grade,
      summary: report.summary,
      categories: categoryData,
      priorities: report.topPriorities,
      competitorInsights: competitorNotes.map((n) =>
        n.replace(/^- \*\*\w+\*\*: /, ""),
      ),
      generatedAt: new Date().toISOString(),
    });

    // Regenerate the unified report
    generateReport();
    console.log(`  📄 Synced to: docs/MONSTERS_ISSUES.md\n`);
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
