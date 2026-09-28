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

/// 画面の言語（"ja" / "en"）を受け取る
#[tauri::command]
pub fn set_locale(lang: String) {
    set_english(lang == "en");
}

#[cfg(test)]
mod tests {
    #[test]
    fn switches_language_with_captured_args() {
        let path = "users/alice";
        super::set_english(false);
        assert_eq!(tr!("{path} がありません", "{path} not found"), "users/alice がありません");
        super::set_english(true);
        assert_eq!(tr!("{path} がありません", "{path} not found"), "users/alice not found");
        assert_eq!(tr!("{} 件", "{} items", 3), "3 items");
        super::set_english(false);
    }
}
