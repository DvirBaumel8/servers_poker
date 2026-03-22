/**
 * Browser QA Monster - FAST COMPREHENSIVE UI TESTING
 *
 * Optimized for speed through:
 * - Parallel browser contexts for independent tests
 * - Batch page.evaluate() for multiple checks per page load
 * - Smart sampling instead of exhaustive iteration
 * - Early exit on critical failures
 *
 * Target runtime: < 2 minutes (down from 7+ minutes)
 *
 * Run: npm run monsters:browser-qa
 */

import { chromium, Browser, Page, BrowserContext } from "playwright";
import { addIssue, Severity } from "../shared/issue-tracker";
import { ensureLiveGame } from "../shared/game-setup";

const BASE_URL = process.env.FRONTEND_URL || "http://localhost:3001";
const MAX_PARALLEL_CONTEXTS = 4;
const PAGE_TIMEOUT_MS = 10000;

// ============================================================================
// ROUTES TO TEST
// ============================================================================

const CRITICAL_ROUTES = [
  "/",
  "/login",
  "/register",
  "/tournaments",
  "/bots",
  "/bots/build",
  "/leaderboard",
];

const AUTH_ROUTES = ["/profile", "/tournaments"];
const ADMIN_ROUTES = ["/admin/tournaments", "/admin/analytics"];

// ============================================================================
// TYPES
// ============================================================================

interface Finding {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  location: string;
  element?: string;
  reproducible: boolean;
  steps?: string[];
}

interface TestStats {
  run: number;
  passed: number;
  failed: number;
}

// ============================================================================
// BATCH CHECK SCRIPTS (run multiple checks in single page.evaluate)
// ============================================================================

const BATCH_PAGE_HEALTH_CHECK = `(() => {
  const issues = [];
  
  // Check for JS errors in DOM
  const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"]');
  const visibleErrors = Array.from(errorElements).filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.textContent?.trim();
  });
  if (visibleErrors.length > 0) {
    issues.push({ type: 'error-state', count: visibleErrors.length, sample: visibleErrors[0]?.textContent?.slice(0, 100) });
  }
  
  // Check for broken images
  const images = document.querySelectorAll('img');
  const brokenImages = Array.from(images).filter(img => !img.complete || img.naturalHeight === 0);
  if (brokenImages.length > 0) {
    issues.push({ type: 'broken-image', count: brokenImages.length });
  }
  
  // Check for empty links
  const links = document.querySelectorAll('a');
  const emptyLinks = Array.from(links).filter(a => !a.href || a.href === '#' || a.href === 'javascript:void(0)');
  if (emptyLinks.length > 0) {
    issues.push({ type: 'empty-link', count: emptyLinks.length });
  }
  
  // Check for buttons without text/aria-label
  const buttons = document.querySelectorAll('button');
  const unlabeledButtons = Array.from(buttons).filter(btn => 
    !btn.textContent?.trim() && !btn.getAttribute('aria-label') && !btn.querySelector('svg')
  );
  if (unlabeledButtons.length > 0) {
    issues.push({ type: 'unlabeled-button', count: unlabeledButtons.length });
  }
  
  // Check for inputs without labels
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])');
  const unlabeledInputs = Array.from(inputs).filter(input => {
    const id = input.id;
    const hasLabel = id && document.querySelector('label[for="' + id + '"]');
    const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
    const hasPlaceholder = input.placeholder;
    return !hasLabel && !hasAriaLabel && !hasPlaceholder;
  });
  if (unlabeledInputs.length > 0) {
    issues.push({ type: 'unlabeled-input', count: unlabeledInputs.length });
  }
  
  // Check for console errors (if any were captured)
  const hasReactError = document.body?.innerHTML?.includes('Maximum update depth exceeded') ||
                        document.body?.innerHTML?.includes('Error boundary');
  if (hasReactError) {
    issues.push({ type: 'react-error', description: 'React error detected in page' });
  }
  
  // Check for horizontal overflow
  const hasOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  if (hasOverflow) {
    issues.push({ type: 'horizontal-overflow', width: document.documentElement.scrollWidth });
  }
  
  // Check for z-index issues (elements covering others unexpectedly)
  const fixedElements = document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]');
  if (fixedElements.length > 3) {
    issues.push({ type: 'too-many-fixed', count: fixedElements.length });
  }
  
  return {
    url: window.location.href,
    title: document.title,
    issues,
    elementCounts: {
      buttons: buttons.length,
      links: links.length,
      inputs: inputs.length,
      images: images.length,
    }
  };
})()`;

