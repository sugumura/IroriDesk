import type { DisplayDocument, DisplayUser, DisplayValue } from "./api";

/** ユーザーのドキュメント形式の行でのパス（選択状態の識別に使う） */
export const userRowPath = (uid: string) => `__auth__/${uid}`;

/**
 * テーブル・列設定・エクスポートを共通化するため、ユーザーをドキュメントと同じ行形式にする。
 * Doc ID 列には UID が入る
 */
export function userToRow(u: DisplayUser): DisplayDocument {
  const ts = (iso: string | null): DisplayValue => (iso ? { $timestamp: iso } : null);
  return {
    id: u.uid,
    path: userRowPath(u.uid),
    name: u.uid,
    fields: {
      email: u.email,
      displayName: u.displayName,
      phoneNumber: u.phoneNumber,
      providers: u.providers,
      emailVerified: u.emailVerified,
      disabled: u.disabled,
      createdAt: ts(u.createdAt),
      lastLoginAt: ts(u.lastLoginAt),
      customClaims: (u.customClaims ?? null) as DisplayValue,
    },
    createTime: u.createdAt,
    updateTime: null,
    missing: false,
  };
}
