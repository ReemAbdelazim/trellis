"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type Table =
  | "tasks"
  | "sections"
  | "comments"
  | "task_activity"
  | "attachments"
  | "task_field_values"
  | "notifications"
  | "task_followers"
  | "task_dependencies"
  | "projects";

const FALLBACK_POLL_MS = 30_000;

interface Options {
  table: Table;
  /** PostgREST-style filter, e.g. `project_id=eq.<uuid>` */
  filter?: string;
  /** Query keys to invalidate when a change arrives. */
  invalidate: QueryKey[];
  enabled?: boolean;
}

/**
 * Subscribe to row changes (RLS-filtered by Supabase Realtime) and invalidate
 * the given queries. Bursts are coalesced so bulk edits refetch once.
 */
export function useRealtime({ table, filter, invalidate, enabled = true }: Options) {
  const qc = useQueryClient();
  const keysRef = useRef(invalidate);
  useEffect(() => {
    keysRef.current = invalidate;
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        keysRef.current.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      }, 250);
    };
    // If live updates are unavailable (e.g. the plan's connection limit is reached),
    // fall back to refreshing on a timer until the channel connects again.
    let poll: ReturnType<typeof setInterval> | undefined;
    const startPolling = () => {
      poll ??= setInterval(refresh, FALLBACK_POLL_MS);
    };
    const stopPolling = () => {
      clearInterval(poll);
      poll = undefined;
    };

    const channel = supabase
      .channel(`rt:${table}:${filter ?? "all"}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, refresh);
    // Deletes can't be filtered by column, so listen for them separately.
    if (filter) channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, refresh);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") stopPolling();
      else startPolling();
    });
    return () => {
      clearTimeout(timer);
      stopPolling();
      supabase.removeChannel(channel);
    };
  }, [qc, table, filter, enabled]);
}
