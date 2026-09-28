import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import type { UserLookupKind } from "@/lib/api";
import { userRowPath, userToRow } from "@/lib/authUsers";
import { columnScope } from "@/lib/columns";
import { useColumnLayout } from "@/lib/useColumnLayout";
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

const LOOKUP_KINDS: { value: UserLookupKind; label: string; placeholder: string }[] = [
  { value: "email", label: "メール", placeholder: "alice@example.com" },
  { value: "uid", label: "UID", placeholder: "ユーザーの UID" },
  { value: "phone", label: "電話番号", placeholder: "+819012345678（E.164 形式）" },
];

/** Firebase Authentication のユーザー一覧（読み取りのみ） */
export function AuthView({ tab }: { tab: AuthTab }) {
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
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${kindInfo.placeholder}（完全一致）`}
          className="h-7 min-w-40 flex-1 font-mono text-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!value.trim() || tab.loading}>
          <Search /> <span className="hidden @lg:inline">検索</span>
        </Button>
        {tab.search && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="検索を解除して一覧に戻る"
            onClick={() => {
              setValue("");
              void loadUsers(tab.id, true);
            }}
          >
            <X /> <span className="hidden @lg:inline">解除</span>
          </Button>
        )}
        <div className="flex-1" />
        {tab.view === "table" && <ColumnSettings layout={layout} idLabel="UID" />}
        <ViewToggle tab={tab} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="再読み込み"
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
            {tab.search ? "該当するユーザーはいません" : "ユーザーはいません"}
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
          {tab.search ? `検索結果 ${rows.length} 件` : `${rows.length} 件`}
          <span className="hidden @md:inline">{tab.search ? "" : "読み込み済み"}</span>
        </span>
        {tab.loading && <Loader2 className="size-3.5 animate-spin" />}
        <div className="flex-1" />
        <ExportMenu docs={rows} fields={layout.visible} baseName="auth_users" />
        {tab.nextPageToken && !tab.search && (
          <Button size="xs" variant="outline" disabled={tab.loading} onClick={() => loadUsers(tab.id, false)}>
            <span className="@md:hidden">続き</span>
            <span className="hidden @md:inline">さらに読み込む</span>
          </Button>
        )}
      </div>
    </div>
  );
}
