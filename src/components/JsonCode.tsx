import { useMemo } from "react";
import { highlightJson } from "@/lib/highlight";
import { cn } from "@/lib/utils";

/** シンタックスハイライト付きの JSON 表示。text は整形済みの JSON 文字列 */
export function JsonCode({ text, className }: { text: string; className?: string }) {
  // highlightJson はすべての部分を HTML エスケープするため、innerHTML に渡してよい
  const html = useMemo(() => highlightJson(text), [text]);
  return (
    <pre
      className={cn("font-mono text-xs leading-relaxed select-text", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
