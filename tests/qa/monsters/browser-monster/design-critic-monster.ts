/**
 * Design Critic Monster
 *
 * A sophisticated monster that evaluates UI quality, professionalism,
 * and competitiveness. Not just finding bugs, but critiquing design choices.
 *
 * Thinks like a design consultant: "Is this something a serious poker platform would ship?"
 */

import * as fs from "fs";
import * as path from "path";
import { BaseMonster } from "../shared/base-monster";
import { RunConfig, RunResult } from "../shared/types";

interface DesignCritique {
  area: string;
  severity: "amateur" | "mediocre" | "acceptable" | "good";
  issue: string;
  suggestion: string;
  competitorReference?: string;
  codeLocation?: string;
}

interface DesignStandard {
  name: string;
  description: string;
  check: (css: string, components: string[]) => DesignCritique[];
}

const POKER_COMPETITORS = [
  "PokerStars",
  "GGPoker",
  "888poker",
  "PartyPoker",
  "WPT Global",
];

const DESIGN_STANDARDS: DesignStandard[] = [
  {
    name: "Color Palette Sophistication",
    description:
      "Professional poker sites use rich, deep colors with careful accent choices",
    check: (css) => {
      const critiques: DesignCritique[] = [];

      // Check for basic/amateur colors
      const amateurColors = [
        { pattern: /#ff0000|#FF0000|rgb\(255,\s*0,\s*0\)/g, name: "pure red" },
        {
          pattern: /#00ff00|#00FF00|rgb\(0,\s*255,\s*0\)/g,
          name: "pure green",
        },
        { pattern: /#0000ff|#0000FF|rgb\(0,\s*0,\s*255\)/g, name: "pure blue" },
        { pattern: /#ffff00|#FFFF00/g, name: "pure yellow" },
      ];

      for (const { pattern, name } of amateurColors) {
        if (pattern.test(css)) {
          critiques.push({
            area: "Color Palette",
            severity: "amateur",
            issue: `Using ${name} - a saturated primary color that looks unprofessional`,
            suggestion: `Use sophisticated color variants. ${POKER_COMPETITORS[0]} uses deep emerald greens and rich burgundies, not pure primaries`,
            competitorReference:
              "PokerStars uses #1a472a (deep green) not #00ff00",
          });
        }
      }

      // Check for too many different colors (lack of cohesive palette)
      const hexColors = css.match(/#[0-9a-fA-F]{6}/g) || [];
      const uniqueColors = new Set(hexColors);
      if (uniqueColors.size > 25) {
        critiques.push({
          area: "Color Palette",
          severity: "mediocre",
          issue: `Found ${uniqueColors.size} different hex colors - inconsistent color palette`,
          suggestion:
            "Professional sites use 5-8 core colors with tints/shades. Define CSS variables for a cohesive palette",
          competitorReference:
            "GGPoker maintains strict color discipline with ~6 brand colors",
        });
      }

      // Check for lack of gradients (flat = dated)
      const hasGradients = /linear-gradient|radial-gradient/.test(css);
      if (!hasGradients) {
        critiques.push({
          area: "Visual Depth",
          severity: "mediocre",
          issue: "No gradients found - UI appears flat and dated",
          suggestion:
            "Add subtle gradients for depth. Modern poker UIs use gradients on cards, buttons, and backgrounds",
          competitorReference:
            "All major poker sites use gradients extensively for premium feel",
        });
      }

      return critiques;
    },
  },
  {
    name: "Typography Hierarchy",
    description: "Professional sites have clear, intentional typography scales",
    check: (css) => {
      const critiques: DesignCritique[] = [];

      // Check for too many font sizes
      const fontSizes = css.match(/font-size:\s*[\d.]+(?:px|rem|em)/g) || [];
      const uniqueSizes = new Set(fontSizes);
      if (uniqueSizes.size > 12) {
        critiques.push({
          area: "Typography",
          severity: "mediocre",
          issue: `Found ${uniqueSizes.size} different font sizes - chaotic typography scale`,
          suggestion:
            "Use a type scale (e.g., 12, 14, 16, 20, 24, 32, 48px). Limit to 6-8 sizes max",
          competitorReference:
            "PokerStars uses exactly 6 font sizes across their entire app",
        });
      }

      // Check for system fonts only
      const hasCustomFonts =
        /font-family:.*(?:Inter|Roboto|Montserrat|Poppins|Barlow|Oswald)/i.test(
          css,
        );
      if (!hasCustomFonts) {
        critiques.push({
          area: "Typography",
          severity: "mediocre",
          issue: "Using only system fonts - lacks brand identity",
          suggestion:
            "Add a distinctive display font for headings. Poker sites often use bold, modern sans-serifs",
          competitorReference:
            "GGPoker uses custom 'GG Sans', 888poker uses 'Barlow'",
        });
      }

      // Check for font-weight variety
      const fontWeights = css.match(/font-weight:\s*\d+/g) || [];
      const uniqueWeights = new Set(fontWeights);
      if (uniqueWeights.size < 3) {
        critiques.push({
          area: "Typography",
          severity: "acceptable",
          issue: "Limited font weight variety - typography feels flat",
          suggestion:
            "Use at least 3 weights (400, 600, 700) for visual hierarchy",
        });
      }

      return critiques;
    },
  },
  {
    name: "Interactive Element Polish",
    description:
      "Buttons, inputs, and interactive elements should feel premium",
    check: (css) => {
      const critiques: DesignCritique[] = [];

      // Check for box-shadow usage
      const hasShadows = /box-shadow/.test(css);
      if (!hasShadows) {
        critiques.push({
          area: "Visual Polish",
          severity: "mediocre",
          issue: "No box-shadows - UI elements lack depth and feel flat",
          suggestion:
            "Add subtle shadows to cards, modals, and elevated elements for depth",
          competitorReference:
            "PokerStars uses layered shadows for card and modal depth",
        });
      }

      // Check for transitions
      const transitionCount = (css.match(/transition:/g) || []).length;
      if (transitionCount < 10) {
        critiques.push({
          area: "Micro-interactions",
          severity: "mediocre",
          issue: `Only ${transitionCount} transitions found - interactions feel abrupt`,
          suggestion:
            "Add smooth transitions (150-300ms) to all interactive elements",
          competitorReference:
            "Premium poker apps have buttery smooth 200ms transitions everywhere",
        });
      }

      // Check for hover states
      const hoverCount = (css.match(/:hover/g) || []).length;
      if (hoverCount < 15) {
        critiques.push({
          area: "Interactivity",
          severity: "mediocre",
          issue: `Only ${hoverCount} hover states - many elements feel static`,
          suggestion:
            "Every clickable element needs a hover state. Users should feel elements respond",
          competitorReference:
            "GGPoker has hover effects on every button, card, and link",
        });
      }

      // Check for focus-visible for accessibility
      const hasFocusVisible = /focus-visible/.test(css);
      if (!hasFocusVisible) {
        critiques.push({
          area: "Accessibility",
          severity: "acceptable",
          issue: "No :focus-visible styles - keyboard navigation feels broken",
          suggestion:
            "Add :focus-visible styles for keyboard accessibility without affecting mouse users",
        });
      }

      return critiques;
    },
  },
  {
    name: "Spacing Consistency",
    description: "Professional UIs use consistent spacing scales",
    check: (css) => {
      const critiques: DesignCritique[] = [];

      // Check for arbitrary padding/margin values
      const spacings = css.match(/(?:padding|margin|gap):\s*[\d.]+px/g) || [];
      const uniqueSpacings = new Set(
        spacings.map((s) => s.match(/[\d.]+/)?.[0]),
      );

      // Filter to get pixel values
      const pxValues = Array.from(uniqueSpacings)
        .map(Number)
        .filter((n) => !isNaN(n));

      // Check if they follow a scale (4, 8, 12, 16, 24, 32, 48, 64)
      const standardScale = [
        0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96,
      ];
      const offScale = pxValues.filter(
        (v) => !standardScale.includes(v) && v < 100,
      );

      if (offScale.length > 10) {
        critiques.push({
          area: "Spacing",
          severity: "mediocre",
          issue: `${offScale.length} arbitrary spacing values (${offScale.slice(0, 5).join(", ")}px...) - inconsistent rhythm`,
          suggestion:
            "Use a spacing scale based on 4px or 8px units. Tailwind's scale is a good reference",
          competitorReference: "Professional sites use strict 8px grid systems",
        });
      }

      return critiques;
    },
  },
  {
    name: "Animation & Feedback",
    description: "Premium feel comes from thoughtful animations",
    check: (css) => {
      const critiques: DesignCritique[] = [];

      // Check for keyframe animations
      const keyframeCount = (css.match(/@keyframes/g) || []).length;
      if (keyframeCount < 3) {
        critiques.push({
          area: "Animation",
          severity: "mediocre",
          issue: `Only ${keyframeCount} keyframe animations - app feels static`,
          suggestion:
            "Add animations for: loading states, card deals, chip movements, win celebrations",
          competitorReference:
            "PokerStars has 20+ distinct animations for game events",
        });
      }

      // Check for transform usage (modern animations)
      const transformCount = (css.match(/transform:/g) || []).length;
      if (transformCount < 5) {
        critiques.push({
          area: "Animation",
          severity: "acceptable",
          issue:
            "Limited use of CSS transforms - missing modern animation techniques",
          suggestion:
            "Use transform for scale, rotate, and translate animations (GPU accelerated)",
        });
      }

      return critiques;
    },
  },
  {
    name: "Dark Mode Quality",
    description:
      "Poker apps are primarily dark - the dark theme must be excellent",
    check: (css) => {
      const critiques: DesignCritique[] = [];

      // Check background colors for pure black (too harsh)
      if (/#000000|#000(?![0-9a-f])|rgb\(0,\s*0,\s*0\)/.test(css)) {
        critiques.push({
          area: "Dark Theme",
          severity: "amateur",
          issue:
            "Using pure black (#000) backgrounds - too harsh, causes eye strain",
          suggestion:
            "Use dark grays (#0a0a0a to #1a1a1a) for backgrounds. Pure black is dated",
          competitorReference:
            "PokerStars uses #0d1b2a, GGPoker uses #121212 - never pure black",
        });
      }

      // Check for low contrast text in dark mode
      // Low contrast = dark text colors (below ~#666) on dark backgrounds
      // Colors #888+ are light enough to be readable on dark backgrounds
      // Note: Also check if contrast ratios are documented in comments (good practice)
      const hasContrastDocumentation = /contrast.*ratio|WCAG.*AA/i.test(css);
      const hasDarkTextOnDark =
        /color:\s*#[0-4][0-9a-f][0-9a-f][0-9a-f]{0,3}(?![0-9a-f])/i.test(css);

      if (hasDarkTextOnDark && !hasContrastDocumentation) {
        critiques.push({
          area: "Dark Theme",
          severity: "acceptable",
          issue:
            "Detected dark text colors that may have low contrast on dark backgrounds",
          suggestion:
            "Ensure text has at least 4.5:1 contrast ratio. Document contrast ratios in CSS comments",
        });
      }

      return critiques;
    },
  },
  {
    name: "Component Consistency",
    description: "UI components should feel unified and intentional",
    check: (css, components) => {
      const critiques: DesignCritique[] = [];
      const allComponentCode = components.join("\n");

      // Check for card component consistency
      const cardSizeUsages =
        allComponentCode.match(/PlayingCard[^>]*size=["'](\w+)["']/g) || [];
      const cardSizes = new Set(
        cardSizeUsages.map((m) => m.match(/size=["'](\w+)["']/)?.[1]),
      );

      if (cardSizes.size > 3) {
        critiques.push({
          area: "Visual Consistency",
          severity: "acceptable",
          issue: `Using ${cardSizes.size} different card sizes (${Array.from(cardSizes).join(", ")}) - may create visual inconsistency`,
          suggestion:
            "Limit card sizes to 2-3 variants: small (hole cards), medium (mini displays), large (community cards)",
          competitorReference:
            "PokerStars uses exactly 2 card sizes - hole cards and community cards",
        });
      }

      // Check border-radius consistency
      const borderRadii = css.match(/border-radius:\s*[\d.]+(?:px|rem)/g) || [];
      const uniqueRadii = new Set(borderRadii);
      if (uniqueRadii.size > 6) {
        critiques.push({
          area: "Component Design",
          severity: "mediocre",
          issue: `${uniqueRadii.size} different border-radius values - inconsistent component shapes`,
          suggestion:
            "Define 3-4 radius values: small (4px), medium (8px), large (16px), pill (9999px)",
          competitorReference:
            "PokerStars uses exactly 4 border-radius values across the app",
        });
      }

      // Check for button consistency
      const buttonClasses = css.match(/\.btn[^{]*/g) || [];
      if (buttonClasses.length < 4) {
        critiques.push({
          area: "Component Design",
          severity: "acceptable",
          issue:
            "Limited button variants - may not cover all use cases professionally",
          suggestion:
            "Have clear button hierarchy: primary, secondary, ghost, danger, with consistent sizing",
        });
      }

      return critiques;
    },
  },
  {
    name: "Internal ID Exposure",
    description:
      "User-facing UI should never show internal IDs like UUIDs or database keys",
    check: (_css, components) => {
      const critiques: DesignCritique[] = [];
      const allComponentCode = components.join("\n");

      // Check for UUID patterns being displayed to users
      // Exclude common false positives like .errors.slice(), .items.slice()
      const uuidDisplayPatterns = [
        /\{[^}]*(?:bot|table|game|user|tournament)Id[^}]*\.slice\(\s*\d+\s*,\s*\d+\s*\)/gi, // botId.slice(0, 8) - truncated UUID
        /\{[^}]*(?:bot|table|game|user|tournament)Id[^}]*\.substring\(/gi, // botId.substring() - truncated ID
        /`[^`]*#\$\{[^}]*(?:table|game|tournament)Id[^}]*\}/gi, // `Table #${tableId}` - ID in template literal
        /(?:Table|Game|Tournament)\s*#?\$\{[^}]*(?:table|game|tournament)Id/gi, // Entity #${id} patterns
      ];

      for (const pattern of uuidDisplayPatterns) {
        const matches = allComponentCode.match(pattern);
        if (matches) {
          for (const match of matches) {
            critiques.push({
              area: "User Experience",
              severity: "mediocre",
              issue: `Exposing internal ID in UI: ${match.slice(0, 60)}...`,
              suggestion:
                "Use human-friendly identifiers (names, sequential numbers) instead of UUIDs. If an ID must be shown, use a friendly format like 'Table A3' or hide it entirely",
              competitorReference:
                "PokerStars shows 'Table Madrid 24' not 'Table #a7f2b8c3'",
            });
          }
        }
      }

      return critiques;
    },
  },
  {
    name: "Poker-Specific Polish",
    description: "Poker UI elements need special attention to detail",
    check: (css, components) => {
      const critiques: DesignCritique[] = [];
      const allComponentCode = components.join("\n");

      // Check for card styling
      if (!css.includes("card") && !allComponentCode.includes("PlayingCard")) {
        critiques.push({
          area: "Poker UI",
          severity: "acceptable",
          issue: "Cannot find dedicated playing card styling",
          suggestion:
            "Playing cards are the core UI element - they need premium styling with shadows, bevels, and proper proportions",
          competitorReference:
            "All poker sites have custom-designed cards with subtle 3D effects",
        });
      }

      // Check for chip visualization
      if (
        !allComponentCode.includes("chip") &&
        !allComponentCode.includes("Chip")
      ) {
        critiques.push({
          area: "Poker UI",
          severity: "acceptable",
          issue: "Limited chip visualization",
          suggestion:
            "Poker chips should have denomination colors, stacking effects, and satisfying animations",
          competitorReference:
            "PokerStars has iconic stacked chip animations when betting",
        });
      }

      // Check for table felt texture
      const hasTextureOrPattern = /background.*url|pattern|texture|felt/i.test(
        css,
      );
      if (!hasTextureOrPattern) {
        critiques.push({
          area: "Poker UI",
          severity: "mediocre",
          issue: "No table texture/pattern - poker table looks flat and cheap",
          suggestion:
            "Add subtle felt texture, wood grain rail, or gradient to the table",
          competitorReference:
            "Every poker site has textured felt tables - it's expected",
        });
      }

      return critiques;
    },
  },
];

export class DesignCriticMonster extends BaseMonster {
  private cssPath = path.join(process.cwd(), "frontend/src/index.css");
  private componentsDir = path.join(process.cwd(), "frontend/src/components");
  private pagesDir = path.join(process.cwd(), "frontend/src/pages");

  constructor() {
    super({
      name: "Design Critic Monster",
      type: "design-critic" as any,
      timeout: 60000,
      verbose: true,
    });
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("🎨 Design Critic Monster - Evaluating UI sophistication...");
    this.log("━".repeat(60));
    this.log("Comparing against: " + POKER_COMPETITORS.join(", "));
    this.log("━".repeat(60));
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    // Read CSS
    let css = "";
    try {
      css = fs.readFileSync(this.cssPath, "utf-8");
      this.log(`📄 Loaded ${this.cssPath} (${css.length} chars)`);
    } catch {
      this.addFinding({
        category: "CONCERN",
        severity: "high",
        title: "Cannot read main CSS file",
        description: `Failed to read ${this.cssPath}`,
        location: { file: this.cssPath },
        reproducible: true,
        tags: ["css", "config"],
      });
      return;
    }

    // Read component files
    const components: string[] = [];
    const componentDirs = [this.componentsDir, this.pagesDir];

    for (const dir of componentDirs) {
      try {
        const files = this.getFilesRecursively(dir, [".tsx", ".jsx"]);
        for (const file of files) {
          try {
            components.push(fs.readFileSync(file, "utf-8"));
          } catch {
            // Skip unreadable files
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    this.log(`📦 Loaded ${components.length} component files for analysis`);
    this.log("");

    // Run all design standards
    const allCritiques: DesignCritique[] = [];

    for (const standard of DESIGN_STANDARDS) {
      this.log(`\n🔍 Checking: ${standard.name}`);
      this.log(`   ${standard.description}`);

      const critiques = standard.check(css, components);

      for (const critique of critiques) {
        allCritiques.push(critique);

        const severityIcon = {
          amateur: "🚨",
          mediocre: "⚠️",
          acceptable: "💡",
          good: "✅",
        }[critique.severity];

        this.log(
          `   ${severityIcon} [${critique.severity.toUpperCase()}] ${critique.issue}`,
        );

        // Convert to finding
        this.addFinding({
          category: critique.severity === "amateur" ? "BUG" : "CONCERN",
          severity:
            critique.severity === "amateur"
              ? "critical"
              : critique.severity === "mediocre"
                ? "high"
                : "medium",
          title: `${critique.area}: ${critique.issue.substring(0, 60)}...`,
          description: `${critique.issue}\n\n**Suggestion:** ${critique.suggestion}${critique.competitorReference ? `\n\n**Competitor Reference:** ${critique.competitorReference}` : ""}`,
          location: { file: this.cssPath, component: critique.area },
          reproducible: true,
          tags: [
            "design",
            "ux",
            critique.area.toLowerCase().replace(/\s+/g, "-"),
          ],
        });
      }

      if (critiques.length === 0) {
        this.log(`   ✅ Looks good!`);
      }
    }

    // Generate overall assessment
    this.log("\n" + "═".repeat(60));
    this.log("📊 OVERALL DESIGN ASSESSMENT");
    this.log("═".repeat(60));

    const amateurCount = allCritiques.filter(
      (c) => c.severity === "amateur",
    ).length;
    const mediocreCount = allCritiques.filter(
      (c) => c.severity === "mediocre",
    ).length;
    const acceptableCount = allCritiques.filter(
      (c) => c.severity === "acceptable",
    ).length;

    let overallGrade: string;
    let overallMessage: string;

    if (amateurCount > 2) {
      overallGrade = "D - Amateur";
      overallMessage =
        "This UI would not be taken seriously by poker players. Major improvements needed before competing with established platforms.";
    } else if (amateurCount > 0 || mediocreCount > 5) {
      overallGrade = "C - Below Average";
      overallMessage =
        "The UI has some professional elements but several areas feel unpolished. Players would notice the lack of refinement compared to competitors.";
    } else if (mediocreCount > 2) {
      overallGrade = "B - Acceptable";
      overallMessage =
        "The UI is functional and reasonably polished. Some areas could use more attention to compete with top-tier platforms.";
    } else if (mediocreCount > 0 || acceptableCount > 3) {
      overallGrade = "B+ - Good";
      overallMessage =
        "The UI is well-designed with minor areas for improvement. Competitive with mid-tier poker platforms.";
    } else {
      overallGrade = "A - Professional";
      overallMessage =
        "The UI meets professional standards and could compete with established poker platforms.";
    }

    this.log(`\nGrade: ${overallGrade}`);
    this.log(`\n${overallMessage}`);
    this.log(`\nIssues Found:`);
    this.log(`  🚨 Amateur-level issues: ${amateurCount}`);
    this.log(`  ⚠️  Mediocre areas: ${mediocreCount}`);
    this.log(`  💡 Minor suggestions: ${acceptableCount}`);

    // Only add a finding if the grade indicates real problems (C or below)
    // Good grades (A, B+, B) are informational - not issues to fix
    if (amateurCount > 0 || mediocreCount > 5) {
      this.addFinding({
        category: amateurCount > 0 ? "BUG" : "CONCERN",
        severity:
          amateurCount > 2 ? "critical" : amateurCount > 0 ? "high" : "medium",
        title: `Overall Design Grade: ${overallGrade}`,
        description: `${overallMessage}\n\n**Breakdown:**\n- Amateur-level issues: ${amateurCount}\n- Mediocre areas: ${mediocreCount}\n- Minor suggestions: ${acceptableCount}\n\n**Competitors analyzed:** ${POKER_COMPETITORS.join(", ")}`,
        location: { file: this.cssPath },
        reproducible: true,
        tags: ["design", "overall-assessment"],
      });
    } else {
      // Good grades - just log, don't create a finding
      this.log(
        `\n✅ Design quality is good (${overallGrade}) - no action needed`,
      );
    }

    // Provide priority recommendations
    this.log("\n" + "─".repeat(60));
    this.log("🎯 PRIORITY IMPROVEMENTS");
    this.log("─".repeat(60));

    const priorities = allCritiques
      .filter((c) => c.severity === "amateur" || c.severity === "mediocre")
      .slice(0, 5);

    priorities.forEach((critique, i) => {
      this.log(`\n${i + 1}. ${critique.area}`);
      this.log(`   Problem: ${critique.issue}`);
      this.log(`   Fix: ${critique.suggestion}`);
      if (critique.competitorReference) {
        this.log(`   Reference: ${critique.competitorReference}`);
      }
    });

    this.log("\n" + "═".repeat(60));
  }

  protected async teardown(): Promise<void> {
    // No cleanup needed
  }

  private getFilesRecursively(dir: string, extensions: string[]): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          files.push(...this.getFilesRecursively(fullPath, extensions));
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }

    return files;
  }
}

// Run if executed directly
if (require.main === module) {
  const monster = new DesignCriticMonster();
  const runConfig = {
    version: 1,
    runId: `design-critic-${Date.now()}`,
    startTime: new Date(),
    monsters: ["design-critic" as any],
    triggeredBy: "manual" as const,
  };

  monster
    .run(runConfig)
    .then((result) => {
      console.log(`\n\n📋 Total findings: ${result.findings.length}`);
      process.exit(result.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Design Critic Monster failed:", err);
      process.exit(1);
    });
}
