//! gcloud CLI に登録されたユーザーアカウントでアクセストークンを取得する。
//! 認証情報は gcloud が管理し、アプリはアクセストークンをメモリに短時間キャッシュするだけ

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex as StdMutex, RwLock as StdRwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::auth::TokenSource;
use crate::error::{AppError, AppResult};

/// gcloud のアクセストークンは約1時間有効。余裕を持って更新する
const TOKEN_TTL: Duration = Duration::from_secs(45 * 60);

/// 設定で指定された gcloud の場所（指定なしなら自動で探す）
static CUSTOM_PATH: StdRwLock<Option<PathBuf>> = StdRwLock::new(None);
/// ログインシェルに問い合わせて見つかった場所（見つかったときだけ覚える）
static SHELL_PATH: StdMutex<Option<PathBuf>> = StdMutex::new(None);
/// ログインシェルの起動（~/.zshrc の読み込みなど）を待つ上限
const SHELL_LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);

pub fn set_custom_path(path: Option<PathBuf>) {
    *CUSTOM_PATH.write().unwrap_or_else(|e| e.into_inner()) = path;
}

fn custom_path() -> Option<PathBuf> {
    CUSTOM_PATH
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

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

fn not_found(detail: Option<String>) -> AppError {
    AppError::Auth {
        message: tr!(
            "gcloud CLI が見つかりません。Google Cloud SDK をインストールするか、設定の「gcloud CLI」で場所を指定してください。",
            "gcloud CLI was not found. Install the Google Cloud SDK, or set its location under \"gcloud CLI\" in Settings."
        ),
        detail,
    }
}

/// WSL の中のファイルは Windows のアプリから実行できない
fn is_wsl_path(path: &std::path::Path) -> bool {
    let s = path.to_string_lossy().to_ascii_lowercase();
    s.starts_with(r"\\wsl$") || s.starts_with(r"\\wsl.localhost")
}

/// 設定で指定した場所 → PATH とよくある場所 → ログインシェル の順に探す
pub async fn find_gcloud() -> AppResult<PathBuf> {
    if let Some(path) = custom_path() {
        if cfg!(windows) && is_wsl_path(&path) {
            return Err(AppError::Auth {
                message: tr!(
                    "WSL の中の gcloud は Windows のアプリから実行できません。Windows 版の Google Cloud SDK をインストールしてください。",
                    "gcloud inside WSL can't be run from a Windows app. Install the Google Cloud SDK for Windows."
                ),
                detail: Some(path.display().to_string()),
            });
        }
        return if path.is_file() {
            Ok(path)
        } else {
            let shown = path.display();
            Err(AppError::Auth {
                message: tr!(
                    "設定で指定した gcloud が見つかりません: {shown}",
                    "The gcloud set in Settings was not found: {shown}"
                ),
                detail: None,
            })
        };
    }
    if let Some(path) = gcloud_candidates().into_iter().find(|p| p.is_file()) {
        return Ok(path);
    }
    if let Some(path) = SHELL_PATH.lock().unwrap_or_else(|e| e.into_inner()).clone() {
        return Ok(path);
    }
    match login_shell_lookup().await {
        Some(path) => {
            *SHELL_PATH.lock().unwrap_or_else(|e| e.into_inner()) = Some(path.clone());
            Ok(path)
        }
        None => Err(not_found(None)),
    }
}

/// Finder などから起動すると shell の PATH が引き継がれないため、ログインシェルに gcloud の場所を尋ねる。
/// asdf / mise などは ~/.zshrc で PATH を設定するため、対話モード（-i）でも読み込む
async fn login_shell_lookup() -> Option<PathBuf> {
    if cfg!(windows) {
        return None;
    }
    let shell = std::env::var_os("SHELL").unwrap_or_else(|| "/bin/zsh".into());
    let mut cmd = Command::new(shell);
    cmd.args(["-i", "-l", "-c", "command -v gcloud"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let out = tokio::time::timeout(SHELL_LOOKUP_TIMEOUT, cmd.output())
        .await
        .ok()?
        .ok()?;
    // シェルの設定ファイルが何か出力することがあるため、最後の絶対パスの行を使う
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| l.starts_with('/'))
        .map(PathBuf::from)
        .filter(|p| p.is_file())
}

/// 設定画面に出す gcloud の状態
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GcloudStatus {
    /// 使う gcloud の場所（見つからなければ None）
    pub path: Option<String>,
    /// 設定で指定した場所か
    pub custom: bool,
    /// `gcloud --version` の1行目
    pub version: Option<String>,
    pub error: Option<String>,
}

pub async fn status() -> GcloudStatus {
    let custom = custom_path().is_some();
    let path = match find_gcloud().await {
        Ok(p) => p,
        Err(e) => {
            return GcloudStatus {
                path: None,
                custom,
                version: None,
                error: Some(e.to_string()),
            }
        }
    };
    let (version, error) = match run_gcloud(&["--version"]).await {
        Ok(out) => (out.lines().next().map(str::to_owned), None),
        Err(e) => (None, Some(e)),
    };
    GcloudStatus {
        path: Some(path.display().to_string()),
        custom,
        version,
        error,
    }
}

/// 標準出力を返す。失敗時は標準エラーを detail に入れる（トークンは標準出力にしか出ない）
async fn run_gcloud(args: &[&str]) -> Result<String, String> {
    let gcloud = find_gcloud().await.map_err(|e| e.to_string())?;
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

    #[test]
    fn detects_wsl_paths() {
        assert!(is_wsl_path(std::path::Path::new(
            r"\\wsl$\Ubuntu\usr\bin\gcloud"
        )));
        assert!(is_wsl_path(std::path::Path::new(
            r"\\wsl.localhost\Ubuntu\usr\bin\gcloud"
        )));
        assert!(!is_wsl_path(std::path::Path::new(
            r"C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
        )));
    }

    #[tokio::test]
    async fn custom_path_that_does_not_exist_is_an_error() {
        set_custom_path(Some(PathBuf::from("/nonexistent/gcloud")));
        let result = find_gcloud().await;
        set_custom_path(None);
        assert!(result.is_err());
    }

    #[tokio::test]
    #[ignore = "gcloud CLI が必要"]
    async fn finds_gcloud_through_login_shell() {
        println!("{:?}", login_shell_lookup().await);
    }

    #[tokio::test]
    #[ignore = "gcloud CLI が必要"]
    async fn lists_accounts() {
        let accounts = list_accounts().await.unwrap();
        println!("{accounts:?}");
    }
}
