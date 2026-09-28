//! Rust 側の文言（主にエラーメッセージ）の日本語・英語の切り替え。
//! 画面で選んだ言語を set_locale コマンドで受け取る
//!
//! 使い方: `tr!("{path} が見つかりません", "{path} was not found")`（format! と同じ書式）

use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn set_english(english: bool) {
    ENGLISH.store(english, Ordering::Relaxed);
}

pub fn is_english() -> bool {
    ENGLISH.load(Ordering::Relaxed)
}

/// 言語フラグを切り替えるテスト同士が並列に干渉しないよう、テスト中はこのロックを保持する
#[cfg(test)]
pub(crate) fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    set_english(false);
    guard
}

/// 日本語と英語の文言から、現在の言語のものを format! して返す
#[macro_export]
macro_rules! tr {
    ($ja:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if $crate::i18n::is_english() {
            format!($en $(, $arg)*)
        } else {
            format!($ja $(, $arg)*)
        }
    };
}

/// 画面の言語（"ja" / "en"）を受け取る。macOS のメニューも同じ言語で作り直す
#[tauri::command]
pub fn set_locale(app: tauri::AppHandle, lang: String) {
    let english = lang == "en";
    if english != is_english() {
        set_english(english);
        crate::menu::rebuild(&app);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn switches_language_with_captured_args() {
        let _guard = super::test_lock();
        let path = "users/alice";
        assert_eq!(
            tr!("{path} がありません", "{path} not found"),
            "users/alice がありません"
        );
        super::set_english(true);
        assert_eq!(
            tr!("{path} がありません", "{path} not found"),
            "users/alice not found"
        );
        assert_eq!(tr!("{} 件", "{} items", 3), "3 items");
        super::set_english(false);
    }
}
