import { GoogleGenerativeAI } from "@google/generative-ai";

export interface GeminiAnalysis {
  designQuality: {
    score: number; // 1-10
    summary: string;
  };
  strengths: string[];
  improvements: Array<{
    area: string;
    issue: string;
    suggestion: string;
    priority: "high" | "medium" | "low";
  }>;
  uxIssues: Array<{
    category:
      | "accessibility"
      | "clarity"
      | "flow"
      | "aesthetics"
      | "performance";
    description: string;
    impact: string;
  }>;
  customerFeedback: string;
}

export async function analyzeScreenshot(
  imagePath: string,
): Promise<GeminiAnalysis> {
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("⚠️  GOOGLE_API_KEY not set — skipping Gemini analysis");
    return {
      designQuality: { score: 0, summary: "API key not set" },
      strengths: [],
      improvements: [],
      uxIssues: [],
      customerFeedback: "",
    };
  }

  try {
    const { readFileSync } = await import("fs");
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Read screenshot image as base64
    const imageData = readFileSync(imagePath, { encoding: "base64" });

    const prompt = `You are an expert UX/UI designer and customer experience specialist evaluating a professional poker game interface.

Analyze this poker game screenshot and provide DETAILED feedback on:

DESIGN QUALITY (rate 1-10):
- Visual aesthetics (colors, typography, spacing)
- Professional appearance
- Brand consistency
- Modern vs dated feel

STRENGTHS:
- What looks good about this UI?
- What would users appreciate?
- Best design decisions?

IMPROVEMENTS (prioritized):
- What needs to be better?
- Specific areas for improvement
- Why it matters for user experience

UX ISSUES:
- Accessibility problems (contrast, readability, screen readers)
- Clarity issues (is information hierarchy clear?)
- Flow problems (is the game progression easy to follow?)
- Aesthetic improvements needed
- Performance/animation suggestions

CUSTOMER FEEDBACK:
- How would a paying customer react?
- Would this keep them engaged?
- What would frustrate them?
- How likely would they recommend it?

Respond ONLY with valid JSON (no markdown):
{
  "designQuality": {"score": <1-10>, "summary": ""},
  "strengths": ["", ""],
  "improvements": [
    {"area": "", "issue": "", "suggestion": "", "priority": "high|medium|low"}
  ],
  "uxIssues": [
    {"category": "accessibility|clarity|flow|aesthetics|performance", "description": "", "impact": ""}
  ],
  "customerFeedback": ""
}`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageData,
          mimeType: "image/png",
        },
      },
    ]);

    const response = result.response.text();

    // Clean any markdown code fences
    const cleanJson = response
      .replace(/```json\n?/g, "")
      .replace(/\n?```/g, "")
      .trim();

    return JSON.parse(cleanJson);
  } catch (e) {
    console.warn(
      `⚠️  Gemini analysis failed for ${imagePath}:`,
      (e as Error).message,
    );
    return {
      designQuality: { score: 0, summary: "Analysis failed" },
      strengths: [],
      improvements: [],
      uxIssues: [],
      customerFeedback: "",
    };
  }
}

export async function analyzeScreenshotsWithRateLimit(
  screenshots: Array<{ path: string; state: any }>,
): Promise<GeminiAnalysis[]> {
  const results: GeminiAnalysis[] = [];

  for (let i = 0; i < screenshots.length; i++) {
    console.log(`  [${i + 1}/${screenshots.length}] Analyzing...`);
    const analysis = await analyzeScreenshot(screenshots[i].path);
    results.push(analysis);

    // Adaptive rate limiting: 3 seconds for later requests (less waiting)
    // Gemini free tier: 60 requests per minute = 1 per second acceptable
    // We use 3s to be safe but still faster than 4s
    if (i < screenshots.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  return results;
}
