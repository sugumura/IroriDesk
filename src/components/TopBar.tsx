import { useState } from "react";
import { Loader2, PanelLeft, PanelRight, PlugZap, ServerCog, Settings } from "lucide-react";
import { listCollectionIds, toAppError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { activeConnection, useStore } from "@/store";
import { useT } from "@/i18n";
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
import { ENV_COLOR, EnvBadge, EnvDot } from "./EnvIndicator";

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
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    if (!conn) return;
    setTesting(true);
    try {
      const ids = await listCollectionIds(conn);
      notifySuccess(t("topbar.testOk", { count: ids.length }), conn.name);
      void reloadRoot();
    } catch (e) {
      notifyError(toAppError(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <header className="relative flex h-11 shrink-0 items-center gap-2 border-b px-3">
      {/* 接続先がひと目でわかるよう、ヘッダーの上端に接続の種類の色を付ける */}
      {conn && <div className={cn("absolute inset-x-0 top-0 h-[3px]", ENV_COLOR[conn.kind].bar)} />}
      <Select
        value={activeId ?? ""}
        onValueChange={(id) => setActive(id)}
      >
        <SelectTrigger size="sm" className="w-64">
          <SelectValue placeholder={t("topbar.selectConnection")} />
        </SelectTrigger>
        <SelectContent>
          {connections.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <EnvDot kind={c.kind} />
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
      <div className="flex-1" />
      {conn && (
        <>
          {/* MVP では常に読み取りのみ（鍵のアイコンとツールチップで示す） */}
          <EnvBadge kind={conn.kind} />
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
