import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import type { UserLookupKind } from "@/lib/api";
import { userRowPath, userToRow } from "@/lib/authUsers";
import { columnScope } from "@/lib/columns";
import { useColumnLayout } from "@/lib/useColumnLayout";
import { type MessageKey, useT } from "@/i18n";
import { type AuthTab, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColumnSettings } from "./ColumnSettings";
import { ErrorBox } from "./ErrorBox";
import { ExportMenu } from "./ExportMenu";
import { ResultsView, ViewToggle } from "./ResultsView";

/** placeholder が MessageKey でないもの（メールの例）はそのまま表示する */
const LOOKUP_KINDS: { value: UserLookupKind; label: MessageKey; placeholder: MessageKey | { text: string } }[] = [
  { value: "email", label: "auth.lookup.email", placeholder: { text: "alice@example.com" } },
  { value: "uid", label: "auth.lookup.uid", placeholder: "auth.placeholder.uid" },
  { value: "phone", label: "auth.lookup.phone", placeholder: "auth.placeholder.phone" },
];

/** Firebase Authentication のユーザー一覧（読み取りのみ） */
export function AuthView({ tab }: { tab: AuthTab }) {
  const t = useT();
  const loadUsers = useStore((s) => s.loadUsers);
  const searchUsers = useStore((s) => s.searchUsers);
  const selectUser = useStore((s) => s.selectUser);
  const selectedUid = useStore((s) => s.selectedUser?.uid ?? null);
  const [kind, setKind] = useState<UserLookupKind>(tab.search?.kind ?? "email");
  const [value, setValue] = useState(tab.search?.value ?? "");

  const rows = useMemo(() => tab.users.map(userToRow), [tab.users]);
  const layout = useColumnLayout(rows, columnScope({ kind: "collection", path: "__auth__" }));
  const byUid = useMemo(() => new Map(tab.users.map((u) => [u.uid, u])), [tab.users]);
  const kindInfo = LOOKUP_KINDS.find((k) => k.value === kind)!;
  const placeholder = typeof kindInfo.placeholder === "string" ? t(kindInfo.placeholder) : kindInfo.placeholder.text;

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <form
        className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void searchUsers(tab.id, kind, value);
        }}
      >
        <span className="mr-1 font-medium">Authentication</span>
        <Select value={kind} onValueChange={(v) => setKind(v as UserLookupKind)}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOOKUP_KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {t(k.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("auth.exactMatch", { placeholder })}
          className="h-7 min-w-40 flex-1 font-mono text-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!value.trim() || tab.loading}>
          <Search /> <span className="hidden @lg:inline">{t("auth.search")}</span>
        </Button>
        {tab.search && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title={t("auth.clearSearchTitle")}
            onClick={() => {
              setValue("");
              void loadUsers(tab.id, true);
            }}
          >
            <X /> <span className="hidden @lg:inline">{t("auth.clear")}</span>
          </Button>
        )}
        <div className="flex-1" />
        {tab.view === "table" && <ColumnSettings layout={layout} idLabel="UID" />}
        <ViewToggle tab={tab} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={t("common.reload")}
          disabled={tab.loading}
          onClick={() =>
            tab.search ? void searchUsers(tab.id, tab.search.kind, tab.search.value) : void loadUsers(tab.id, true)
          }
        >
          <RefreshCw />
        </Button>
      </form>

      {tab.error && <ErrorBox error={tab.error} className="m-3" />}

      <div className="min-h-0 flex-1">
        {rows.length === 0 && !tab.loading && !tab.error ? (
          <div className="p-4 text-muted-foreground">
            {tab.search ? t("auth.noMatchingUsers") : t("auth.noUsers")}
          </div>
        ) : (
          <ResultsView
            docs={rows}
            fields={layout.visible}
            view={tab.view}
            selectedPath={selectedUid ? userRowPath(selectedUid) : null}
            onSelect={(row) => selectUser(byUid.get(row.id) ?? null)}
            idLabel="UID"
          />
        )}
      </div>

      <div className="flex h-9 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {tab.search ? t("auth.resultCount", { count: rows.length }) : t("common.count", { count: rows.length })}
          <span className="hidden @md:inline">{tab.search ? "" : t("auth.loaded")}</span>
        </span>
        {tab.loading && <Loader2 className="size-3.5 animate-spin" />}
        <div className="flex-1" />
        <ExportMenu docs={rows} fields={layout.visible} baseName="auth_users" />
        {tab.nextPageToken && !tab.search && (
          <Button size="xs" variant="outline" disabled={tab.loading} onClick={() => loadUsers(tab.id, false)}>
            <span className="@md:hidden">{t("auth.more")}</span>
            <span className="hidden @md:inline">{t("auth.loadMore")}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
