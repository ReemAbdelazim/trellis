"use client";

import { User } from "lucide-react";
import { cn, hashColor, initials } from "@/lib/utils";
import { Tooltip } from "./tooltip";
import type { Profile } from "@/types/models";

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-16 w-16 text-lg",
} as const;

export function Avatar({
  profile,
  size = "sm",
  className,
  tooltip = false,
}: {
  profile?: Pick<Profile, "id" | "full_name" | "email" | "avatar_url"> | null;
  size?: keyof typeof SIZES;
  className?: string;
  tooltip?: boolean;
}) {
  const inner = !profile ? (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-faint",
        SIZES[size],
        className,
      )}
    >
      <User size={size === "xs" || size === "sm" ? 11 : 14} />
    </span>
  ) : profile.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatar_url}
      alt={profile.full_name || profile.email}
      referrerPolicy="no-referrer"
      className={cn("inline-block shrink-0 rounded-full object-cover", SIZES[size], className)}
    />
  ) : (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        SIZES[size],
        className,
      )}
      style={{ background: hashColor(profile.id) }}
    >
      {initials(profile.full_name, profile.email)}
    </span>
  );
  if (!tooltip || !profile) return inner;
  return <Tooltip content={profile.full_name || profile.email}>{inner}</Tooltip>;
}

export function AvatarStack({
  profiles,
  max = 4,
  size = "sm",
}: {
  profiles: (Profile | undefined)[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const list = profiles.filter(Boolean) as Profile[];
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} profile={p} size={size} tooltip className="ring-2 ring-surface" />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-surface-3 font-medium text-muted ring-2 ring-surface",
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
