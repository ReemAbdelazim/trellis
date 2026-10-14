"use client";

import {
  closestCenter,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { BUCKET_DROP_PREFIX } from "./buckets";

/**
 * Mouse drags start after a few pixels (so clicks still open the task);
 * touch drags need a long-press so the page can still scroll on phones.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );
}

/** Prefer the task under the pointer, then the bucket under it, then the nearest item. */
export const bucketCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const task = hits.find((c) => !String(c.id).startsWith(BUCKET_DROP_PREFIX));
  if (task) return [task];
  if (hits.length) return hits;
  return closestCenter(args);
};
