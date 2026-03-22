import { useState, useCallback } from "react";
import { useBotBuilderStore, type Rule } from "../../stores/botBuilderStore";

const STREETS = ["preflop", "flop", "turn", "river"];

const STREET_LABELS: Record<string, string> = {
  preflop: "Pre-Flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

const ACTION_TYPES = [
  { value: "fold", label: "Fold" },
  { value: "check", label: "Check" },
  { value: "call", label: "Call" },
  { value: "raise", label: "Raise" },
  { value: "all_in", label: "All-In" },
];

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "in", label: "is one of" },
];

let ruleCounter = 0;

export function RuleBuilder() {
  const {
    rules,
    activeStreet,
    setActiveStreet,
    addRule,
    updateRule,
    removeRule,
    conditionFields,
  } = useBotBuilderStore();

  const streetRules = rules[activeStreet] || [];

  const handleAddRule = useCallback(() => {
    ruleCounter++;
    const newRule: Rule = {
      id: `rule-${Date.now()}-${ruleCounter}`,
      priority: streetRules.length,
      conditions: [],
      action: { type: "fold" },
      enabled: true,
      label: `New Rule ${streetRules.length + 1}`,
    };
    addRule(activeStreet, newRule);
  }, [activeStreet, streetRules.length, addRule]);

  const availableFields = conditionFields.filter(
    (f: any) =>
      !f.streets || f.streets.length === 0 || f.streets.includes(activeStreet),
  );

  return (
    <div className="space-y-4">
      {/* Street tabs */}
      <div className="flex gap-1 bg-[var(--surface)] rounded-lg p-1">
        {STREETS.map((street) => {
          const count = (rules[street] || []).length;
          return (
            <button
              key={street}
              onClick={() => setActiveStreet(street)}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                ${
                  activeStreet === street
                    ? "bg-[var(--poker-gold)] text-black"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
            >
              {STREET_LABELS[street]}
              {count > 0 && (
                <span className="ml-1.5 text-xs opacity-70">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {streetRules.map((rule, index) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            index={index}
            availableFields={availableFields}
            onUpdate={(updates) => updateRule(activeStreet, rule.id, updates)}
            onRemove={() => removeRule(activeStreet, rule.id)}
          />
        ))}
      </div>

      <button
        onClick={handleAddRule}
        className="w-full py-2 border border-dashed border-[var(--line)] rounded-lg
          text-sm text-[var(--text-muted)] hover:text-[var(--poker-gold)]
          hover:border-[var(--poker-gold)] transition-colors"
      >
        + Add Rule
      </button>

      {streetRules.length === 0 && (
        <p className="text-xs text-[var(--text-subtle)] text-center py-4">
          No rules for {STREET_LABELS[activeStreet]} yet. Rules are optional
          &mdash; the personality sliders handle any situation without a
          matching rule.
        </p>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  index,
  availableFields,
  onUpdate,
  onRemove,
}: {
  rule: Rule;
  index: number;
  availableFields: any[];
  onUpdate: (updates: Partial<Rule>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-all
        ${
          rule.enabled
            ? "border-[var(--line)] bg-[var(--surface-light)]"
            : "border-[var(--line)] bg-[var(--surface)] opacity-60"
        }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)]">
        <span className="text-xs font-mono text-[var(--text-subtle)] w-6">
          #{index + 1}
        </span>
        <input
          type="text"
          value={rule.label || ""}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="flex-1 bg-transparent text-sm text-[var(--text-primary)]
            border-none outline-none placeholder:text-[var(--text-subtle)]"
          placeholder="Rule name..."
        />
        <button
          onClick={() => onUpdate({ enabled: !rule.enabled })}
          className={`text-xs px-2 py-0.5 rounded transition-colors
            ${
              rule.enabled
                ? "bg-[var(--success)]/20 text-[var(--success)]"
                : "bg-[var(--surface-light)] text-[var(--text-muted)]"
            }`}
        >
          {rule.enabled ? "ON" : "OFF"}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {expanded ? "▲" : "▼"}
        </button>
        <button
          onClick={onRemove}
          className="text-xs text-[var(--error)] hover:text-red-300"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="px-3 py-3 space-y-3">
          {/* Conditions */}
          <div>
            <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">
              IF all of these are true:
            </p>
            {rule.conditions.map((cond, ci) => (
              <ConditionRow
                key={ci}
                condition={cond}
                availableFields={availableFields}
                onUpdate={(updates) => {
                  const newConditions = [...rule.conditions];
                  newConditions[ci] = { ...newConditions[ci], ...updates };
                  onUpdate({ conditions: newConditions });
                }}
                onRemove={() => {
                  const newConditions = rule.conditions.filter(
                    (_, i) => i !== ci,
                  );
                  onUpdate({ conditions: newConditions });
                }}
              />
            ))}
            <button
              onClick={() => {
                const firstField = availableFields[0];
                onUpdate({
                  conditions: [
                    ...rule.conditions,
                    {
                      category: firstField?.category || "hand",
                      field: firstField?.field || "handStrength",
                      operator: "eq",
                      value: firstField?.enumValues?.[0] || "",
                    },
                  ],
                });
              }}
              className="text-xs text-[var(--poker-gold)] hover:underline mt-1"
            >
              + Add condition
            </button>
          </div>

          {/* Action */}
          <div>
            <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">
              THEN:
            </p>
            <div className="flex items-center gap-2">
              <select
                value={rule.action.type}
                onChange={(e) =>
                  onUpdate({
                    action: {
                      ...rule.action,
                      type: e.target.value,
                      sizing:
                        e.target.value === "raise"
                          ? rule.action.sizing || {
                              mode: "bb_multiple",
                              value: 3,
                            }
                          : undefined,
                    },
                  })
                }
                className="input-field text-sm py-1 px-2"
              >
                {ACTION_TYPES.map((at) => (
                  <option key={at.value} value={at.value}>
                    {at.label}
                  </option>
                ))}
              </select>

              {rule.action.type === "raise" && rule.action.sizing && (
                <>
                  <select
                    value={rule.action.sizing.mode}
                    onChange={(e) =>
                      onUpdate({
                        action: {
                          ...rule.action,
                          sizing: {
                            ...rule.action.sizing!,
                            mode: e.target.value,
                          },
                        },
                      })
                    }
                    className="input-field text-sm py-1 px-2"
                  >
                    <option value="bb_multiple">x Big Blind</option>
                    <option value="pot_fraction">x Pot</option>
                    <option value="previous_bet_multiple">
                      x Previous Bet
                    </option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                  <input
                    type="number"
                    value={rule.action.sizing.value}
                    onChange={(e) =>
                      onUpdate({
                        action: {
                          ...rule.action,
                          sizing: {
                            ...rule.action.sizing!,
                            value: Number(e.target.value),
                          },
                        },
                      })
                    }
                    min={0.1}
                    step={0.5}
                    className="input-field text-sm py-1 px-2 w-20"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConditionRow({
  condition,
  availableFields,
  onUpdate,
  onRemove,
}: {
  condition: any;
  availableFields: any[];
  onUpdate: (updates: any) => void;
  onRemove: () => void;
}) {
  const selectedField = availableFields.find(
    (f: any) =>
      f.category === condition.category && f.field === condition.field,
  );

  return (
    <div className="flex items-center gap-2 mb-1.5">
      <select
        value={`${condition.category}.${condition.field}`}
        onChange={(e) => {
          const [cat, field] = e.target.value.split(".");
          const fieldDef = availableFields.find(
            (f: any) => f.category === cat && f.field === field,
          );
          onUpdate({
            category: cat,
            field,
            value:
              fieldDef?.enumValues?.[0] || fieldDef?.type === "boolean"
                ? true
                : 0,
          });
        }}
        className="input-field text-xs py-1 px-2 flex-1"
      >
        {availableFields.map((f: any) => (
          <option
            key={`${f.category}.${f.field}`}
            value={`${f.category}.${f.field}`}
          >
            {f.label}
          </option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onUpdate({ operator: e.target.value })}
        className="input-field text-xs py-1 px-2 w-24"
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {selectedField?.type === "boolean" ? (
        <select
          value={String(condition.value)}
          onChange={(e) => onUpdate({ value: e.target.value === "true" })}
          className="input-field text-xs py-1 px-2 w-20"
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : selectedField?.type === "enum" ? (
        <select
          value={condition.value}
          onChange={(e) => onUpdate({ value: e.target.value })}
          className="input-field text-xs py-1 px-2 flex-1"
        >
          {(selectedField.enumValues || []).map((v: string) => (
            <option key={v} value={v}>
              {v.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          value={condition.value}
          onChange={(e) => onUpdate({ value: Number(e.target.value) })}
          className="input-field text-xs py-1 px-2 w-20"
        />
      )}

      <button
        onClick={onRemove}
        className="text-xs text-[var(--error)] hover:text-red-300 px-1"
      >
        ✕
      </button>
    </div>
  );
}
