"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { requestPasswordReset } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/misc";
import { MfaBadge, MfaEnroll, verifiedTotpFactor } from "@/components/auth/mfa";
import { errorMessage } from "@/lib/utils";
import { qk } from "@/lib/queries/keys";
import { SettingRow, SettingsCard } from "./switch";

/** Two-factor and password settings for the signed-in person. */
export function SecurityCard({ email }: { email: string }) {
  const qc = useQueryClient();
  const { data: factor } = useQuery({ queryKey: qk.mfaFactor, queryFn: verifiedTotpFactor });
  const { data: hasPassword } = useQuery({
    queryKey: qk.hasPassword,
    queryFn: async () => {
      const { data } = await createClient().auth.getUser();
      return !!data.user?.identities?.some((i) => i.provider === "email");
    },
  });
  const [replacing, setReplacing] = useState(false);
  const [sending, setSending] = useState(false);

  const sendPasswordLink = async () => {
    setSending(true);
    const { error } = await requestPasswordReset(email);
    setSending(false);
    if (error) toast.error(errorMessage(error));
    else toast.success(`We emailed ${email} a link to set a new password`);
  };

  return (
    <SettingsCard title="Security">
      <div className="divide-y divide-border">
        <SettingRow
          title="Two-factor sign-in"
          description="Required for everyone. If you get a new phone, set up your authenticator again here first."
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            {factor && <MfaBadge />}
            <Button size="sm" onClick={() => setReplacing(true)}>
              <RefreshCw size={14} /> Replace authenticator
            </Button>
          </div>
        </SettingRow>
        {hasPassword && (
          <SettingRow title="Password" description="We'll email you a link to choose a new password.">
            <Button size="sm" onClick={sendPasswordLink} disabled={sending}>
              {sending ? <Spinner size={14} /> : <KeyRound size={14} />} Change password
            </Button>
          </SettingRow>
        )}
      </div>
      {replacing && (
        <Dialog open onOpenChange={setReplacing} title="Replace your authenticator">
          <MfaEnroll
            replacing={factor?.id}
            onDone={() => {
              setReplacing(false);
              qc.invalidateQueries({ queryKey: qk.mfaFactor });
              toast.success("New authenticator is set up");
            }}
          />
        </Dialog>
      )}
    </SettingsCard>
  );
}
