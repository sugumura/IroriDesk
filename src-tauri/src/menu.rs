//! macOS のアプリメニュー。ショートカット（⌘T / ⌘W / ⌘K など）はメニューに登録し、
//! 選ばれたら "menu-action" イベントで画面に操作の ID を送る。
//! 既定のメニューの「ウィンドウを閉じる（⌘W）」は、タブを閉じる操作に使うため入れない。
//! Windows / Linux ではメニューバーを出さず、画面側のキー操作（Ctrl）で同じ操作を行う

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

/// 画面に送る操作の ID と、メニューの文言・ショートカット
const ACTIONS: &[(&str, &str, &str, &str)] = &[
    ("newQuery", "新しいクエリ", "New Query", "CmdOrCtrl+T"),
    ("closeTab", "タブを閉じる", "Close Tab", "CmdOrCtrl+W"),
    (
        "palette",
        "コマンドパレット…",
        "Command Palette…",
        "CmdOrCtrl+K",
    ),
    ("reload", "再読み込み", "Reload", "CmdOrCtrl+R"),
    ("filter", "結果を絞り込み", "Filter Results", "CmdOrCtrl+F"),
    (
        "toggleTree",
        "コレクションパネル",
        "Collections Panel",
        "CmdOrCtrl+B",
    ),
    (
        "toggleDetail",
        "詳細パネル",
        "Details Panel",
        "CmdOrCtrl+Alt+B",
    ),
    (
        "prevTab",
        "前のタブ",
        "Previous Tab",
        "CmdOrCtrl+Shift+BracketLeft",
    ),
    (
        "nextTab",
        "次のタブ",
        "Next Tab",
        "CmdOrCtrl+Shift+BracketRight",
    ),
    ("settings", "設定…", "Settings…", "CmdOrCtrl+Comma"),
];

fn label(ja: &str, en: &str) -> String {
    if crate::i18n::is_english() { en } else { ja }.to_owned()
}

fn action<R: Runtime>(app: &AppHandle<R>, id: &str) -> tauri::Result<tauri::menu::MenuItem<R>> {
    let (_, ja, en, accel) = ACTIONS
        .iter()
        .find(|(a, ..)| *a == id)
        .expect("ACTIONS に登録済みの ID");
    MenuItemBuilder::with_id(id, label(ja, en))
        .accelerator(*accel)
        .build(app)
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "Irori Desk")
        .about(None)
        .separator()
        .item(&action(app, "settings")?)
        .separator()
        .services_with_text(label("サービス", "Services"))
        .separator()
        .hide_with_text(label("Irori Desk を隠す", "Hide Irori Desk"))
        .hide_others_with_text(label("ほかを隠す", "Hide Others"))
        .show_all_with_text(label("すべてを表示", "Show All"))
        .separator()
        .quit_with_text(label("Irori Desk を終了", "Quit Irori Desk"))
        .build()?;
    let file = SubmenuBuilder::new(app, label("ファイル", "File"))
        .item(&action(app, "newQuery")?)
        .item(&action(app, "closeTab")?)
        .separator()
        .item(&action(app, "palette")?)
        .build()?;
    let edit = SubmenuBuilder::new(app, label("編集", "Edit"))
        .undo_with_text(label("取り消す", "Undo"))
        .redo_with_text(label("やり直す", "Redo"))
        .separator()
        .cut_with_text(label("カット", "Cut"))
        .copy_with_text(label("コピー", "Copy"))
        .paste_with_text(label("ペースト", "Paste"))
        .select_all_with_text(label("すべてを選択", "Select All"))
        .build()?;
    let view = SubmenuBuilder::new(app, label("表示", "View"))
        .item(&action(app, "reload")?)
        .item(&action(app, "filter")?)
        .separator()
        .item(&action(app, "toggleTree")?)
        .item(&action(app, "toggleDetail")?)
        .separator()
        .item(&action(app, "prevTab")?)
        .item(&action(app, "nextTab")?)
        .separator()
        .fullscreen_with_text(label("フルスクリーンにする", "Enter Full Screen"))
        .build()?;
    let window = SubmenuBuilder::new(app, label("ウインドウ", "Window"))
        .minimize_with_text(label("しまう", "Minimize"))
        .maximize_with_text(label("拡大／縮小", "Zoom"))
        .build()?;
    MenuBuilder::new(app)
        .items(&[&app_menu, &file, &edit, &view, &window])
        .build()
}

/// メニュー（またはそのショートカット）が選ばれたら画面に操作の ID を送る
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if ACTIONS.iter().any(|(a, ..)| *a == id) {
        let _ = app.emit("menu-action", id);
    }
}

/// メニューを今の言語で作り直す（macOS のみ）
pub fn rebuild<R: Runtime>(app: &AppHandle<R>) {
    if cfg!(target_os = "macos") {
        if let Ok(menu) = build(app) {
            let _ = app.set_menu(menu);
        }
    }
}
