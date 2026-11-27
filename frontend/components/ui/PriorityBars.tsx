// Three small bars, filled from the left: one for low, two for medium, three
// for high. Says the priority level without relying on colour. Drawn in
// currentColor. Used on task cards and in the new task form.

import type { TaskPriority } from "@/lib/types";

const filled: Record<TaskPriority, number> = { low: 1, medium: 2, high: 3 };

export function PriorityBars({ priority, className = "h-3 w-3" }: { priority: TaskPriority; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1 + i * 3.7} y={8 - i * 3} width="2.6" height={3 + i * 3} rx="0.8" fill="currentColor" opacity={i < filled[priority] ? 1 : 0.25} />
      ))}
    </svg>
  );
}
