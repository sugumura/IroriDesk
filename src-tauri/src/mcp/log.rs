//! AI エージェントが何を読んだかの記録（agent-log.jsonl、1行1件）。
//! 引数の値（クエリの値など）は記録せず、ツール・接続・対象・件数・結果だけを残す

use std::io::Write;

use chrono::{SecondsFormat, Utc};
use serde_json::json;

use super::settings::data_dir;

const LOG_FILE: &str = "agent-log.jsonl";
const ROTATED_FILE: &str = "agent-log.1.jsonl";
/// これを超えたら古いものを別名にして新しく始める
const MAX_BYTES: u64 = 1024 * 1024;

/// 記録ファイルの場所
pub fn path() -> Option<std::path::PathBuf> {
    data_dir().map(|d| d.join(LOG_FILE))
}

pub fn record(tool: &str, connection: Option<&str>, target: &str, reads: u64, error: Option<&str>) {
    let Some(dir) = data_dir() else { return };
    let path = dir.join(LOG_FILE);
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_BYTES) {
        let _ = std::fs::rename(&path, dir.join(ROTATED_FILE));
    }
    let line = json!({
        "time": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        "tool": tool,
        "connection": connection,
        "target": target,
        "reads": reads,
        "ok": error.is_none(),
        "error": error,
    });
    // 記録に失敗してもツールの結果には影響させない
    let _ = std::fs::create_dir_all(&dir).and_then(|_| {
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .and_then(|mut f| writeln!(f, "{line}"))
    });
}
