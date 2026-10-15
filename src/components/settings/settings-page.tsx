"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfile, useUpdateMyProfile } from "@/lib/queries/people";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Pill, Spinner } from "@/components/ui/misc";
import { cn, errorMessage } from "@/lib/utils";
import { SettingRow, SettingsCard, Switch } from "./switch";
import { SecurityCard } from "./security-card";
import type { Profile } from "@/types/models";
import { applyTheme, useTheme, type Theme } from "@/lib/theme";
import { signOut } from "@/lib/auth";

const ROLE_HINT: Record<Profile["role"], string> = {
  admin: "Admin — manages people and workspace settings",
  member: "Member — full access to the workspace",
  guest: "Guest — sees only projects and tasks shared with you",
};

export function SettingsPage() {
  const me = useMe();
  // Prefer the fresh copy from the profiles cache; the context copy is from page load.
  const profile = useProfile(me.id) ?? me;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold">Profile &amp; notifications</h1>
        <p className="text-sm text-muted">How you appear to teammates and how Seeds Tasks reaches you.</p>
      </div>
      <ProfileCard key={`${profile.full_name}|${profile.title ?? ""}`} profile={profile} />
      <NotificationsCard profile={profile} />
      <SecurityCard email={profile.email} />
      <AppearanceCard />
      <SettingsCard title="Session">
        <div className="flex items-center justify-between gap-4 py-3">
          <p className="text-sm text-muted">Sign out of Seeds Tasks on this device.</p>
          <Button onClick={() => signOut()}>
            <LogOut size={14} /> Sign out
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  const update = useUpdateMyProfile();
  const [name, setName] = useState(profile.full_name);
  const [title, setTitle] = useState(profile.title ?? "");
  const dirty = name.trim() !== profile.full_name || title.trim() !== (profile.title ?? "");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update.mutate(
      { id: profile.id, full_name: name.trim(), title: title.trim() || null },
      {
        onSuccess: () => toast.success("Profile saved"),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <SettingsCard title="Profile">
      <div className="flex flex-col gap-5 py-4 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2 sm:w-36">
          <Avatar profile={profile} size="xl" />
          <p className="text-center text-[11px] leading-snug text-faint">
            Your photo comes from your Google or Microsoft account. Change it there and it updates the next time you
            sign in.
          </p>
        </div>
        <form onSubmit={save} className="min-w-0 flex-1 space-y-3">
          <div>
            <Label htmlFor="profile-name">Full name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </div>
          <div>
            <Label htmlFor="profile-title">Job title</Label>
            <Input
              id="profile-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Program coordinator"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={profile.email} readOnly disabled />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Pill className="bg-accent-soft text-accent capitalize">{profile.role}</Pill>
              <span>{ROLE_HINT[profile.role]}</span>
            </div>
            <Button type="submit" variant="primary" disabled={!dirty || !name.trim() || update.isPending}>
              {update.isPending && <Spinner size={14} className="text-current" />}
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </SettingsCard>
  );
}

// Time zones are read on the client only so server and browser markup match.
const NO_ZONES: string[] = [];
let zonesCache: string[] | null = null;
const noopSubscribe = () => () => {};

function readZones() {
  if (!zonesCache) {
    try {
      zonesCache = Intl.supportedValuesOf("timeZone");
    } catch {
      zonesCache = NO_ZONES;
    }
  }
  return zonesCache;
}

function readDeviceZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

function NotificationsCard({ profile }: { profile: Profile }) {
  const update = useUpdateMyProfile();
  const zones = useSyncExternalStore(noopSubscribe, readZones, () => NO_ZONES);
  const guess = useSyncExternalStore(noopSubscribe, readDeviceZone, () => "");
  const current = profile.timezone ?? "";
  const options = current && !zones.includes(current) ? [current, ...zones] : zones;

  const save = (patch: Partial<Profile>, message: string) =>
    update.mutate(
      { id: profile.id, ...patch },
      {
        onSuccess: () => toast.success(message),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <SettingsCard title="Notifications" description="You always see notifications in your Inbox.">
      <div className="divide-y divide-border">
        <SettingRow
          htmlFor="email-notifications"
          title="Email notifications"
          description="An email within the hour when someone @mentions you, and a morning digest of anything still unread in your Inbox."
        >
          <Switch
            id="email-notifications"
            checked={profile.email_notifications}
            disabled={update.isPending}
            onChange={(v) => save({ email_notifications: v }, v ? "Email notifications on" : "Email notifications off")}
          />
        </SettingRow>
        <SettingRow
          htmlFor="timezone"
          title="Time zone"
          description={
            guess && guess !== current ? (
              <>
                Your morning digest arrives around 8am in this time zone. Your device is on{" "}
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => save({ timezone: guess }, `Time zone set to ${guess}`)}
                >
                  {guess}
                </button>
                .
              </>
            ) : (
              "Your morning digest arrives around 8am in this time zone."
            )
          }
        >
          <Select
            id="timezone"
            value={current}
            onChange={(e) => save({ timezone: e.target.value || null }, "Time zone saved")}
            className="w-full sm:w-64"
          >
            <option value="">Not set</option>
            {options.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </SettingRow>
      </div>
    </SettingsCard>
  );
}

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------
const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun size={16} /> },
  { value: "dark", label: "Dark", icon: <Moon size={16} /> },
  { value: "system", label: "System", icon: <Monitor size={16} /> },
];

function AppearanceCard() {
  const theme = useTheme();
  return (
    <SettingsCard title="Appearance" description="Saved on this device.">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 py-3">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={theme === t.value}
            onClick={() => applyTheme(t.value)}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm",
              theme === t.value ? "border-accent bg-accent-soft font-medium text-text" : "border-border text-muted hover:bg-surface-2",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </SettingsCard>
  );
}
