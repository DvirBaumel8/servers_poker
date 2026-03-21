/**
 * DOM Overlap Detector
 * ====================
 *
 * Programmatic detection of element overlaps using bounding boxes.
 * Designed to work with browser_get_bounding_box MCP tool results.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  element?: string;
  ref?: string;
}

export interface OverlapResult {
  element1: BoundingBox;
  element2: BoundingBox;
  overlapArea: number;
  overlapPercentage: number;
  isSignificant: boolean;
  description: string;
}

/**
 * Check if two bounding boxes overlap
 */
export function boxesOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
  return !(
    box1.x + box1.width <= box2.x ||
    box2.x + box2.width <= box1.x ||
    box1.y + box1.height <= box2.y ||
    box2.y + box2.height <= box1.y
  );
}

/**
 * Calculate the area of overlap between two boxes
 */
export function calculateOverlapArea(
  box1: BoundingBox,
  box2: BoundingBox,
): number {
  if (!boxesOverlap(box1, box2)) return 0;

  const xOverlap =
    Math.min(box1.x + box1.width, box2.x + box2.width) -
    Math.max(box1.x, box2.x);
  const yOverlap =
    Math.min(box1.y + box1.height, box2.y + box2.height) -
    Math.max(box1.y, box2.y);

  return Math.max(0, xOverlap) * Math.max(0, yOverlap);
}

/**
 * Calculate overlap as percentage of smaller element
 */
export function calculateOverlapPercentage(
  box1: BoundingBox,
  box2: BoundingBox,
): number {
  const overlapArea = calculateOverlapArea(box1, box2);
  const smallerArea = Math.min(
    box1.width * box1.height,
    box2.width * box2.height,
  );

  if (smallerArea === 0) return 0;
  return (overlapArea / smallerArea) * 100;
}

/**
 * Detect overlaps between player cards and player names
 */
export function detectCardNameOverlaps(
  playerCards: BoundingBox[],
  playerNames: BoundingBox[],
  threshold: number = 10,
): OverlapResult[] {
  const overlaps: OverlapResult[] = [];

  for (let i = 0; i < playerCards.length; i++) {
    for (let j = 0; j < playerNames.length; j++) {
      // Skip same player's own cards/name
      if (i === j) continue;

      const card = playerCards[i];
      const name = playerNames[j];

      if (boxesOverlap(card, name)) {
        const overlapArea = calculateOverlapArea(card, name);
        const overlapPercentage = calculateOverlapPercentage(card, name);

        overlaps.push({
          element1: card,
          element2: name,
          overlapArea,
          overlapPercentage,
          isSignificant: overlapPercentage >= threshold,
          description: `Player ${i + 1}'s cards overlap Player ${j + 1}'s name by ${overlapPercentage.toFixed(1)}%`,
        });
      }
    }
  }

  return overlaps;
}

/**
 * Detect overlaps between any set of elements
 */
export function detectAllOverlaps(
  elements: BoundingBox[],
  threshold: number = 5,
): OverlapResult[] {
  const overlaps: OverlapResult[] = [];

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const box1 = elements[i];
      const box2 = elements[j];

      if (boxesOverlap(box1, box2)) {
        const overlapArea = calculateOverlapArea(box1, box2);
        const overlapPercentage = calculateOverlapPercentage(box1, box2);

        overlaps.push({
          element1: box1,
          element2: box2,
          overlapArea,
          overlapPercentage,
          isSignificant: overlapPercentage >= threshold,
          description: `${box1.element || "Element"} overlaps ${box2.element || "Element"} by ${overlapPercentage.toFixed(1)}%`,
        });
      }
    }
  }

  return overlaps;
}

/**
 * Check if an element is within viewport bounds
 */
export function isWithinViewport(
  element: BoundingBox,
  viewport: { width: number; height: number },
): boolean {
  return (
    element.x >= 0 &&
    element.y >= 0 &&
    element.x + element.width <= viewport.width &&
    element.y + element.height <= viewport.height
  );
}

/**
 * Get elements that are partially or fully outside viewport
 */
export function getElementsOutsideViewport(
  elements: BoundingBox[],
  viewport: { width: number; height: number },
): Array<{ element: BoundingBox; outsidePercentage: number }> {
  const outside: Array<{ element: BoundingBox; outsidePercentage: number }> =
    [];

  for (const element of elements) {
    const elementArea = element.width * element.height;
    if (elementArea === 0) continue;

    // Calculate visible portion
    const visibleX1 = Math.max(0, element.x);
    const visibleY1 = Math.max(0, element.y);
    const visibleX2 = Math.min(viewport.width, element.x + element.width);
    const visibleY2 = Math.min(viewport.height, element.y + element.height);

    const visibleWidth = Math.max(0, visibleX2 - visibleX1);
    const visibleHeight = Math.max(0, visibleY2 - visibleY1);
    const visibleArea = visibleWidth * visibleHeight;

    const outsidePercentage = ((elementArea - visibleArea) / elementArea) * 100;

    if (outsidePercentage > 0) {
      outside.push({ element, outsidePercentage });
    }
  }

  return outside;
}

