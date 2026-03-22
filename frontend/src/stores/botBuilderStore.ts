import { create } from "zustand";
import { botsApi } from "../api/bots";

export type StrategyTier = "quick" | "strategy" | "pro";

export interface Personality {
  aggression: number;
  bluffFrequency: number;
  riskTolerance: number;
  tightness: number;
}

export interface PersonalityPreset {
  id: string;
  name: string;
  description: string;
  personality: Personality;
  styleDescription: string;
}

export type RangeAction = "raise" | "call" | "fold" | null;

export interface Rule {
  id: string;
  priority: number;
  conditions: Array<{
    category: string;
    field: string;
    operator: string;
    value: any;
  }>;
  action: {
    type: string;
    sizing?: { mode: string; value: number };
  };
  enabled: boolean;
  label?: string;
}

export interface BotStrategy {
  version: 1;
  tier: StrategyTier;
  personality: Personality;
  rules?: Record<string, Rule[]>;
  rangeChart?: Record<string, RangeAction>;
  positionOverrides?: Record<string, any>;
}

interface BotBuilderState {
  tier: StrategyTier;
  name: string;
  description: string;
  personality: Personality;
  presets: PersonalityPreset[];
  selectedPresetId: string | null;

  rules: Record<string, Rule[]>;
  activeStreet: string;
  rangeChart: Record<string, RangeAction>;

  positionOverrides: Record<string, any>;

  conditionFields: any[];

  saving: boolean;
  error: string | null;
  validationResult: any | null;

  setTier: (tier: StrategyTier) => void;
  setName: (name: string) => void;
  setDescription: (desc: string) => void;
  setPersonalityField: (field: keyof Personality, value: number) => void;
  setPreset: (presetId: string) => void;
  setActiveStreet: (street: string) => void;
  setRangeAction: (hand: string, action: RangeAction) => void;
  addRule: (street: string, rule: Rule) => void;
  updateRule: (street: string, ruleId: string, updates: Partial<Rule>) => void;
  removeRule: (street: string, ruleId: string) => void;
  reorderRules: (street: string, ruleIds: string[]) => void;

  loadPresets: () => Promise<void>;
  loadConditionFields: () => Promise<void>;
  buildStrategy: () => BotStrategy;
  saveBot: (token: string) => Promise<string>;
  reset: () => void;
}

const DEFAULT_PERSONALITY: Personality = {
  aggression: 50,
  bluffFrequency: 30,
  riskTolerance: 50,
  tightness: 50,
};

export const useBotBuilderStore = create<BotBuilderState>((set, get) => ({
  tier: "quick",
  name: "",
  description: "",
  personality: { ...DEFAULT_PERSONALITY },
  presets: [],
  selectedPresetId: null,

  rules: { preflop: [], flop: [], turn: [], river: [] },
  activeStreet: "preflop",
  rangeChart: {},

  positionOverrides: {},

  conditionFields: [],

  saving: false,
  error: null,
  validationResult: null,

  setTier: (tier) => set({ tier }),
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),

  setPersonalityField: (field, value) =>
    set((s) => ({
      personality: { ...s.personality, [field]: value },
      selectedPresetId: null,
    })),

  setPreset: (presetId) => {
    const preset = get().presets.find((p) => p.id === presetId);
    if (preset) {
      set({
        personality: { ...preset.personality },
        selectedPresetId: presetId,
      });
    }
  },

  setActiveStreet: (street) => set({ activeStreet: street }),

  setRangeAction: (hand, action) =>
    set((s) => ({
      rangeChart: { ...s.rangeChart, [hand]: action },
    })),

  addRule: (street, rule) =>
    set((s) => ({
      rules: {
        ...s.rules,
        [street]: [...(s.rules[street] || []), rule],
      },
    })),

  updateRule: (street, ruleId, updates) =>
    set((s) => ({
      rules: {
        ...s.rules,
        [street]: (s.rules[street] || []).map((r) =>
          r.id === ruleId ? { ...r, ...updates } : r,
        ),
      },
    })),

  removeRule: (street, ruleId) =>
    set((s) => ({
      rules: {
        ...s.rules,
        [street]: (s.rules[street] || []).filter((r) => r.id !== ruleId),
      },
    })),

  reorderRules: (street, ruleIds) =>
    set((s) => {
      const existing = s.rules[street] || [];
      const reordered = ruleIds
        .map((id, i) => {
          const rule = existing.find((r) => r.id === id);
          return rule ? { ...rule, priority: i } : null;
        })
        .filter(Boolean) as Rule[];
      return { rules: { ...s.rules, [street]: reordered } };
    }),

  loadPresets: async () => {
    try {
      const result = await botsApi.getPresets();
      set({ presets: result.presets });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadConditionFields: async () => {
    try {
      const result = await botsApi.getConditionFields();
      set({ conditionFields: result.fields });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  buildStrategy: () => {
    const s = get();
    const strategy: BotStrategy = {
      version: 1,
      tier: s.tier,
      personality: { ...s.personality },
    };

    if (s.tier !== "quick") {
      const hasRules = Object.values(s.rules).some((rules) => rules.length > 0);
      if (hasRules) {
        strategy.rules = { ...s.rules };
      }
      if (Object.keys(s.rangeChart).length > 0) {
        strategy.rangeChart = { ...s.rangeChart };
      }
    }

    if (s.tier === "pro" && Object.keys(s.positionOverrides).length > 0) {
      strategy.positionOverrides = { ...s.positionOverrides };
    }

    return strategy;
  },

  saveBot: async (token) => {
    const s = get();
    set({ saving: true, error: null });

    try {
      const strategy = s.buildStrategy();
      const result = await botsApi.createInternal(
        {
          name: s.name,
          strategy,
          description: s.description || undefined,
        },
        token,
      );
      set({ saving: false });
      return (result as any).id;
    } catch (e: any) {
      set({ saving: false, error: e.message || String(e) });
      throw e;
    }
  },

  reset: () =>
    set({
      tier: "quick",
      name: "",
      description: "",
      personality: { ...DEFAULT_PERSONALITY },
      selectedPresetId: null,
      rules: { preflop: [], flop: [], turn: [], river: [] },
      activeStreet: "preflop",
      rangeChart: {},
      positionOverrides: {},
      validationResult: null,
      error: null,
    }),
}));
