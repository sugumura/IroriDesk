import { useState } from "react";
import { CircleCheck, CircleX, Loader2, PanelLeft, PanelRight, PlugZap, ServerCog, Settings } from "lucide-react";
import { listCollectionIds, toAppError } from "@/lib/api";
import { activeConnection, useStore } from "@/store";
import { useT } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppSettingsDialog } from "./AppSettingsDialog";
import { ConnectionDialog } from "./ConnectionDialog";

type TestResult = { ok: true; count: number } | { ok: false; message: string } | null;

export function TopBar() {
  const t = useT();
  const connections = useStore((s) => s.connections);
  const activeId = useStore((s) => s.activeConnectionId);
  const conn = useStore(activeConnection);
  const setActive = useStore((s) => s.setActiveConnection);
  const reloadRoot = useStore((s) => s.loadRootCollections);
  const detailOpen = useStore((s) => s.detailOpen);
  const setDetailOpen = useStore((s) => s.setDetailOpen);
  const treeOpen = useStore((s) => s.treeOpen);
  const setTreeOpen = useStore((s) => s.setTreeOpen);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  const runTest = async () => {
    if (!conn) return;
    setTesting(true);
    setResult(null);
    try {
      const ids = await listCollectionIds(conn);
      setResult({ ok: true, count: ids.length });
      void reloadRoot();
    } catch (e) {
      const err = toAppError(e);
      setResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <Select
        value={activeId ?? ""}
        onValueChange={(id) => {
          setResult(null);
          setActive(id);
        }}
      >
        <SelectTrigger size="sm" className="w-64">
          <SelectValue placeholder={t("topbar.selectConnection")} />
        </SelectTrigger>
        <SelectContent>
          {connections.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              <span className="text-xs text-muted-foreground">
                {c.projectId}
                {c.kind === "emulator" ? " · Emulator" : c.account ? ` · ${c.account}` : " · ADC"}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon-sm" title={t("topbar.manageConnections")} onClick={() => setDialogOpen(true)}>
        <ServerCog />
      </Button>
      <Button variant="outline" size="sm" disabled={!conn || testing} onClick={runTest}>
        {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
        {t("topbar.testConnection")}
      </Button>
      {result?.ok === true && (
        <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-3.5" /> {t("topbar.testOk", { count: result.count })}
        </span>
      )}
      {result?.ok === false && (
        <span
          className="flex min-w-0 items-center gap-1 text-xs text-destructive"
          title={result.message}
        >
          <CircleX className="size-3.5 shrink-0" />
          <span className="truncate">{result.message}</span>
        </span>
      )}

      <div className="flex-1" />
      {conn && (
        <>
          {conn.kind === "emulator" ? (
            <Badge variant="secondary">Emulator</Badge>
          ) : (
            <Badge variant="outline">{t("topbar.production")}</Badge>
          )}
          {/* MVP では常に読み取りのみ */}
          <Badge variant="outline" title={t("topbar.readOnlyHint")}>
            {t("topbar.readOnly")}
          </Badge>
        </>
      )}
      <Button
        variant={treeOpen ? "secondary" : "ghost"}
        size="icon-sm"
        title={t("topbar.toggleTree")}
        onClick={() => setTreeOpen(!treeOpen)}
      >
        <PanelLeft />
      </Button>
      <Button
        variant={detailOpen ? "secondary" : "ghost"}
        size="icon-sm"
        title={t("topbar.toggleDetail")}
        onClick={() => setDetailOpen(!detailOpen)}
      >
        <PanelRight />
      </Button>
      <Button variant="ghost" size="icon-sm" title={t("topbar.settings")} onClick={() => setSettingsOpen(true)}>
        <Settings />
      </Button>

      <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <AppSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
