/**
 * Accessibility and Interactivity Checks
 *
 * Detects UI/UX issues like:
 * - Buttons that don't look clickable (missing hover/cursor styles)
 * - Low contrast elements
 * - Missing focus indicators
 * - Disabled-looking enabled elements
 */

export interface AccessibilityIssue {
  type:
    | "low-contrast"
    | "missing-hover-state"
    | "missing-cursor-pointer"
    | "looks-disabled"
    | "no-focus-indicator"
    | "missing-aria-label";
  severity: "critical" | "high" | "medium" | "low";
  element: string;
  selector?: string;
  description: string;
  wcagViolation?: string;
}

export interface InteractivityCheckResult {
  hasIssues: boolean;
  issues: AccessibilityIssue[];
}

/**
 * CSS properties that indicate interactivity
 */
export const INTERACTIVE_CSS_PROPERTIES = {
  cursor: "pointer",
  hoverOpacity: /opacity:\s*0\.[5-9]|opacity:\s*1/,
  hoverBackground: /hover:bg-|:hover.*background/,
};

/**
 * Patterns that indicate an element looks disabled but isn't
 */
export const DISABLED_APPEARANCE_PATTERNS = [
  /opacity:\s*0\.[0-4]/,
  /color:\s*#[0-9a-f]{6}.*\/\s*[0-3][0-9]%/i, // Low alpha color
  /rgba\([^)]+,\s*0\.[0-3]\)/, // Low RGBA alpha
  /filter:\s*grayscale/,
  /pointer-events:\s*none/,
];

/**
 * Minimum contrast ratios per WCAG 2.1
 */
export const WCAG_CONTRAST_RATIOS = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3.0,
  AAA_NORMAL: 7.0,
  AAA_LARGE: 4.5,
};

/**
 * Check if a button element has proper interactive styling
 */
export function checkButtonInteractivity(
  elementStyles: Record<string, string>,
  elementState: {
    hasHoverStyle?: boolean;
    hasFocusStyle?: boolean;
    isDisabled?: boolean;
  },
): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  // Skip if actually disabled
  if (elementState.isDisabled) {
    return issues;
  }

  // Check cursor style
  if (elementStyles.cursor !== "pointer") {
    issues.push({
      type: "missing-cursor-pointer",
      severity: "medium",
      element: "button",
      description:
        "Button does not have cursor:pointer - users may not realize it's clickable",
    });
  }

  // Check hover state
  if (!elementState.hasHoverStyle) {
    issues.push({
      type: "missing-hover-state",
      severity: "high",
      element: "button",
      description:
        "Button has no visible hover state - appears non-interactive",
    });
  }

  // Check focus indicator
  if (!elementState.hasFocusStyle) {
    issues.push({
      type: "no-focus-indicator",
      severity: "high",
      element: "button",
      description:
        "Button has no focus indicator - keyboard users cannot see focus",
      wcagViolation: "WCAG 2.4.7 Focus Visible",
    });
  }

  // Check if it looks disabled
  const opacity = parseFloat(elementStyles.opacity || "1");
  if (opacity < 0.6) {
    issues.push({
      type: "looks-disabled",
      severity: "high",
      element: "button",
      description: `Button has low opacity (${opacity}) - appears disabled when it isn't`,
    });
  }

  return issues;
}

/**
 * Check CSS for patterns that indicate low contrast or disabled appearance
 */
export function checkCssForAccessibilityIssues(
  css: string,
): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  // Check for low-opacity backgrounds on buttons
  const dangerButtonMatch = css.match(/\.btn-danger\s*\{([^}]+)\}/);
  if (dangerButtonMatch) {
    const styles = dangerButtonMatch[1];

    // Check for low opacity background
    const bgMatch = styles.match(/background:\s*rgba\([^)]+,\s*(0\.\d+)\)/);
    if (bgMatch) {
      const alpha = parseFloat(bgMatch[1]);
      if (alpha < 0.4) {
        issues.push({
          type: "low-contrast",
          severity: "high",
          element: ".btn-danger",
          description: `Danger button has very low background opacity (${(alpha * 100).toFixed(0)}%) - may look disabled`,
        });
      }
    }

    // Check for missing hover state
    if (!css.includes(".btn-danger:hover") && !styles.includes("hover:")) {
      issues.push({
        type: "missing-hover-state",
        severity: "high",
        element: ".btn-danger",
        description:
          "Danger button has no hover state defined - users cannot tell it's interactive",
      });
    }

    // Check for missing cursor pointer
    if (!styles.includes("cursor:") && !styles.includes("cursor-pointer")) {
      issues.push({
        type: "missing-cursor-pointer",
        severity: "medium",
        element: ".btn-danger",
        description:
          "Danger button may not have cursor:pointer - needs explicit cursor style",
      });
    }
  }

  return issues;
}

/**
 * Known button style classes and their expected interactive properties
 */
export const BUTTON_STYLE_EXPECTATIONS: Record<
  string,
  { shouldHave: string[]; shouldNotLookLike: string[] }
> = {
  "btn-primary": {
    shouldHave: [
      "cursor-pointer or cursor:pointer",
      "hover state",
      "focus indicator",
    ],
    shouldNotLookLike: ["disabled", "text-only", "non-interactive"],
  },
  "btn-secondary": {
    shouldHave: [
      "cursor-pointer or cursor:pointer",
      "hover state",
      "focus indicator",
    ],
    shouldNotLookLike: ["disabled", "non-interactive"],
  },
  "btn-ghost": {
    shouldHave: [
      "cursor-pointer or cursor:pointer",
      "hover state",
      "focus indicator",
    ],
    shouldNotLookLike: ["invisible", "hidden"],
  },
  "btn-danger": {
    shouldHave: [
      "cursor-pointer or cursor:pointer",
      "hover state",
      "focus indicator",
      "visible background",
    ],
    shouldNotLookLike: ["disabled", "faded", "grayed-out"],
  },
};

/**
 * Buttons that should be checked on specific pages
 */
export const PAGE_BUTTON_CHECKS: Record<
  string,
  Array<{ buttonText: string; expectedBehavior: string }>
> = {
  "/bots": [
    {
      buttonText: "Validate",
      expectedBehavior: "should look clickable with hover state",
    },
    {
      buttonText: "Edit",
      expectedBehavior: "should look clickable with hover state",
    },
    {
      buttonText: "Deactivate",
      expectedBehavior: "should look clickable, not disabled",
    },
    {
      buttonText: "Activate",
      expectedBehavior: "should look clickable with primary style",
    },
    {
      buttonText: "Create bot",
      expectedBehavior: "should be clearly visible and clickable",
    },
  ],
  "/tournaments": [
    {
      buttonText: "Create tournament",
      expectedBehavior: "should be visible to admins only",
    },
    { buttonText: "Join", expectedBehavior: "should look clickable" },
  ],
  "/tables": [
    {
      buttonText: "Create table",
      expectedBehavior: "should be visible to admins only",
    },
  ],
};

/**
 * Generate findings for button interactivity issues
 */
export function generateButtonInteractivityFindings(
  page: string,
  buttonText: string,
  issues: AccessibilityIssue[],
): Array<{
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
}> {
  return issues.map((issue) => ({
    title: `${issue.type.replace(/-/g, " ")}: "${buttonText}" on ${page}`,
    description: issue.description,
    severity: issue.severity,
    category:
      issue.type === "missing-hover-state" || issue.type === "looks-disabled"
        ? "UX"
        : "A11Y",
  }));
}
