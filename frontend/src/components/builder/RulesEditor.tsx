import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import RuleCard from './RuleCard'

type Street = 'preflop' | 'flop' | 'turn' | 'river'
type ConditionCategory = 'hand' | 'board' | 'opponent' | 'position' | 'stack' | 'pot'
type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between'
type ConditionValue = string | number | boolean | string[] | number[] | [number, number]

interface Condition {
  category: ConditionCategory
  field: string
  operator: ConditionOperator
  value: ConditionValue
}

type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in'
type SizingMode = 'pot_fraction' | 'bb_multiple' | 'previous_bet_multiple' | 'fixed'

interface ActionDefinition {
  type: ActionType
  sizing?: { mode: SizingMode; value: number }
}

interface Rule {
  id: string
  priority: number
  conditions: Condition[]
  action: ActionDefinition
  enabled: boolean
  label?: string
}

interface StreetRules {
  preflop?: Rule[]
  flop?: Rule[]
  turn?: Rule[]
  river?: Rule[]
}

interface ConditionFieldDef {
  category: ConditionCategory
  field: string
  type: 'enum' | 'number' | 'boolean'
  label: string
  description: string
  enumValues?: string[]
  min?: number
  max?: number
  tier: string
  streets?: Street[]
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#0a0a1a',
  card: '#13132a',
  cardHover: '#161630',
  border: '#1e1e3f',
  accent: '#00e5ff',
  text: '#ffffff',
  muted: '#9ca3af',
  danger: '#e24b4a',
  font: "'Trebuchet MS', sans-serif",
}

// ─── Types ────────────────────────────────────────────────────────────────

interface RulesEditorProps {
  rules: StreetRules | undefined
  fields: ConditionFieldDef[]
  onChange: (rules: StreetRules) => void
}

// ─── Sortable rule card wrapper ───────────────────────────────────────────────

interface SortableRuleCardProps {
  rule: Rule
  index: number
  fields: ConditionFieldDef[]
  onChange: (rule: Rule) => void
  onDelete: () => void
}

function SortableRuleCard({ rule, index, fields, onChange, onDelete }: SortableRuleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        marginBottom: '0.5rem',
      }}
    >
      {/* Priority badge + drag handle row */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', gap: '0.5rem' }}>
        <span
          {...attributes}
          {...listeners}
          style={{
            cursor: 'grab',
            color: C.muted,
            fontSize: '1.1rem',
            lineHeight: 1,
            padding: '0.25rem',
            userSelect: 'none',
          }}
          title="Drag to reorder"
        >
          ⠿
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: C.muted, fontFamily: C.font }}>
          #{index + 1}
        </span>
      </div>
      <RuleCard
        rule={rule}
        fields={fields}
        onChange={onChange}
        onDelete={onDelete}
      />
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export default function RulesEditor({ rules = {}, fields, onChange }: RulesEditorProps) {
  const [activeStreet, setActiveStreet] = useState<Street>('preflop')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const currentRules = rules[activeStreet] || []

  const handleUpdateRules = (newRules: Rule[]) => {
    const updated = {
      ...rules,
      [activeStreet]: newRules.length > 0 ? newRules : undefined,
    }
    onChange(updated)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = currentRules.findIndex((r) => r.id === active.id)
    const newIndex = currentRules.findIndex((r) => r.id === over.id)
    const reordered = arrayMove(currentRules, oldIndex, newIndex).map((r, i) => ({ ...r, priority: i }))
    handleUpdateRules(reordered)
  }

  const handleUpdateRule = (index: number, rule: Rule) => {
    const newRules = [...currentRules]
    newRules[index] = rule
    handleUpdateRules(newRules)
  }

  const handleDeleteRule = (index: number) => {
    const newRules = currentRules.filter((_, i) => i !== index)
    handleUpdateRules(newRules)
  }

  const handleAddRule = () => {
    const newRule: Rule = {
      id: uuidv4(),
      priority: currentRules.length,
      conditions: [],
      action: { type: 'fold' },
      enabled: true,
    }
    handleUpdateRules([...currentRules, newRule])
  }

  return (
    <div>
      {/* Street tabs */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1.5rem',
          borderBottom: `1px solid ${C.border}`,
          paddingBottom: '1rem',
        }}
      >
        {(['preflop', 'flop', 'turn', 'river'] as const).map((street) => (
          <button
            key={street}
            onClick={() => setActiveStreet(street)}
            style={{
              padding: '0.75rem 1rem',
              background:
                activeStreet === street ? C.accent : 'transparent',
              color: activeStreet === street ? C.bg : C.text,
              border: `1px solid ${activeStreet === street ? C.accent : C.border}`,
              borderRadius: '0.375rem',
              fontFamily: C.font,
              fontSize: '1rem',
              fontWeight: activeStreet === street ? 'bold' : 'normal',
              letterSpacing: activeStreet === street ? '0.02em' : 'normal',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textTransform: 'capitalize',
            }}
          >
            {street}
          </button>
        ))}
      </div>

      {/* Rules list */}
      <div>
        {currentRules.length === 0 ? (
          <div
            style={{
              border: `2px dashed ${C.border}`,
              borderRadius: '0.75rem',
              padding: '2.5rem',
              textAlign: 'center',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📜</div>
            <div style={{ fontSize: '0.875rem', color: C.text, fontWeight: 600, marginBottom: '0.25rem' }}>
              No rules yet for {activeStreet}
            </div>
            <div style={{ fontSize: '0.75rem', color: C.muted }}>
              Add your first strategic rule to override the base persona.
            </div>
            <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: '0.25rem', opacity: 0.7 }}>
              Rules are evaluated top-to-bottom; first match wins.
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: C.muted, marginBottom: '0.5rem', fontFamily: C.font }}>
              ↕ Drag to reorder — top rule wins on first match
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={currentRules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                {currentRules.map((rule, index) => (
                  <SortableRuleCard
                    key={rule.id}
                    rule={rule}
                    index={index}
                    fields={fields}
                    onChange={(updatedRule) => handleUpdateRule(index, updatedRule)}
                    onDelete={() => handleDeleteRule(index)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Add rule button */}
        <button
          onClick={handleAddRule}
          style={{
            width: '100%',
            padding: '1rem',
            background: 'transparent',
            border: `2px dashed ${C.accent}`,
            color: C.accent,
            borderRadius: '0.5rem',
            fontFamily: C.font,
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginTop: '0.5rem',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${C.accent}10`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          + Add {activeStreet} Rule
        </button>
      </div>
    </div>
  )
}
