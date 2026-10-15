"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Link2, RefreshCw, Send, XCircle } from "lucide-react";
import { emailStatusKey, useEmailStatus } from "@/lib/queries/admin";
import { callFunction } from "@/lib/functions";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/misc";
import { SettingsCard } from "@/components/settings/switch";
import { cn, errorMessage, timeAgo } from "@/lib/utils";

function StatusLine({ ok, title, detail }: { ok: boolean; title: string; detail?: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon size={18} className={cn("mt-px shrink-0", ok ? "text-success" : "text-danger")} />
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {detail && <div className="mt-0.5 text-xs break-words text-muted">{detail}</div>}
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 py-px font-mono text-[12px] text-text">{children}</code>;
}

export function EmailTab() {
  const qc = useQueryClient();
  const { data: s, isLoading, error, isFetching } = useEmailStatus();
  const [busy, setBusy] = useState<"connect" | "test" | null>(null);

  const run = async (action: "connect-email" | "test-email", label: "connect" | "test", success: string) => {
    setBusy(label);
    try {
      await callFunction("admin", { action });
      toast.success(success);
      await qc.invalidateQueries({ queryKey: emailStatusKey });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <PageLoader />;
  if (error || !s) {
    return (
      <SettingsCard title="Email">
        <p className="py-3 text-sm text-danger">
          {errorMessage(error)} — the <Code>admin</Code> Edge Function may not be deployed yet (see the README).
        </p>
      </SettingsCard>
    );
  }

  const ready = s.emailConfigured && s.deliveryConnected;

  return (
    <div className="space-y-5">
      <SettingsCard
        title="Status"
        description={
          ready
            ? "Connected. Task updates go out hourly; daily updates around 8am."
            : "Finish the steps below to turn on email."
        }
        action={
          <Button variant="ghost" size="icon-sm" aria-label="Refresh status" onClick={() => qc.invalidateQueries({ queryKey: emailStatusKey })}>
            <RefreshCw size={14} className={cn(isFetching && "animate-spin")} />
          </Button>
        }
      >
        <div className="divide-y divide-border">
          <StatusLine
            ok={s.emailConfigured}
            title={s.emailConfigured ? "Email sending is configured" : "Email sending isn't configured"}
            detail={
              s.emailConfigured ? (
                <>
                  Links in emails point to <Code>{s.appUrl}</Code>.
                </>
              ) : (
                <>
                  Set the Gmail sender secrets (<Code>npm run setup:gmail</Code>) and <Code>APP_URL</Code>.
                </>
              )
            }
          />
          <StatusLine
            ok={s.deliveryConnected}
            title={s.deliveryConnected ? "Scheduled delivery is connected" : "Scheduled delivery isn't connected"}
            detail={s.deliveryConnected && s.connectedAt ? `Connected ${timeAgo(s.connectedAt)}.` : "Click “Connect email delivery” below."}
          />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border py-3">
          <Button
            variant="primary"
            onClick={() => run("connect-email", "connect", "Email delivery connected")}
            disabled={!!busy || !s.emailConfigured}
          >
            {busy === "connect" ? <Spinner size={14} className="text-current" /> : <Link2 size={14} />}
            {s.deliveryConnected ? "Reconnect email delivery" : "Connect email delivery"}
          </Button>
          <Button onClick={() => run("test-email", "test", "Test email sent to you")} disabled={!!busy || !s.emailConfigured}>
            {busy === "test" ? <Spinner size={14} className="text-current" /> : <Send size={14} />}
            Send test email to me
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
