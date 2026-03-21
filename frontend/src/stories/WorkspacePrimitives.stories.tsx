import type { Meta, StoryObj } from "@storybook/react";
import {
  AlertBanner,
  Button,
  MetricCard,
  PageHeader,
  SegmentedTabs,
  StatusPill,
  SurfaceCard,
} from "../components/ui/primitives";

const meta = {
  title: "Workspace/Primitives",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="min-h-screen bg-shell-gradient p-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader
          eyebrow="Design system"
          title="Workspace primitives"
          description="Core building blocks used across the redesigned product shell, lobbies, and gameplay surfaces."
          actions={
            <>
              <Button>Primary action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Live tables"
            value="14"
            hint="Currently streaming"
            accent
          />
          <MetricCard
            label="Active bots"
            value="128"
            hint="Validated endpoints"
          />
          <MetricCard
            label="Hands dealt"
            value="1.2M"
            hint="Lifetime sample size"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <StatusPill label="running" tone="success" pulse />
          <StatusPill label="registering" tone="info" />
          <StatusPill label="paused" tone="neutral" />
          <StatusPill label="cancelled" tone="danger" />
        </div>

        <SegmentedTabs
          value="information"
          onChange={() => undefined}
          items={[
            { value: "information", label: "Information" },
            { value: "players", label: "Players" },
            { value: "prizes", label: "Prizes" },
          ]}
        />

        <AlertBanner title="Warning pattern" tone="warning">
          API key rotation immediately invalidates the existing credential.
        </AlertBanner>

        <SurfaceCard>
          <div className="space-y-2">
            <div className="eyebrow-label">Surface card</div>
            <h3 className="text-xl font-semibold text-white">
              Reusable panel treatment
            </h3>
            <p className="text-sm leading-6 text-slate-400">
              This surface underpins lobby cards, profile panels, and analytics
              modules.
            </p>
          </div>
        </SurfaceCard>
      </div>
    </div>
  ),
};
