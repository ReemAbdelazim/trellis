"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Camera, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { isUploadedPhoto, useProfile, useSetMyPhoto, useUpdateMyProfile } from "@/lib/queries/people";
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
import { createClient } from "@/lib/supabase/client";
import { routes, type SettingsTab } from "@/lib/routes";

const ROLE_HINT: Record<Profile["role"], string> = {
  admin: "Admin — manages people and workspace settings",
  member: "Member — full access to the workspace",
  guest: "Guest — sees only projects and tasks shared with you",
};

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "account", label: "Account" },
  { id: "display", label: "Display" },
] as const satisfies { id: SettingsTab; label: string }[];

export function SettingsPage() {
  const me = useMe();
  // Prefer the fresh copy from the profiles cache; the context copy is from page load.
  const profile = useProfile(me.id) ?? me;
  const params = useSearchParams();
  const router = useRouter();
  const tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "profile";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <nav role="tablist" aria-label="Settings" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => router.replace(routes.settingsTab(t.id), { scroll: false })}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm",
              tab === t.id ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "profile" && <ProfileCard key={`${profile.full_name}|${profile.title ?? ""}`} profile={profile} />}
      {tab === "notifications" && <NotificationsCard profile={profile} />}
      {tab === "account" && (
        <>
          <SecurityCard email={profile.email} />
          <SessionsCard />
        </>
      )}
      {tab === "display" && <AppearanceCard />}
    </div>
  );
}

/** "Mary Ann Smith" → ["Mary Ann", "Smith"]. */
function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts.length < 2 ? [parts[0] ?? "", ""] : [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

function ProfileCard({ profile }: { profile: Profile }) {
  const update = useUpdateMyProfile();
  const [initialFirst, initialLast] = splitName(profile.full_name);
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [title, setTitle] = useState(profile.title ?? "");
  const fullName = `${first.trim()} ${last.trim()}`.trim();
  const dirty = fullName !== profile.full_name || title.trim() !== (profile.title ?? "");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName) return;
    update.mutate(
      { id: profile.id, full_name: fullName, title: title.trim() || null },
      {
        onSuccess: () => toast.success("Profile saved"),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <SettingsCard title="Profile">
      <div className="flex flex-col gap-5 py-4 sm:flex-row">
        <PhotoEditor profile={profile} />
        <form onSubmit={save} className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="profile-first">First name</Label>
              <Input
                id="profile-first"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                maxLength={60}
                autoComplete="given-name"
                required
              />
            </div>
            <div>
              <Label htmlFor="profile-last">Last name</Label>
              <Input
                id="profile-last"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                maxLength={60}
                autoComplete="family-name"
              />
            </div>
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
            <Button type="submit" variant="primary" disabled={!dirty || !fullName || update.isPending}>
              {update.isPending && <Spinner size={14} className="text-current" />}
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </SettingsCard>
  );
}

function PhotoEditor({ profile }: { profile: Profile }) {
  const setPhoto = useSetMyPhoto();
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current?.click();

  const change = (file: File | null) =>
    setPhoto.mutate(
      { id: profile.id, file },
      {
        onSuccess: () => toast.success(file ? "Photo updated" : "Photo removed"),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 sm:w-36">
      <button type="button" onClick={pick} disabled={setPhoto.isPending} aria-label="Change photo" className="relative rounded-full">
        <Avatar profile={profile} size="xl" />
        {setPhoto.isPending && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <Spinner size={18} className="text-white" />
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) change(file);
        }}
      />
      <Button size="xs" variant="ghost" onClick={pick} disabled={setPhoto.isPending}>
        <Camera size={13} /> {profile.avatar_url ? "Change photo" : "Upload photo"}
      </Button>
      {isUploadedPhoto(profile.avatar_url) && (
        <Button size="xs" variant="ghost" className="text-muted" onClick={() => change(null)} disabled={setPhoto.isPending}>
          Remove photo
        </Button>
      )}
    </div>
  );
}

function SessionsCard() {
  const [busy, setBusy] = useState(false);
  const signOutOthers = async () => {
    setBusy(true);
    const { error } = await createClient().auth.signOut({ scope: "others" });
    setBusy(false);
    if (error) toast.error(errorMessage(error));
    else toast.success("Signed out of every other device");
  };

  return (
    <SettingsCard title="Sessions">
      <div className="divide-y divide-border">
        <SettingRow title="Other devices" description="Sign out everywhere except this browser, e.g. after using a shared computer.">
          <Button size="sm" onClick={signOutOthers} disabled={busy}>
            {busy && <Spinner size={14} />} Sign out other sessions
          </Button>
        </SettingRow>
        <SettingRow title="This device" description="To leave the workspace, ask an admin to deactivate your account.">
          <Button size="sm" onClick={() => signOut()}>
            <LogOut size={14} /> Sign out
          </Button>
        </SettingRow>
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

/** Matches the kinds read by supabase/functions/notifications. */
const EMAIL_KINDS = [
  { key: "mentions", title: "Mentions", description: "Someone @mentions you in a comment or description." },
  { key: "assigned", title: "Assignments", description: "Someone assigns you a task." },
  { key: "comments", title: "Comments", description: "New comments on tasks you follow. One email thread per task." },
  { key: "daily", title: "Daily update", description: "Tasks due soon or overdue, around 8am." },
  { key: "invites", title: "Accepted invites", description: "Someone you invited joins." },
] as const;

function NotificationsCard({ profile }: { profile: Profile }) {
  const update = useUpdateMyProfile();
  const zones = useSyncExternalStore(noopSubscribe, readZones, () => NO_ZONES);
  const guess = useSyncExternalStore(noopSubscribe, readDeviceZone, () => "");
  const current = profile.timezone ?? "";
  const options = current && !zones.includes(current) ? [current, ...zones] : zones;
  const prefs = (profile.email_prefs ?? {}) as Record<string, boolean>;

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
        <SettingRow htmlFor="email-notifications" title="Email notifications" description="Turn off to stop every email below.">
          <Switch
            id="email-notifications"
            checked={profile.email_notifications}
            disabled={update.isPending}
            onChange={(v) => save({ email_notifications: v }, v ? "Email notifications on" : "Email notifications off")}
          />
        </SettingRow>
        {EMAIL_KINDS.map((kind) => (
          <SettingRow key={kind.key} htmlFor={`email-${kind.key}`} title={kind.title} description={kind.description} inset>
            <Switch
              id={`email-${kind.key}`}
              checked={profile.email_notifications && prefs[kind.key] !== false}
              disabled={update.isPending || !profile.email_notifications}
              onChange={(v) => save({ email_prefs: { ...prefs, [kind.key]: v } }, `${kind.title} emails ${v ? "on" : "off"}`)}
            />
          </SettingRow>
        ))}
        <SettingRow
          htmlFor="timezone"
          title="Time zone"
          description={
            guess && guess !== current ? (
              <>
                Your daily update arrives around 8am in this time zone. Your device is on{" "}
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
              "Your daily update arrives around 8am in this time zone."
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
    <SettingsCard title="Theme" description="Saved on this device.">
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
