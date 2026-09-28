import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function CopyButton({
  text,
  label: labelProp,
  className,
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const t = useT();
  const label = labelProp ?? t("common.copy");
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** 文字で内容を示すコピーボタン（フッターなどで使う） */
export function CopyTextButton({ text, children }: { text: string | (() => string); children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const t = useT();
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={async () => {
        await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? t("common.copied") : children}
    </Button>
  );
}