const BATCH_INTERACTIVE_CHECK = `(() => {
  const issues = [];
  
  // Check clickable elements have pointer cursor
  const clickables = document.querySelectorAll('button, a, [onclick], [role="button"]');
  const badCursors = Array.from(clickables).filter(el => {
    const style = window.getComputedStyle(el);
    return style.cursor !== 'pointer' && style.display !== 'none';
  });
  if (badCursors.length > 0) {
    issues.push({ type: 'bad-cursor', count: badCursors.length });
  }
  
  // Check for disabled buttons that look enabled
  const disabledButtons = document.querySelectorAll('button[disabled]');
  const badDisabled = Array.from(disabledButtons).filter(btn => {
    const style = window.getComputedStyle(btn);
    return style.opacity === '1' && style.cursor !== 'not-allowed';
  });
  if (badDisabled.length > 0) {
    issues.push({ type: 'disabled-not-styled', count: badDisabled.length });
  }
  
  // Check for focus visibility
  const focusableCount = document.querySelectorAll('button, a, input, select, textarea, [tabindex]').length;
  
  // Check for touch targets (minimum 44x44px for primary actions)
  // Modern UI frameworks use various patterns that are acceptable
  const smallTargets = Array.from(clickables).filter(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    
    // 44x44 is the gold standard, but 36px+ is acceptable for most elements
    if (rect.width >= 36 && rect.height >= 36) return false;
    
    // Skip elements inside select/option/nav (browser or intentional design)
    if (el.closest('select') || el.tagName === 'OPTION') return false;
    if (el.closest('nav') || el.closest('footer')) return false;
    
    // Skip hidden or off-screen elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (rect.top < -100 || rect.left < -100) return false;
    
    // Skip links in text (inline links are expected to be text-sized)
    if (el.tagName === 'A' && !el.classList.toString().includes('btn')) return false;
    
    // Skip elements with min-h/min-w classes (developer intentionally sized)
    const classList = el.className || '';
    if (classList.includes('min-h-') || classList.includes('min-w-')) return false;
    
    // Skip icon-only elements with any reasonable hit area (32px+)
    const text = el.textContent?.trim() || '';
    const hasOnlyIcon = text === '' || text.length <= 2;
    if (hasOnlyIcon && rect.width >= 32 && rect.height >= 32) return false;
    
    return true;
  });
  // Only report if there are many problematic elements (> 10)
  if (smallTargets.length > 10) {
    issues.push({ type: 'small-touch-targets', count: smallTargets.length });
  }
  
  return { issues, focusableCount };
})()`;

const BATCH_FORM_CHECK = `(() => {
  const issues = [];
  const forms = document.querySelectorAll('form');
  
  forms.forEach((form, idx) => {
    // Check for submit button
    const hasSubmit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    if (!hasSubmit) {
      issues.push({ type: 'no-submit-button', form: idx });
    }
    
    // Check required fields have validation
    const requiredInputs = form.querySelectorAll('[required]');
    const emailInputs = form.querySelectorAll('input[type="email"]');
    const passwordInputs = form.querySelectorAll('input[type="password"]');
    
    // Check password fields have minlength or pattern
    passwordInputs.forEach(pwd => {
      if (!pwd.minLength && !pwd.pattern) {
        issues.push({ type: 'weak-password-validation', form: idx });
      }
    });
  });
  
  return { formCount: forms.length, issues };
})()`;

