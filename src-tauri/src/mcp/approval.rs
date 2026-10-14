//! 大量の読み取りの確認（docs/MCP.md「大量の読み取りの確認」）。
//! 上限で止めるのではなく、基準を超えるときに利用者の承認を得る。
//! エージェントが MCP の elicitation に対応していればその画面で、対応していなければ OS のダイアログで尋ねる

use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use rmcp::service::ElicitationError;
use rmcp::{Peer, RoleServer};
use serde::{Deserialize, Serialize};
use tokio::process::Command;

use super::settings::Settings;

/// 応答が無ければ拒否として扱うまでの時間
const ANSWER_TIMEOUT: Duration = Duration::from_secs(120);

/// MCP サーバーの起動から終了までの読み取りの累計と、「このセッション中は確認しない」の状態
#[derive(Default)]
pub struct ReadBudget {
    total: AtomicU64,
    approved_for_session: AtomicBool,
}

/// 確認の内容
pub struct ReadRequest<'a> {
    pub connection: &'a str,
    pub tool: &'a str,
    pub target: &'a str,
    /// 読む件数の見込み（limit など）
    pub estimate: u64,
}

enum Decision {
    Once,
    Session,
    Deny,
}

/// エージェントの画面に出すフォーム
#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
struct Approval {
    /// Don't ask again until the MCP server restarts
    #[serde(default)]
    allow_for_this_session: bool,
}
rmcp::elicit_safe!(Approval);

impl ReadBudget {
    pub fn total(&self) -> u64 {
        self.total.load(Ordering::Relaxed)
    }

    pub fn record(&self, reads: u64) -> u64 {
        self.total.fetch_add(reads, Ordering::Relaxed) + reads
    }

    /// 基準以内ならそのまま、超えるなら利用者に確認する。拒否されたら Err（エージェントに返す説明）
    pub async fn ensure_allowed(
        &self,
        peer: &Peer<RoleServer>,
        settings: &Settings,
        req: &ReadRequest<'_>,
    ) -> Result<(), String> {
        if self.approved_for_session.load(Ordering::Relaxed) {
            return Ok(());
        }
        let total = self.total();
        if req.estimate <= settings.agent.confirm_docs_per_call
            && total + req.estimate <= settings.agent.confirm_docs_per_session
        {
            return Ok(());
        }
        match ask(peer, settings, req, total).await {
            Decision::Once => Ok(()),
            Decision::Session => {
                self.approved_for_session.store(true, Ordering::Relaxed);
                Ok(())
            }
            Decision::Deny => Err(format!(
                "The user did not approve reading up to {} documents ({} {}). \
                 Ask for fewer documents (a smaller limit, or the fields parameter with paging), \
                 or ask the user to approve it.",
                req.estimate, req.tool, req.target
            )),
        }
    }
}

async fn ask(
    peer: &Peer<RoleServer>,
    settings: &Settings,
    req: &ReadRequest<'_>,
    total: u64,
) -> Decision {
    let ja = settings.japanese_ui();
    let message = if ja {
        format!(
            "AI エージェントが Irori Desk でのドキュメントの読み取りを求めています。\n\n\
             接続: {}\n操作: {} {}\n読み取る件数（最大）: {}\nこのセッションの累計: {}\n\n\
             Firestore は読み取った件数に応じて課金されます。許可しますか？",
            req.connection, req.tool, req.target, req.estimate, total
        )
    } else {
        format!(
            "An AI agent wants to read documents through Irori Desk.\n\n\
             Connection: {}\nOperation: {} {}\nDocuments to read (up to): {}\nRead so far in this session: {}\n\n\
             Firestore charges for each document read. Allow it?",
            req.connection, req.tool, req.target, req.estimate, total
        )
    };
    match peer
        .elicit_with_timeout::<Approval>(message.clone(), Some(ANSWER_TIMEOUT))
        .await
    {
        Ok(Some(a)) if a.allow_for_this_session => Decision::Session,
        Ok(_) => Decision::Once,
        Err(ElicitationError::UserDeclined | ElicitationError::UserCancelled) => Decision::Deny,
        // エージェントが対応していない（またはエラー）なら OS のダイアログで尋ねる
        Err(_) => native_dialog(&message, ja).await,
    }
}

