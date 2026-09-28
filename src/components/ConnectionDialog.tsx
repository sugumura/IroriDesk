import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ConnectionConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AccountPicker } from "./AccountPicker";

function blankConnection(): ConnectionConfig {
  return {
    id: crypto.randomUUID(),
    name: "",
    projectId: "",
    databaseId: "(default)",
    quotaProject: "",
    readOnly: true,
    kind: "production",
    emulatorHost: "localhost:8080",
    authEmulatorHost: "localhost:9099",
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-x-3 gap-y-1">
      <Label className="pt-2 text-muted-foreground">{label}</Label>
      <div className="space-y-1">
        {children}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function ConnectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const upsert = useStore((s) => s.upsertConnection);
  const remove = useStore((s) => s.deleteConnection);
  const setActive = useStore((s) => s.setActiveConnection);
  const [draft, setDraftState] = useState<ConnectionConfig>(blankConnection);
  // WebView では window.confirm が使えないため、削除は2回クリックで確定する
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setDraft = (d: ConnectionConfig | ((prev: ConnectionConfig) => ConnectionConfig)) => {
    setDraftState(d);
    setConfirmDelete(false);
  };

  useEffect(() => {
    if (open) {
      setDraft(connections.find((c) => c.id === activeId) ?? blankConnection());
    }
    // ダイアログを開いたときだけ初期化する
  }, [open]);

  const isNew = !connections.some((c) => c.id === draft.id);
  const valid = draft.name.trim() !== "" && draft.projectId.trim() !== "";
  const update = <K extends keyof ConnectionConfig>(k: K, v: ConnectionConfig[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = () => {
    // 以前の版でオフにして保存された接続も、保存時にオンへ戻す
    const conn = {
      ...draft,
      name: draft.name.trim(),
      projectId: draft.projectId.trim(),
      readOnly: true,
    };
    upsert(conn);
    if (isNew || !activeId) setActive(conn.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("connection.manage")}</DialogTitle>
          <DialogDescription>
            {t("connection.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[200px_1fr] gap-4">
          <div className="flex flex-col gap-1 border-r pr-3">
            {connections.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  "truncate rounded px-2 py-1 text-left hover:bg-muted",
                  c.id === draft.id && "bg-accent font-medium",
                )}
                onClick={() => setDraft(c)}
              >
                {c.name}
                <span className="ml-1 text-xs text-muted-foreground">
                  {c.kind === "emulator" ? t("connection.kindEmulator") : ""}
                </span>
              </button>
            ))}
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setDraft(blankConnection())}>
              <Plus /> {t("connection.newConnection")}
            </Button>
          </div>

          <div className="space-y-3">
            <Field label={t("connection.displayName")}>
              <Input value={draft.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <Field label={t("connection.kind")}>
              <Select value={draft.kind} onValueChange={(v) => update("kind", v as ConnectionConfig["kind"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">{t("connection.kindProduction")}</SelectItem>
                  <SelectItem value="emulator">{t("connection.kindEmulator")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("connection.projectId")}>
              <Input value={draft.projectId} onChange={(e) => update("projectId", e.target.value)} />
            </Field>
            <Field label={t("connection.databaseId")} hint={t("connection.databaseIdHint")}>
              <Input
                value={draft.databaseId ?? ""}
                placeholder="(default)"
                onChange={(e) => update("databaseId", e.target.value)}
              />
            </Field>
            {draft.kind === "emulator" ? (
              <>
                <Field label={t("connection.emulatorHost")} hint={t("connection.emulatorHostHint")}>
                  <Input
                    value={draft.emulatorHost ?? ""}
                    placeholder="localhost:8080"
                    onChange={(e) => update("emulatorHost", e.target.value)}
                  />
                </Field>
                <Field label={t("connection.authEmulator")} hint={t("connection.authEmulatorHint")}>
                  <Input
                    value={draft.authEmulatorHost ?? ""}
                    placeholder="localhost:9099"
                    onChange={(e) => update("authEmulatorHost", e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label={t("connection.account")} hint={t("connection.accountHint")}>
                  <AccountPicker value={draft.account} onChange={(a) => update("account", a)} />
                </Field>
                <Field label={t("connection.quotaProject")} hint={t("connection.quotaProjectHint")}>
                  <Input
                    value={draft.quotaProject ?? ""}
                    onChange={(e) => update("quotaProject", e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field label={t("connection.readOnly")} hint={t("connection.readOnlyHint")}>
              <div className="pt-1.5">
                {/* 書き込み機能（第2段階）までは常にオンで固定する */}
                <Switch checked disabled aria-readonly />
              </div>
            </Field>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="destructive"
            disabled={isNew}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              remove(draft.id);
              setDraft(blankConnection());
            }}
          >
            <Trash2 /> {confirmDelete ? t("connection.confirmDelete") : t("common.delete")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
            <Button disabled={!valid} onClick={save}>
              {isNew ? t("common.add") : t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