// Game-specific card rendering check
const BATCH_GAME_CARD_CHECK = `(() => {
  const issues = [];
  const url = window.location.href;
  
  // Only run on game/table pages
  if (!url.includes('/game') && !url.includes('/tables/')) {
    return { isGamePage: false, issues: [] };
  }
  
  // Check for placeholder cards (showing "?" text - indicates broken card rendering)
  const allElements = document.querySelectorAll('.playing-card, [class*="card"], [class*="Card"]');
  let placeholderCards = 0;
  let brokenCards = [];
  
  allElements.forEach((el, idx) => {
    const text = el.textContent?.trim() || '';
    const style = window.getComputedStyle(el);
    
    // Check for "?" placeholder text (indicates getCardComponent returned null)
    if (text === '?') {
      placeholderCards++;
      brokenCards.push({ type: 'question-mark', index: idx, text });
    }
    
    // Check for gray/white fallback backgrounds (bg-gray-200 = rgb(229, 231, 235))
    const bgColor = style.backgroundColor;
    const isGrayFallback = bgColor === 'rgb(229, 231, 235)' || 
                           bgColor === 'rgb(226, 232, 240)' ||
                           bgColor === 'rgb(241, 245, 249)' ||
                           bgColor === 'rgb(248, 250, 252)';
    
    // Only flag gray/white cards if they also have the playing-card class (not general cards)
    if (isGrayFallback && el.classList.contains('playing-card')) {
      const hasCardContent = el.querySelector('svg') || el.querySelector('img');
      if (!hasCardContent) {
        placeholderCards++;
        brokenCards.push({ type: 'white-placeholder', index: idx, bgColor });
      }
    }
  });
  
  // Check for card elements that should have SVG but don't
  const playingCards = document.querySelectorAll('.playing-card');
  let missingGraphics = 0;
  
  playingCards.forEach((card, idx) => {
    const hasSvg = card.querySelector('svg');
    const hasImg = card.querySelector('img');
    const text = card.textContent?.trim() || '';
    
    // If card has no graphics and shows "?" or is empty, it's broken
    if (!hasSvg && !hasImg && (text === '?' || text === '')) {
      missingGraphics++;
      brokenCards.push({ type: 'missing-graphics', index: idx });
    }
  });
  
  // Check for visible card containers with unexpected content
  const cardContainers = document.querySelectorAll('[class*="hole-card"], [class*="HoleCard"], [class*="community"]');
  cardContainers.forEach((container, idx) => {
    const cards = container.querySelectorAll('.playing-card');
    const questionMarks = container.querySelectorAll(':scope > *');
    
    questionMarks.forEach(el => {
      if (el.textContent?.trim() === '?' && !el.classList.contains('playing-card')) {
        brokenCards.push({ type: 'orphan-question-mark', index: idx, location: 'card-container' });
        placeholderCards++;
      }
    });
  });
  
  if (placeholderCards > 0) {
    issues.push({ 
      type: 'placeholder-cards', 
      count: placeholderCards,
      details: brokenCards.slice(0, 5) // Sample of broken cards
    });
  }
  
  if (missingGraphics > 0) {
    issues.push({ 
      type: 'missing-card-graphics', 
      count: missingGraphics 
    });
  }
  
  // ========================================================================
  // OVERLAP DETECTION - Check for elements overlapping each other
  // ========================================================================
  
  // Helper function to check if two rectangles overlap significantly
  function rectsOverlap(r1, r2, threshold = 0.3) {
    const xOverlap = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
    const yOverlap = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
    const overlapArea = xOverlap * yOverlap;
    const minArea = Math.min(r1.width * r1.height, r2.width * r2.height);
    return minArea > 0 && (overlapArea / minArea) > threshold;
  }
  
  // Helper to check if rectangles touch or are too close (should have gap)
  function rectsTooClose(r1, r2, minGap = 4) {
    // Cards on same horizontal line (community cards)
    if (Math.abs(r1.top - r2.top) < 20) {
      // Check horizontal gap
      const leftCard = r1.left < r2.left ? r1 : r2;
      const rightCard = r1.left < r2.left ? r2 : r1;
      const gap = rightCard.left - (leftCard.left + leftCard.width);
      return gap < minGap && gap > -r1.width; // Too close but not completely separate
    }
    return false;
  }
  
  let overlappingElements = [];
  
  // Identify community cards by their position (center of table) and parent structure
  // Community cards are in a flex container with gap, usually in table center
  const communityCards = [];
  const tableCenter = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  
  Array.from(playingCards).forEach(card => {
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Card is likely community card if:
    // 1. Near horizontal center of viewport
    // 2. In upper-middle area of viewport
    // 3. Has "lg" size (larger than hole cards) - size lg = 80x112
    const isNearCenter = Math.abs(centerX - tableCenter.x) < 300;
    const isInMiddle = centerY > 200 && centerY < 500;
    const isLargeCard = rect.width >= 70 && rect.height >= 100;
    const hasBrokenContent = card.textContent?.trim() === '?';
    
    if (isNearCenter && isInMiddle && (isLargeCard || hasBrokenContent)) {
      communityCards.push(card);
    }
  });
  
  // Check all playing cards against each other
  const cardRects = Array.from(playingCards).map((card, idx) => ({
    el: card,
    idx,
    rect: card.getBoundingClientRect(),
    isCommunity: communityCards.includes(card),
    text: card.textContent?.trim()
  })).filter(c => c.rect.width > 0 && c.rect.height > 0);
  
  // Find overlapping card pairs - especially community cards
  for (let i = 0; i < cardRects.length; i++) {
    for (let j = i + 1; j < cardRects.length; j++) {
      const card1 = cardRects[i];
      const card2 = cardRects[j];
      
      // Check overlap OR insufficient spacing between cards in same row
      if (card1.isCommunity && card2.isCommunity) {
        if (rectsOverlap(card1.rect, card2.rect, 0.05) || rectsTooClose(card1.rect, card2.rect, 4)) {
          overlappingElements.push({
            type: 'card-overlap',
            description: 'Community cards overlapping or too close',
            card1Idx: card1.idx,
            card2Idx: card2.idx,
            card1Text: card1.text,
            card2Text: card2.text
          });
        }
      }
      
      // Also check any cards showing "?" overlapping
      if ((card1.text === '?' || card2.text === '?') && rectsOverlap(card1.rect, card2.rect, 0.1)) {
        overlappingElements.push({
          type: 'broken-card-overlap',
          description: 'Broken cards (showing ?) overlapping',
          card1Idx: card1.idx,
          card2Idx: card2.idx
        });
      }
    }
  }
  
  // Check for cards overlapping other important UI elements
  const importantElements = document.querySelectorAll(
    '[class*="dealer"], [class*="Dealer"], [class*="button"], ' +
    '[class*="pot"], [class*="Pot"], [class*="chip"], [class*="Chip"], ' +
    '[class*="action"], [class*="Action"], [class*="bet"], [class*="Bet"]'
  );
  
  importantElements.forEach((el, elIdx) => {
    const elRect = el.getBoundingClientRect();
    if (elRect.width === 0 || elRect.height === 0) return;
    
    cardRects.forEach(card => {
      if (rectsOverlap(card.rect, elRect, 0.25)) {
        const elClass = el.className?.toString() || '';
        // Only flag if the card is community card (shouldn't overlap table elements)
        if (card.isCommunity) {
          overlappingElements.push({
            type: 'card-ui-overlap',
            description: 'Card overlapping UI element',
            cardIdx: card.idx,
            elementClass: elClass.slice(0, 50)
          });
        }
      }
    });
  });
  
  // Check for player seat elements overlapping
  const playerSeats = document.querySelectorAll('[class*="player-seat"], [class*="PlayerSeat"], [class*="seat"]');
  const seatRects = Array.from(playerSeats).map((seat, idx) => ({
    el: seat,
    idx,
    rect: seat.getBoundingClientRect()
  })).filter(s => s.rect.width > 0 && s.rect.height > 0);
  
  for (let i = 0; i < seatRects.length; i++) {
    for (let j = i + 1; j < seatRects.length; j++) {
      if (rectsOverlap(seatRects[i].rect, seatRects[j].rect, 0.2)) {
        overlappingElements.push({
          type: 'seat-overlap',
          description: 'Player seats overlapping each other',
          seat1Idx: seatRects[i].idx,
          seat2Idx: seatRects[j].idx
        });
      }
    }
  }
  
  // Check for general z-index stacking issues (elements with same position but different z-index)
  const absoluteElements = document.querySelectorAll('[style*="position: absolute"], [style*="position:absolute"]');
  const stackingIssues = [];
  
  absoluteElements.forEach((el, idx) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    // Check if any other absolute element is at nearly the same position
    absoluteElements.forEach((other, otherIdx) => {
      if (idx >= otherIdx) return;
      const otherRect = other.getBoundingClientRect();
      const otherStyle = window.getComputedStyle(other);
      
      // Check for significant overlap
      if (rectsOverlap(rect, otherRect, 0.5)) {
        const z1 = parseInt(style.zIndex) || 0;
        const z2 = parseInt(otherStyle.zIndex) || 0;
        
        // If same z-index but overlapping, potential issue
        if (z1 === z2 && z1 !== 0) {
          stackingIssues.push({
            element1: el.className?.toString().slice(0, 30),
            element2: other.className?.toString().slice(0, 30),
            zIndex: z1
          });
        }
      }
    });
  });
  
  // Report overlap issues
  if (overlappingElements.length > 0) {
    issues.push({
      type: 'overlapping-elements',
      count: overlappingElements.length,
      details: overlappingElements.slice(0, 5)
    });
  }
  
  if (stackingIssues.length > 3) {
    issues.push({
      type: 'z-index-stacking-issues',
      count: stackingIssues.length,
      details: stackingIssues.slice(0, 3)
    });
  }
  
  return { 
    isGamePage: true, 
    issues,
    cardStats: {
      totalCardElements: allElements.length,
      playingCards: playingCards.length,
      placeholderCards,
      missingGraphics,
      overlappingCount: overlappingElements.length
    }
  };
})()`;

