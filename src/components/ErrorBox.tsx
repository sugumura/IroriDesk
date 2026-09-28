import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleAlert } from "lucide-react";
import type { AppError } from "@/lib/api";
import { cn } from "@/lib/utils";

const URL_RE = /(https?:\/\/[^\s"'<>]+)/g;

/** メッセージ中の URL をクリック可能にし、外部ブラウザで開く */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            className="break-all underline underline-offset-2"
            onClick={(e) => {
              e.preventDefault();
              void openUrl(part);
            }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function ErrorBox({ error, className }: { error: AppError; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive",
        className,
      )}
    >
      <div className="flex gap-2">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <div className="break-words whitespace-pre-wrap">
            <span className="font-mono text-xs opacity-70">[{error.code}]</span>{" "}
            <Linkified text={error.message} />
          </div>
          {error.detail && (
            <div className="font-mono text-xs break-words whitespace-pre-wrap opacity-80">
              <Linkified text={error.detail} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
