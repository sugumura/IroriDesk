/**
 * 機能ごとの辞書をまとめる。新しい辞書ファイルを追加したらここに足す。
 * 各ファイルは `export const ja = {...}` と `export const en: typeof ja = {...}` を持つ
 */
import * as commonMessages from "./common";
import * as queryMessages from "./query";
import * as columnsMessages from "./columns";
import * as exportMessages from "./export";
import * as connectionMessages from "./connection";
import * as settingsMessages from "./settings";
import * as topbarMessages from "./topbar";
import * as browseMessages from "./browse";
import * as tabsMessages from "./tabs";
import * as detailMessages from "./detail";
import * as treeMessages from "./tree";
import * as authMessages from "./auth";
import * as indexesMessages from "./indexes";
import * as shortcutsMessages from "./shortcuts";

export const messages = {
  ja: {
    common: commonMessages.ja,
    query: queryMessages.ja,
    columns: columnsMessages.ja,
    export: exportMessages.ja,
    connection: connectionMessages.ja,
    settings: settingsMessages.ja,
    topbar: topbarMessages.ja,
    browse: browseMessages.ja,
    tabs: tabsMessages.ja,
    detail: detailMessages.ja,
    tree: treeMessages.ja,
    auth: authMessages.ja,
    indexes: indexesMessages.ja,
    shortcuts: shortcutsMessages.ja,
  },
  en: {
    common: commonMessages.en,
    query: queryMessages.en,
    columns: columnsMessages.en,
    export: exportMessages.en,
    connection: connectionMessages.en,
    settings: settingsMessages.en,
    topbar: topbarMessages.en,
    browse: browseMessages.en,
    tabs: tabsMessages.en,
    detail: detailMessages.en,
    tree: treeMessages.en,
    auth: authMessages.en,
    indexes: indexesMessages.en,
    shortcuts: shortcutsMessages.en,
  },
};