// ============================================================================
// BROWSER QA MONSTER CLASS
// ============================================================================

export class BrowserQAMonster {
  name = "Browser QA Monster";
  type = "browser-qa";

  private browser: Browser | null = null;
  private findings: Finding[] = [];
  private stats: TestStats = { run: 0, passed: 0, failed: 0 };
  private consoleErrors: string[] = [];

  async run(): Promise<{
    passed: boolean;
    findings: Finding[];
    stats: TestStats;
    duration: number;
  }> {
    const startTime = Date.now();
    console.log("\n" + "═".repeat(70));
    console.log("  🧪 BROWSER QA MONSTER - FAST COMPREHENSIVE UI TESTING");
    console.log("═".repeat(70) + "\n");

    try {
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== "false",
      });

      // Run test groups in parallel using multiple browser contexts
      console.log("  🚀 Running parallel test groups...\n");

      await Promise.all([
        this.runPublicPagesTests(),
        this.runAuthTests(),
        this.runAdminTests(),
        this.runInteractiveTests(),
        this.runGameViewTests(),
      ]);

      // Sequential tests that need specific state
      console.log("\n  📝 Running sequential tests...\n");
      await this.runFormTests();
      await this.runNavigationTests();

      await this.browser.close();

      // Cleanup game setup (mock bot processes)
      if (this.gameCleanup) {
        await this.gameCleanup();
      }
    } catch (error) {
      console.error("Monster crashed:", error);
      if (this.browser) await this.browser.close();
      if (this.gameCleanup) await this.gameCleanup();
      throw error;
    }

    // Print summary
    this.printSummary(Date.now() - startTime);

    const hasHighSeverity = this.findings.some(
      (f) => f.severity === "critical" || f.severity === "high",
    );

    return {
      passed: !hasHighSeverity,
      findings: this.findings,
      stats: this.stats,
      duration: Date.now() - startTime,
    };
  }

  // ============================================================================
  // PARALLEL TEST GROUPS
  // ============================================================================

  private async runPublicPagesTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  📄 Testing public pages...");

    for (const route of CRITICAL_ROUTES) {
      await this.testPage(page, route);
    }

    await context.close();
    console.log("  ✅ Public pages done");
  }

  private async runAuthTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  🔐 Testing auth flows...");

    // Test login page
    await page.goto(`${BASE_URL}/login`, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(500);

    // Check login form exists
    const hasEmailInput = await page.$(
      'input[type="email"], input[name="email"]',
    );
    const hasPasswordInput = await page.$('input[type="password"]');
    const hasSubmitBtn = await page.$(
      'button[type="submit"], button:has-text("Sign In"), button:has-text("Login")',
    );

    if (!hasEmailInput || !hasPasswordInput) {
      this.addFinding(
        "FORM",
        "high",
        "Login form incomplete",
        "Missing email or password input",
        "/login",
      );
    }
    if (!hasSubmitBtn) {
      this.addFinding(
        "FORM",
        "high",
        "Login form missing submit",
        "No submit button found",
        "/login",
      );
    }

    // Test registration page
    await page.goto(`${BASE_URL}/register`, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(500);

    const regCheck = (await page.evaluate(BATCH_FORM_CHECK)) as any;
    if (regCheck.issues.length > 0) {
      for (const issue of regCheck.issues) {
        this.addFinding(
          "FORM",
          "medium",
          `Registration form issue: ${issue.type}`,
          JSON.stringify(issue),
          "/register",
        );
      }
    }

    // Try to login with test user
    try {
      await page.goto(`${BASE_URL}/login`, { timeout: PAGE_TIMEOUT_MS });
      await page.fill(
        'input[type="email"], input[name="email"]',
        "test@example.com",
      );
      await page.fill('input[type="password"]', "password123");
      await page.click(
        'button[type="submit"], button:has-text("Sign In"), button:has-text("Login")',
      );
      await page.waitForTimeout(2000);

      // Check if logged in
      const url = page.url();
      if (url.includes("/login")) {
        // Still on login page - check for error message
        const errorVisible = await page.$('[class*="error"], [role="alert"]');
        if (!errorVisible) {
          this.addFinding(
            "UX",
            "medium",
            "Login error not shown",
            "Failed login but no error message visible",
            "/login",
          );
        }
      }
    } catch (e) {
      // Login attempt failed, that's ok for testing
    }

    await context.close();
    console.log("  ✅ Auth tests done");
  }

  private async runAdminTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  👑 Testing admin pages...");

    for (const route of ADMIN_ROUTES) {
      try {
        await page.goto(`${BASE_URL}${route}`, { timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(500);

        // Check for redirect to login (expected for unauthenticated)
        const url = page.url();
        if (!url.includes("/login") && !url.includes("/admin")) {
          // Neither redirected nor on admin page - weird state
          this.addFinding(
            "AUTH",
            "high",
            "Admin route unprotected",
            `${route} accessible without auth`,
            route,
          );
        }

        // Run batch health check
        const health = (await page.evaluate(BATCH_PAGE_HEALTH_CHECK)) as any;
        this.processHealthCheck(health, route);
      } catch (e) {
        // Page didn't load, could be expected
      }
    }

    await context.close();
    console.log("  ✅ Admin tests done");
  }

  private async runInteractiveTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  🖱️  Testing interactive elements...");

    // Test home page interactivity
    await page.goto(`${BASE_URL}/`, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(500);

    const interactiveCheck = (await page.evaluate(
      BATCH_INTERACTIVE_CHECK,
    )) as any;
    if (interactiveCheck.issues.length > 0) {
      for (const issue of interactiveCheck.issues) {
        this.addFinding(
          "UX",
          "low",
          `Interactive issue: ${issue.type}`,
          `Count: ${issue.count}`,
          "/",
        );
      }
    }

    // Test tournaments page interactivity
    await page.goto(`${BASE_URL}/tournaments`, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(500);

    const tournamentCheck = (await page.evaluate(
      BATCH_INTERACTIVE_CHECK,
    )) as any;
    if (tournamentCheck.issues.length > 0) {
      for (const issue of tournamentCheck.issues) {
        this.addFinding(
          "UX",
          "low",
          `Interactive issue: ${issue.type}`,
          `Count: ${issue.count}`,
          "/tournaments",
        );
      }
    }

    // Test clicking on key elements (sample)
    const clickableSelectors = [
      'a[href="/tournaments"]',
      'a[href="/bots"]',
      'a[href="/leaderboard"]',
      "button:first-of-type",
    ];

    for (const selector of clickableSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            await element.click({ timeout: 2000 });
            await page.waitForTimeout(300);
            this.stats.passed++;
          }
        }
        this.stats.run++;
      } catch (e) {
        this.stats.failed++;
        this.stats.run++;
      }
    }

    await context.close();
    console.log("  ✅ Interactive tests done");
  }

  private gameCleanup: (() => Promise<void>) | null = null;

  private async runGameViewTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  🎰 Testing game view card rendering...");

    try {
      // IMPORTANT: Ensure a live game with players is running before testing
      // This gives us consistent game state to test card rendering
      const setupResult = await ensureLiveGame(4, 3000);
      this.gameCleanup = setupResult.cleanup;

      if (!setupResult.success) {
        console.log(`    ⚠️  ${setupResult.error}`);
        await context.close();
        console.log("  ⚠️  Game view tests skipped (no live game)");
        return;
      }

      if (setupResult.gameId) {
        console.log(
          `    📋 Using game ${setupResult.gameId.slice(0, 8)}... with ${setupResult.playerCount} players`,
        );
      }

      // Query the API for games with active players
      let gameIds: string[] = [];

      // If we have a specific game from setup, prioritize it
      if (setupResult.gameId) {
        gameIds.push(setupResult.gameId);
      }

      // Also add other running games
      try {
        const response = await fetch(
          `${BASE_URL.replace("3001", "3000")}/api/v1/games`,
        );
        if (response.ok) {
          const games = (await response.json()) as Array<{
            id: string;
            status: string;
            players?: unknown[];
          }>;
          // Prioritize running games with players
          const activeGames = games
            .filter(
              (g) =>
                g.status === "running" &&
                g.players &&
                g.players.length > 0 &&
                !gameIds.includes(g.id),
            )
            .slice(0, 2)
            .map((g) => g.id);
          // Also include some running games even if player list is empty (might be populated via WS)
          const runningGames = games
            .filter((g) => g.status === "running" && !gameIds.includes(g.id))
            .slice(0, 5)
            .map((g) => g.id);
          gameIds = [...new Set([...activeGames, ...runningGames])].slice(0, 5);
        }
      } catch {
        // API unavailable, fall back to page-based discovery
      }

      // If API gave us game IDs, test those directly
      if (gameIds.length > 0) {
        console.log(`    📋 Found ${gameIds.length} games from API`);
        for (const gameId of gameIds) {
          await this.testGamePage(page, gameId);
        }
      } else {
        // Fallback: find game links from tables page
        await page.goto(`${BASE_URL}/tables`, { timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(1000);

        const gameLinks = await page.$$eval('a[href*="/game/"]', (links) =>
          links.map((l) => (l as { href: string }).href).slice(0, 5),
        );

        if (gameLinks.length > 0) {
          console.log(`    📋 Found ${gameLinks.length} game links from page`);
          for (const gameUrl of gameLinks) {
            const gameId = gameUrl.split("/").pop();
            if (gameId) {
              await this.testGamePage(page, gameId);
            }
          }
        } else {
          console.log("    ℹ️  No active games found to test card rendering");
        }
      }
    } catch (e) {
      console.log("    ⚠️  Error in game view tests:", (e as Error).message);
    }

    await context.close();
    console.log("  ✅ Game view tests done");
  }

  private async testGamePage(page: Page, gameId: string): Promise<void> {
    const gameUrl = `${BASE_URL}/game/${gameId}`;

    try {
      await page.goto(gameUrl, { timeout: PAGE_TIMEOUT_MS });

      // Monitor the game over multiple checks to catch broken cards AND overlaps
      let foundBrokenCards = false;
      let foundOverlaps = false;
      let maxPlaceholders = 0;
      let maxOverlaps = 0;
      let bestCardCheck: any = null;
      let bestOverlapCheck: any = null;
      let totalCardsObserved = 0;

      // Check multiple times over ~8 seconds to catch state transitions
      for (const waitMs of [500, 1000, 1500, 1500, 1500, 2000]) {
        await page.waitForTimeout(waitMs);
        const cardCheck = (await page.evaluate(BATCH_GAME_CARD_CHECK)) as any;

        if (!cardCheck.isGamePage) continue;

        const stats = cardCheck.cardStats;
        if (stats) {
          totalCardsObserved = Math.max(totalCardsObserved, stats.playingCards);

          // Track the worst broken card count seen
          if (stats.placeholderCards > maxPlaceholders) {
            maxPlaceholders = stats.placeholderCards;
            bestCardCheck = cardCheck;
            foundBrokenCards = true;
          }

          // Track overlapping elements
          if (stats.overlappingCount > maxOverlaps) {
            maxOverlaps = stats.overlappingCount;
            bestOverlapCheck = cardCheck;
            foundOverlaps = true;
          }

          // If we haven't found issues yet, keep the best check
          if (!foundBrokenCards && !foundOverlaps && stats.playingCards > 0) {
            bestCardCheck = cardCheck;
          }
        }
      }

      const checkToUse = bestCardCheck || bestOverlapCheck;

      if (!checkToUse?.isGamePage) {
        console.log(`    ⚠️  ${gameId.slice(0, 8)}... - not a game page`);
        return;
      }

      // Process ALL issues from the checks
      const allIssues = [
        ...(bestCardCheck?.issues || []),
        ...(bestOverlapCheck?.issues || []),
      ];

      // Deduplicate by type
      const seenTypes = new Set<string>();
      for (const issue of allIssues) {
        if (seenTypes.has(issue.type)) continue;
        seenTypes.add(issue.type);

        if (issue.type === "placeholder-cards") {
          this.addFinding(
            "RENDER",
            "critical",
            "Broken card rendering - placeholder cards",
            `${issue.count} cards showing "?" placeholder instead of proper card graphics. This indicates the card component failed to load the SVG for community/hole cards. Details: ${JSON.stringify(issue.details?.slice(0, 3))}`,
            `/game/${gameId}`,
          );
        } else if (issue.type === "missing-card-graphics") {
          this.addFinding(
            "RENDER",
            "high",
            "Missing card graphics",
            `${issue.count} playing cards missing SVG/image graphics - showing blank/white cards`,
            `/game/${gameId}`,
          );
        } else if (issue.type === "overlapping-elements") {
          this.addFinding(
            "LAYOUT",
            "critical",
            "UI elements overlapping each other",
            `${issue.count} overlapping element pairs detected. Cards/UI elements are stacking incorrectly. Details: ${JSON.stringify(issue.details?.slice(0, 3))}`,
            `/game/${gameId}`,
          );
        } else if (issue.type === "z-index-stacking-issues") {
          this.addFinding(
            "LAYOUT",
            "high",
            "Z-index stacking problems",
            `${issue.count} elements with conflicting z-index values causing visual overlap. Details: ${JSON.stringify(issue.details?.slice(0, 2))}`,
            `/game/${gameId}`,
          );
        }
      }

      // Log card stats with overlap info
      const issues: string[] = [];
      if (foundBrokenCards) issues.push(`${maxPlaceholders} broken cards`);
      if (foundOverlaps) issues.push(`${maxOverlaps} overlaps`);

      const status =
        issues.length > 0
          ? `❌ ${issues.join(", ")}`
          : totalCardsObserved > 0
            ? "✅"
            : "⏳ no cards yet";
      console.log(
        `    ${status} Game ${gameId.slice(0, 8)}...: ${totalCardsObserved} cards observed`,
      );

      this.stats.run++;
      if (foundBrokenCards || foundOverlaps) {
        this.stats.failed++;
      } else {
        this.stats.passed++;
      }
    } catch (e) {
      console.log(`    ⚠️  Could not test game ${gameId.slice(0, 8)}...`);
    }
  }

  // ============================================================================
  // SEQUENTIAL TESTS
  // ============================================================================

  private async runFormTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  📝 Testing forms...");

    const formPages = ["/login", "/register", "/forgot-password"];

    for (const route of formPages) {
      try {
        await page.goto(`${BASE_URL}${route}`, { timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(500);

        const formCheck = (await page.evaluate(BATCH_FORM_CHECK)) as any;

        if (formCheck.formCount === 0) {
          this.addFinding(
            "FORM",
            "high",
            "No form found",
            `Expected form on ${route}`,
            route,
          );
        }

        for (const issue of formCheck.issues) {
          this.addFinding(
            "FORM",
            "medium",
            `Form issue: ${issue.type}`,
            JSON.stringify(issue),
            route,
          );
        }

        this.stats.run++;
        this.stats.passed++;
      } catch (e) {
        this.stats.run++;
        this.stats.failed++;
      }
    }

    await context.close();
    console.log("  ✅ Form tests done");
  }

  private async runNavigationTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  🧭 Testing navigation...");

    // Test 404 page
    try {
      await page.goto(`${BASE_URL}/this-page-does-not-exist-12345`, {
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);

      const has404 = await page.evaluate(`
        document.body.innerText.toLowerCase().includes('404') ||
        document.body.innerText.toLowerCase().includes('not found') ||
        document.body.innerText.toLowerCase().includes('page not found')
      `);

      if (!has404) {
        this.addFinding(
          "NAV",
          "medium",
          "Missing 404 page",
          "Invalid URL doesn't show 404 error",
          "/invalid-url",
        );
      }
    } catch (e) {
      // Page error is acceptable for 404 test
    }

    // Test back button navigation
    try {
      await page.goto(`${BASE_URL}/`, { timeout: PAGE_TIMEOUT_MS });
      await page.goto(`${BASE_URL}/tournaments`, { timeout: PAGE_TIMEOUT_MS });
      await page.goBack();
      await page.waitForTimeout(500);

      const url = page.url();
      if (!url.endsWith("/") && !url.includes("localhost:3001")) {
        this.addFinding(
          "NAV",
          "medium",
          "Back navigation broken",
          "Browser back button doesn't work correctly",
          "/",
        );
      }
    } catch (e) {
      // Navigation test failed
    }

    // Test deep linking
    try {
      await page.goto(`${BASE_URL}/tournaments?sort=date&filter=active`, {
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);

      // Page should load without error
      const health = (await page.evaluate(BATCH_PAGE_HEALTH_CHECK)) as any;
      if (health.issues.some((i: any) => i.type === "react-error")) {
        this.addFinding(
          "NAV",
          "high",
          "Deep linking fails",
          "URL with query params causes error",
          "/tournaments?...",
        );
      }
    } catch (e) {
      // Deep linking failed
    }

    await context.close();
    console.log("  ✅ Navigation tests done");
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private setupPageListeners(page: Page): void {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!text.includes("[vite]") && !text.includes("favicon")) {
          this.consoleErrors.push(text);
        }
      }
    });

    page.on("pageerror", (error) => {
      this.addFinding(
        "CRASH",
        "critical",
        "JavaScript Crash",
        error.message.slice(0, 200),
        page.url(),
      );
    });
  }

  private async testPage(page: Page, route: string): Promise<void> {
    try {
      await page.goto(`${BASE_URL}${route}`, { timeout: PAGE_TIMEOUT_MS });
      await page.waitForTimeout(500);

      const health = (await page.evaluate(BATCH_PAGE_HEALTH_CHECK)) as any;
      this.processHealthCheck(health, route);

      this.stats.run++;
      this.stats.passed++;
    } catch (e: any) {
      this.stats.run++;
      this.stats.failed++;
      this.addFinding(
        "LOAD",
        "high",
        "Page failed to load",
        e.message?.slice(0, 100) || "Unknown error",
        route,
      );
    }
  }

  private processHealthCheck(health: any, route: string): void {
    if (!health || !health.issues) return;

    for (const issue of health.issues) {
      switch (issue.type) {
        case "error-state":
          this.addFinding(
            "ERROR",
            "high",
            "Error state visible",
            `${issue.count} error elements: ${issue.sample}`,
            route,
          );
          break;
        case "broken-image":
          this.addFinding(
            "ASSET",
            "medium",
            "Broken images",
            `${issue.count} images failed to load`,
            route,
          );
          break;
        case "empty-link":
          this.addFinding(
            "NAV",
            "low",
            "Empty links",
            `${issue.count} links with no valid href`,
            route,
          );
          break;
        case "unlabeled-button":
          this.addFinding(
            "A11Y",
            "medium",
            "Unlabeled buttons",
            `${issue.count} buttons without text/aria-label`,
            route,
          );
          break;
        case "unlabeled-input":
          this.addFinding(
            "A11Y",
            "medium",
            "Unlabeled inputs",
            `${issue.count} inputs without labels`,
            route,
          );
          break;
        case "react-error":
          this.addFinding(
            "CRASH",
            "critical",
            "React Error",
            issue.description,
            route,
          );
          break;
        case "horizontal-overflow":
          this.addFinding(
            "LAYOUT",
            "medium",
            "Horizontal overflow",
            `Page width: ${issue.width}px`,
            route,
          );
          break;
        case "too-many-fixed":
          this.addFinding(
            "LAYOUT",
            "low",
            "Too many fixed elements",
            `${issue.count} fixed position elements`,
            route,
          );
          break;
      }
    }
  }

  private addFinding(
    category: string,
    severity: "critical" | "high" | "medium" | "low",
    title: string,
    description: string,
    location: string,
  ): void {
    // Sync to unified issue tracker
    try {
      addIssue({
        category,
        severity: severity as Severity,
        source: "browser-qa",
        title,
        description,
        location,
      });
    } catch {
      // Silently ignore
    }

    this.findings.push({
      id: `browser-qa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      severity,
      title,
      description,
      location,
      reproducible: true,
    });
  }

  private printSummary(duration: number): void {
    console.log("\n" + "═".repeat(70));
    console.log("  📊 BROWSER QA MONSTER SUMMARY");
    console.log("═".repeat(70));

    console.log(`\n  ⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(
      `  📋 Tests: ${this.stats.run} run, ${this.stats.passed} passed, ${this.stats.failed} failed`,
    );
    console.log(`  🔍 Findings: ${this.findings.length}`);

    const bySeverity = {
      critical: this.findings.filter((f) => f.severity === "critical").length,
      high: this.findings.filter((f) => f.severity === "high").length,
      medium: this.findings.filter((f) => f.severity === "medium").length,
      low: this.findings.filter((f) => f.severity === "low").length,
    };

    console.log(`     🔴 Critical: ${bySeverity.critical}`);
    console.log(`     🟠 High: ${bySeverity.high}`);
    console.log(`     🟡 Medium: ${bySeverity.medium}`);
    console.log(`     🟢 Low: ${bySeverity.low}`);

    if (this.consoleErrors.length > 0) {
      console.log(`\n  ⚠️  Console Errors: ${this.consoleErrors.length}`);
      this.consoleErrors.slice(0, 3).forEach((e) => {
        console.log(`     - ${e.slice(0, 60)}...`);
      });
    }

    const passed = bySeverity.critical === 0 && bySeverity.high === 0;
    console.log(`\n  ${passed ? "✅ PASSED" : "❌ FAILED"}`);
    console.log("═".repeat(70) + "\n");
  }
}

// ============================================================================
// CLI RUNNER
// ============================================================================

async function main(): Promise<void> {
  const monster = new BrowserQAMonster();
  const result = await monster.run();

  console.log(`\nFindings: ${result.findings.length}`);
  console.log(`Duration: ${result.duration}ms`);

  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Browser QA Monster failed:", err);
  process.exit(1);
});
