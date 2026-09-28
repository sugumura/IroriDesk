use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::error::{AppError, AppResult};

/// 保存ダイアログで選ばれたパスにテキストを書き込む。キャンセル時は None。
/// フロントに汎用のファイル書き込み権限を渡さないよう、ダイアログと書き込みを Rust 側で行う
#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    default_name: String,
    filter_name: String,
    extension: String,
    contents: String,
) -> AppResult<Option<String>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(default_name)
        .add_filter(filter_name, &[extension.as_str()])
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    let Some(path) = rx.await.map_err(|_| {
        AppError::File(tr!(
            "保存ダイアログが閉じられました",
            "The save dialog was closed"
        ))
    })?
    else {
        return Ok(None);
    };
    let path: PathBuf = path.into_path().map_err(|e| {
        AppError::File(tr!("保存先のパスが不正です: {e}", "Invalid save path: {e}"))
    })?;
    tokio::fs::write(&path, contents)
        .await
        .map_err(|e| AppError::File(format!("{}: {e}", path.display())))?;
    Ok(Some(path.display().to_string()))
}
