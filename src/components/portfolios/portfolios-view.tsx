"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Briefcase, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { ColorSwatches, EmptyState, PageLoader, Spinner } from "@/components/ui/misc";
import { GoalProgress } from "@/components/goals/goal-bits";
import { useIsGuest, useMe } from "@/lib/queries/me";
import { useProfileMap } from "@/lib/queries/people";
import { useProjectStats } from "@/lib/queries/projects";
import { aggregateProgress, useCreatePortfolio, usePortfolios, type PortfolioItem } from "@/lib/queries/portfolios";
import { cn, colorHex, errorMessage } from "@/lib/utils";
import { routes } from "@/lib/routes";

export function PortfoliosView() {
  const isGuest = useIsGuest();
  if (isGuest) {
    return (
      <EmptyState
        icon={<Briefcase size={32} />}
        title="Portfolios are for members"
        description="Portfolios are shared with full members of the workspace."
      />
    );
  }
  return <PortfoliosInner />;
}

function PortfoliosInner() {
  const me = useMe();
  const { data: portfolios = [], isLoading } = usePortfolios();
  const [open, setOpen] = useState(false);
  const mine = portfolios.filter((p) => p.owner_id === me.id || p.members.some((m) => m.user_id === me.id));
  const others = portfolios.filter((p) => !mine.includes(p));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Portfolios</h1>
          <p className="text-sm text-muted">Monitor groups of related projects in one place.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={15} /> New portfolio
        </Button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : portfolios.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={32} />}
          title="No portfolios yet"
          description="Group projects into a portfolio to see status, progress and overdue work at a glance."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={15} /> New portfolio
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {mine.length > 0 && <Grid title="My portfolios" list={mine} />}
          {others.length > 0 && <Grid title="Other portfolios" list={others} />}
        </div>
      )}

      <CreatePortfolioDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Grid({ title, list }: { title: string; list: PortfolioItem[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <PortfolioCard key={p.id} portfolio={p} />
        ))}
      </div>
    </section>
  );
}

function PortfolioCard({ portfolio }: { portfolio: PortfolioItem }) {
  const { data: stats } = useProjectStats();
  const people = useProfileMap();
  const ids = portfolio.projects.map((p) => p.project_id);
  const progress = aggregateProgress(ids, stats);
  const owner = portfolio.owner_id ? people.get(portfolio.owner_id) : undefined;
  return (
    <Link
      href={routes.portfolio(portfolio.id)}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
          style={{ background: colorHex(portfolio.color) }}
        >
          <Briefcase size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium group-hover:underline">{portfolio.name}</span>
            {portfolio.is_private && <Lock size={12} className="shrink-0 text-faint" aria-label="Private" />}
          </div>
          <div className="text-xs text-muted">
            {ids.length} {ids.length === 1 ? "project" : "projects"}
          </div>
        </div>
        <Avatar profile={owner} size="xs" tooltip />
      </div>
      <GoalProgress value={progress} />
    </Link>
  );
}

function CreatePortfolioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New portfolio">
      {open && <CreatePortfolioForm onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function CreatePortfolioForm({ onDone }: { onDone: () => void }) {
  const me = useMe();
  const router = useRouter();
  const create = useCreatePortfolio();
  const [name, setName] = useState("");
  const [color, setColor] = useState("teal");
  const [isPrivate, setIsPrivate] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const p = await create.mutateAsync({ name: name.trim(), color, is_private: isPrivate, owner_id: me.id });
      onDone();
      router.push(routes.portfolio(p.id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="portfolio-name">Portfolio name</Label>
        <Input
          id="portfolio-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 2026 youth programs"
        />
      </div>
      <div>
        <Label>Color</Label>
        <ColorSwatches value={color} onChange={setColor} />
      </div>
      <PrivacyToggle value={isPrivate} onChange={setIsPrivate} />
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending && <Spinner size={14} className="text-current" />}
          Create portfolio
        </Button>
      </div>
    </form>
  );
}

export function PrivacyToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start gap-3 rounded-md border border-border p-3", !disabled && "cursor-pointer hover:bg-surface-2")}>
      <input
        type="checkbox"
        className="mt-0.5 accent-[var(--accent)]"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Lock size={13} /> Private
        </span>
        <span className="block text-xs text-muted">
          Only you, portfolio members and admins can see it. Otherwise every member can view it.
        </span>
      </span>
    </label>
  );
}