/**
 * Check minimum touch target size (44x44 for accessibility)
 */
export function checkTouchTargetSize(
  elements: BoundingBox[],
  minSize: number = 44,
): Array<{ element: BoundingBox; issue: string }> {
  const issues: Array<{ element: BoundingBox; issue: string }> = [];

  for (const element of elements) {
    if (element.width < minSize || element.height < minSize) {
      issues.push({
        element,
        issue: `Touch target too small: ${element.width}x${element.height}px (minimum ${minSize}x${minSize}px)`,
      });
    }
  }

  return issues;
}

/**
 * Analyze layout for crowding issues
 */
export function analyzeCrowding(
  elements: BoundingBox[],
  minSpacing: number = 8,
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let totalSpacingViolations = 0;

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const box1 = elements[i];
      const box2 = elements[j];

      // Calculate minimum distance between edges
      const horizontalGap = Math.max(
        box2.x - (box1.x + box1.width),
        box1.x - (box2.x + box2.width),
      );
      const verticalGap = Math.max(
        box2.y - (box1.y + box1.height),
        box1.y - (box2.y + box2.height),
      );

      const minGap = Math.min(
        horizontalGap > 0 ? horizontalGap : Infinity,
        verticalGap > 0 ? verticalGap : Infinity,
      );

      if (minGap < minSpacing && minGap > -Infinity) {
        totalSpacingViolations++;
        issues.push(
          `Elements "${box1.element}" and "${box2.element}" are only ${minGap.toFixed(1)}px apart (min: ${minSpacing}px)`,
        );
      }
    }
  }

  // Score from 0-100 (100 = no crowding)
  const maxViolations = (elements.length * (elements.length - 1)) / 2;
  const score =
    maxViolations > 0
      ? Math.max(0, 100 - (totalSpacingViolations / maxViolations) * 100)
      : 100;

  return { score, issues };
}

/**
 * Generate a visual test report from overlap analysis
 */
export function generateOverlapReport(
  cardNameOverlaps: OverlapResult[],
  allOverlaps: OverlapResult[],
  outsideViewport: Array<{ element: BoundingBox; outsidePercentage: number }>,
  touchTargetIssues: Array<{ element: BoundingBox; issue: string }>,
  crowdingAnalysis: { score: number; issues: string[] },
): string {
  let report = `# DOM Overlap Analysis Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;

  // Critical: Card/Name overlaps
  const significantCardNameOverlaps = cardNameOverlaps.filter(
    (o) => o.isSignificant,
  );
  if (significantCardNameOverlaps.length > 0) {
    report += `## 🔴 CRITICAL: Card/Name Overlaps\n\n`;
    for (const overlap of significantCardNameOverlaps) {
      report += `- ${overlap.description}\n`;
    }
    report += `\n`;
  }

  // Elements outside viewport
  if (outsideViewport.length > 0) {
    report += `## 🟠 Elements Outside Viewport\n\n`;
    for (const { element, outsidePercentage } of outsideViewport) {
      report += `- ${element.element || "Unknown element"}: ${outsidePercentage.toFixed(1)}% outside viewport\n`;
    }
    report += `\n`;
  }

  // Touch target issues
  if (touchTargetIssues.length > 0) {
    report += `## 🟡 Touch Target Issues\n\n`;
    for (const { element, issue } of touchTargetIssues) {
      report += `- ${element.element || "Unknown"}: ${issue}\n`;
    }
    report += `\n`;
  }

  // Crowding
  if (crowdingAnalysis.issues.length > 0) {
    report += `## 🟡 Crowding Issues (Score: ${crowdingAnalysis.score.toFixed(0)}/100)\n\n`;
    for (const issue of crowdingAnalysis.issues.slice(0, 10)) {
      report += `- ${issue}\n`;
    }
    if (crowdingAnalysis.issues.length > 10) {
      report += `- ... and ${crowdingAnalysis.issues.length - 10} more\n`;
    }
    report += `\n`;
  }

  // All other overlaps
  const otherSignificantOverlaps = allOverlaps.filter(
    (o) => o.isSignificant && !significantCardNameOverlaps.includes(o),
  );
  if (otherSignificantOverlaps.length > 0) {
    report += `## Other Overlaps\n\n`;
    for (const overlap of otherSignificantOverlaps) {
      report += `- ${overlap.description}\n`;
    }
    report += `\n`;
  }

  // Summary
  const totalIssues =
    significantCardNameOverlaps.length +
    outsideViewport.length +
    touchTargetIssues.length +
    otherSignificantOverlaps.length;

  report += `## Summary\n\n`;
  report += `- Critical issues: ${significantCardNameOverlaps.length}\n`;
  report += `- Major issues: ${outsideViewport.length}\n`;
  report += `- Minor issues: ${touchTargetIssues.length + otherSignificantOverlaps.length}\n`;
  report += `- Crowding score: ${crowdingAnalysis.score.toFixed(0)}/100\n`;
  report += `- **Total issues: ${totalIssues}**\n`;

  return report;
}
