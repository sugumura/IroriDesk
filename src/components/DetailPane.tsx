import { useStore } from "@/store";
import { DocumentDetail } from "./DocumentDetail";
import { UserDetail } from "./UserDetail";

/** 右ペイン。最後に選択したもの（ドキュメント or ユーザー）を表示する */
export function DetailPane() {
  const user = useStore((s) => s.selectedUser);
  return user ? <UserDetail user={user} /> : <DocumentDetail />;
}
