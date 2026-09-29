//! gcloud CLI に登録されたユーザーアカウントでアクセストークンを取得する。
//! 認証情報は gcloud が管理し、アプリはアクセストークンをメモリに短時間キャッシュするだけ

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::auth::TokenSource;
use crate::error::{AppError, AppResult};

/// gcloud のアクセストークンは約1時間有効。余裕を持って更新する
const TOKEN_TTL: Duration = Duration::from_secs(45 * 60);

/// GUI から起動したアプリには shell の PATH が引き継がれないため、よくある場所も探す
fn gcloud_candidates() -> Vec<PathBuf> {
    let exe = if cfg!(windows) {
        "gcloud.cmd"
    } else {
        "gcloud"
    };
    let mut out: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).map(|d| d.join(exe)).collect())
        .unwrap_or_default();
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            out.push(
                PathBuf::from(local).join(r"Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"),
            );
        }
        out.push(PathBuf::from(
            r"C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        ));
        out.push(PathBuf::from(
            r"C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        ));
    } else {
        for p in [
            "/opt/homebrew/bin/gcloud",
            "/usr/local/bin/gcloud",
            "/opt/homebrew/share/google-cloud-sdk/bin/gcloud",
            "/usr/local/share/google-cloud-sdk/bin/gcloud",
            "/usr/lib/google-cloud-sdk/bin/gcloud",
            "/snap/bin/gcloud",
        ] {
            out.push(PathBuf::from(p));
        }
        if let Some(h) = &home {
            out.push(h.join("google-cloud-sdk/bin/gcloud"));
        }
    }
    out
}

pub fn find_gcloud() -> AppResult<PathBuf> {
    gcloud_candidates()
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| AppError::Auth {
            message: tr!(
                "gcloud CLI が見つかりません。Google Cloud SDK をインストールしてください。",
                "gcloud CLI was not found. Please install the Google Cloud SDK."
            ),
            detail: None,
        })
}

/// 標準出力を返す。失敗時は標準エラーを detail に入れる（トークンは標準出力にしか出ない）
async fn run_gcloud(args: &[&str]) -> Result<String, String> {
    let gcloud = find_gcloud().map_err(|e| e.to_string())?;
    let mut cmd = Command::new(gcloud);
    cmd.args(args).stdin(Stdio::null());
    // GUI アプリから gcloud.cmd を実行するとコンソールウィンドウが一瞬開くため、開かないようにする
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().await.map_err(|e| {
        tr!(
            "gcloud を実行できませんでした: {e}",
            "Could not run gcloud: {e}"
        )
    })?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_owned())
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GcloudAccount {
    pub account: String,
    /// gcloud CLI で現在有効なアカウント
    #[serde(default)]
    pub active: bool,
}

#[derive(Deserialize)]
struct AuthListEntry {
    account: String,
    #[serde(default)]
    status: String,
}

pub async fn list_accounts() -> AppResult<Vec<GcloudAccount>> {
    let json = run_gcloud(&["auth", "list", "--format=json"])
        .await
        .map_err(|detail| AppError::Auth {
            message: tr!(
                "gcloud のアカウント一覧を取得できませんでした",
                "Could not get the gcloud account list"
            ),
            detail: Some(detail),
        })?;
    let entries: Vec<AuthListEntry> =
        serde_json::from_str(if json.is_empty() { "[]" } else { &json }).map_err(|e| {
            AppError::Decode(tr!(
                "gcloud auth list の出力を解析できません: {e}",
                "Could not parse the output of gcloud auth list: {e}"
            ))
        })?;
    Ok(entries
        .into_iter()
        .map(|e| GcloudAccount {
            active: e.status == "ACTIVE",
            account: e.account,
        })
        .collect())
}

/// ブラウザで Google ログインを行い、gcloud にアカウントを追加する（再ログインにも使う）。
/// --no-activate で、ターミナルで使っている gcloud の現在のアカウントは切り替えない
pub async fn login(account: Option<&str>) -> AppResult<()> {
    let mut args = vec!["auth", "login", "--no-activate", "--brief"];
    if let Some(a) = account.filter(|a| !a.trim().is_empty()) {
        args.push(a);
    }
    run_gcloud(&args).await.map(|_| ()).map_err(|detail| AppError::Auth {
        message: tr!(
            "gcloud へのログインに失敗しました（ブラウザでのログインが完了していない可能性があります）",
            "gcloud sign-in failed (the browser sign-in may not have completed)"
        ),
        detail: Some(detail),
    })
}

/// アカウントごとのアクセストークンのキャッシュ（再読み込みで破棄する）
#[derive(Default)]
pub struct GcloudTokenCache {
    tokens: Mutex<HashMap<String, (String, Instant)>>,
}

impl GcloudTokenCache {
    pub async fn clear(&self) {
        self.tokens.lock().await.clear();
    }

    async fn token(&self, account: &str) -> AppResult<String> {
        if let Some((t, at)) = self.tokens.lock().await.get(account) {
            if at.elapsed() < TOKEN_TTL {
                return Ok(t.clone());
            }
        }
        let arg = format!("--account={account}");
        let token = run_gcloud(&["auth", "print-access-token", &arg])
            .await
            .map_err(|detail| AppError::Auth {
                message: tr!(
                    "アカウント {account} のアクセストークンを取得できませんでした。\
                     接続の管理で「再ログイン」を押してログインし直してください。",
                    "Could not get an access token for account {account}. \
                     Click \"Sign in again\" in Manage connections to sign in again."
                ),
                detail: Some(detail),
            })?;
        if token.is_empty() {
            return Err(AppError::Auth {
                message: tr!(
                    "アカウント {account} のアクセストークンが空でした",
                    "The access token for account {account} was empty"
                ),
                detail: None,
            });
        }
        self.tokens
            .lock()
            .await
            .insert(account.to_owned(), (token.clone(), Instant::now()));
        Ok(token)
    }
}

/// 接続に割り当てた gcloud アカウントのトークン
pub struct GcloudTokenSource {
    pub account: String,
    pub cache: Arc<GcloudTokenCache>,
}

#[async_trait::async_trait]
impl TokenSource for GcloudTokenSource {
    async fn bearer_token(&self) -> AppResult<String> {
        self.cache.token(&self.account).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_include_path_and_homebrew() {
        let c = gcloud_candidates();
        if !cfg!(windows) {
            assert!(c
                .iter()
                .any(|p| p == &PathBuf::from("/opt/homebrew/bin/gcloud")));
        }
        assert!(!c.is_empty());
    }

    #[tokio::test]
    #[ignore = "gcloud CLI が必要"]
    async fn lists_accounts() {
        let accounts = list_accounts().await.unwrap();
        println!("{accounts:?}");
    }
}