struct Labels {
    title: &'static str,
    deny: &'static str,
    once: &'static str,
    session: &'static str,
}

fn labels(ja: bool) -> Labels {
    if ja {
        Labels {
            title: "Irori Desk — AI エージェントの読み取り",
            deny: "拒否",
            once: "今回だけ許可",
            session: "このセッション中は許可",
        }
    } else {
        Labels {
            title: "Irori Desk — AI agent read",
            deny: "Deny",
            once: "Allow once",
            session: "Allow for this session",
        }
    }
}

async fn native_dialog(message: &str, ja: bool) -> Decision {
    let l = labels(ja);
    let answer = tokio::time::timeout(ANSWER_TIMEOUT, run_dialog(message, &l)).await;
    match answer {
        Ok(Some(a)) if a == l.once => Decision::Once,
        Ok(Some(a)) if a == l.session => Decision::Session,
        _ => Decision::Deny,
    }
}

/// 押されたボタンの文言（閉じた・時間切れ・ダイアログを出せないときは None）
async fn run_dialog(message: &str, l: &Labels) -> Option<String> {
    let mut cmd = dialog_command(message, l)?;
    let out = cmd
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_owned();
    (!text.is_empty()).then_some(text)
}

#[cfg(target_os = "macos")]
fn dialog_command(message: &str, l: &Labels) -> Option<Command> {
    // 文言は引数で渡す（スクリプトに埋め込まない）
    const SCRIPT: &str = r#"on run argv
set r to display dialog (item 1 of argv) with title (item 2 of argv) buttons {item 3 of argv, item 4 of argv, item 5 of argv} default button 2 cancel button 1 with icon caution
return button returned of r
end run"#;
    let mut cmd = Command::new("/usr/bin/osascript");
    cmd.arg("-e")
        .arg(SCRIPT)
        .args([message, l.title, l.deny, l.once, l.session]);
    Some(cmd)
}

#[cfg(target_os = "windows")]
fn dialog_command(message: &str, l: &Labels) -> Option<Command> {
    // MessageBox は3択の文言を変えられないため、はい / いいえ / キャンセル に割り当てて説明を添える
    const SCRIPT: &str = r#"Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
$r = [System.Windows.Forms.MessageBox]::Show($owner, $env:IRORI_MESSAGE, $env:IRORI_TITLE, 'YesNoCancel', 'Warning')
switch ($r) { 'Yes' { $env:IRORI_ONCE } 'No' { $env:IRORI_SESSION } default { $env:IRORI_DENY } }"#;
    let legend = format!(
        "\n\n[Yes] {}   [No] {}   [Cancel] {}",
        l.once, l.session, l.deny
    );
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", SCRIPT])
        .env("IRORI_MESSAGE", format!("{message}{legend}"))
        .env("IRORI_TITLE", l.title)
        .env("IRORI_ONCE", l.once)
        .env("IRORI_SESSION", l.session)
        .env("IRORI_DENY", l.deny);
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
    Some(cmd)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn dialog_command(message: &str, l: &Labels) -> Option<Command> {
    // zenity が無ければダイアログを出せないため拒否になる
    let mut cmd = Command::new("zenity");
    cmd.args([
        "--question",
        "--title",
        l.title,
        "--text",
        message,
        "--ok-label",
        l.once,
        "--cancel-label",
        l.deny,
        "--extra-button",
        l.session,
    ]);
    Some(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_reads() {
        let b = ReadBudget::default();
        assert_eq!(b.record(10), 10);
        assert_eq!(b.record(5), 15);
        assert_eq!(b.total(), 15);
    }
}
