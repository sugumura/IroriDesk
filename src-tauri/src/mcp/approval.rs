//! 大量の読み取りの確認（docs/MCP.md「大量の読み取りの確認」）。
//! 上限で止めるのではなく、基準を超えるときに利用者の承認を得る。
//! エージェントが MCP の elicitation に対応していればその画面で、対応していなければ OS のダイアログで尋ねる。
//! 2026-07-28 版（ステートレス）で接続したエージェントには、結果の代わりに input_required を返し、
//! 答えを付けて送り直してもらう（Multi Round-Trip Requests）

use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use rmcp::model::{
    ElicitRequest, ElicitRequestParams, ElicitResult, ElicitationAction, ElicitationSchema,
    InputRequest, InputRequests, InputRequiredResult, InputResponses, ProtocolVersion,
};
use rmcp::service::{ElicitationError, RequestContext};
use rmcp::{Peer, RoleServer};
use serde::{Deserialize, Serialize};
use tokio::process::Command;

use super::settings::Settings;

/// 応答が無ければ拒否として扱うまでの時間
const ANSWER_TIMEOUT: Duration = Duration::from_secs(120);
/// input_required で送る確認の名前（inputRequests / inputResponses のキー）
const APPROVAL_KEY: &str = "read_approval";

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

/// 承認が得られなかったとき
pub enum Blocked {
    /// 拒否された（エージェントに返す説明）
    Denied(String),
    /// 確認のため、結果の代わりに input_required を返す
    NeedsInput(InputRequiredResult),
}

/// 確認を求めてきたリクエスト
pub struct Caller<'a> {
    pub ctx: &'a RequestContext<RoleServer>,
    pub retry: Retry,
}

/// input_required のあとに送り直されたリクエストの答え（tools/call の inputResponses と requestState）
#[derive(Default)]
pub struct Retry {
    pub responses: Option<InputResponses>,
    pub state: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
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
        caller: &Caller<'_>,
        settings: &Settings,
        req: &ReadRequest<'_>,
    ) -> Result<(), Blocked> {
        let ctx = caller.ctx;
        if self.approved_for_session.load(Ordering::Relaxed) {
            return Ok(());
        }
        let total = self.total();
        if req.estimate <= settings.agent.confirm_docs_per_call
            && total + req.estimate <= settings.agent.confirm_docs_per_session
        {
            return Ok(());
        }
        let ja = settings.japanese_ui();
        let message = message(ja, req, total);
        let decision = if is_stateless(ctx) {
            match answer(req, &caller.retry) {
                Some(d) => d,
                None if supports_form(ctx) => match input_required(&message, req) {
                    Some(r) => return Err(Blocked::NeedsInput(r)),
                    None => native_dialog(&message, ja).await,
                },
                None => native_dialog(&message, ja).await,
            }
        } else {
            ask(&ctx.peer, &message, ja).await
        };
        match decision {
            Decision::Once => Ok(()),
            Decision::Session => {
                self.approved_for_session.store(true, Ordering::Relaxed);
                Ok(())
            }
            Decision::Deny => Err(Blocked::Denied(format!(
                "The user did not approve reading up to {} documents ({} {}). \
                 Ask for fewer documents (a smaller limit, or the fields parameter with paging), \
                 or ask the user to approve it.",
                req.estimate, req.tool, req.target
            ))),
        }
    }
}

fn message(ja: bool, req: &ReadRequest<'_>, total: u64) -> String {
    if ja {
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
    }
}

/// initialize を経ずに、2026-07-28 版以降のリクエストごとの _meta で話しているか
fn is_stateless(ctx: &RequestContext<RoleServer>) -> bool {
    ctx.peer.peer_info().is_none()
        && ctx
            .protocol_version()
            .is_some_and(|v| v >= ProtocolVersion::V_2026_07_28)
}

/// このリクエストの _meta で、フォームの elicitation に対応すると宣言しているか
fn supports_form(ctx: &RequestContext<RoleServer>) -> bool {
    ctx.client_capabilities()
        .and_then(|c| c.elicitation)
        // form も url も無い {} は form に対応しているとみなす（仕様の後方互換）
        .is_some_and(|e| e.form.is_some() || e.url.is_none())
}

/// どの読み取りへの確認かを表す requestState。答えを別の読み取りに使い回さないよう、送り直しで一致を確かめる。
/// 中身を書き換えられても、確認がやり直しになるだけなので署名はしない
fn request_state(req: &ReadRequest<'_>) -> String {
    serde_json::json!([
        "read-approval/v1",
        req.connection,
        req.tool,
        req.target,
        req.estimate
    ])
    .to_string()
}

fn input_required(message: &str, req: &ReadRequest<'_>) -> Option<InputRequiredResult> {
    let schema = ElicitationSchema::from_type::<Approval>().ok()?;
    let params = ElicitRequestParams::FormElicitationParams {
        meta: None,
        message: message.to_owned(),
        requested_schema: schema,
    };
    let mut requests = InputRequests::new();
    requests.insert(
        APPROVAL_KEY.to_owned(),
        InputRequest::Elicitation(ElicitRequest::new(params)),
    );
    Some(InputRequiredResult::new(
        Some(requests),
        Some(request_state(req)),
    ))
}

/// 送り直されたリクエストに、この読み取りへの答えがあれば読む。無ければ（または別の読み取りへの答えなら）None
fn answer(req: &ReadRequest<'_>, retry: &Retry) -> Option<Decision> {
    if retry.state.as_deref() != Some(request_state(req).as_str()) {
        return None;
    }
    let value = retry.responses.as_ref()?.get(APPROVAL_KEY)?;
    let result: ElicitResult = serde_json::from_value(value.clone()).ok()?;
    Some(match result.action {
        ElicitationAction::Accept => {
            let session = result
                .content
                .and_then(|c| serde_json::from_value::<Approval>(c).ok())
                .is_some_and(|a| a.allow_for_this_session);
            if session {
                Decision::Session
            } else {
                Decision::Once
            }
        }
        _ => Decision::Deny,
    })
}

async fn ask(peer: &Peer<RoleServer>, message: &str, ja: bool) -> Decision {
    match peer
        .elicit_with_timeout::<Approval>(message.to_owned(), Some(ANSWER_TIMEOUT))
        .await
    {
        Ok(Some(a)) if a.allow_for_this_session => Decision::Session,
        Ok(_) => Decision::Once,
        Err(ElicitationError::UserDeclined | ElicitationError::UserCancelled) => Decision::Deny,
        // エージェントが対応していない（またはエラー）なら OS のダイアログで尋ねる
        Err(_) => native_dialog(message, ja).await,
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

    fn req(estimate: u64) -> ReadRequest<'static> {
        ReadRequest {
            connection: "Prod",
            tool: "run_query",
            target: "orders",
            estimate,
        }
    }

    fn retry(state: Option<String>, response: Option<serde_json::Value>) -> Retry {
        Retry {
            responses: response.map(|v| InputResponses::from([(APPROVAL_KEY.to_owned(), v)])),
            state,
        }
    }

    #[test]
    fn builds_an_input_required_result() {
        let r = input_required("allow?", &req(500)).unwrap();
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["resultType"], "input_required");
        let ask = &v["inputRequests"][APPROVAL_KEY];
        assert_eq!(ask["method"], "elicitation/create");
        assert_eq!(ask["params"]["mode"], "form");
        assert_eq!(ask["params"]["message"], "allow?");
        assert!(
            ask["params"]["requestedSchema"]["properties"]["allow_for_this_session"].is_object()
        );
        assert_eq!(v["requestState"], request_state(&req(500)));
    }

    #[test]
    fn reads_answers_from_the_retry() {
        let state = Some(request_state(&req(500)));
        let accept = serde_json::json!({ "action": "accept", "content": { "allow_for_this_session": false } });
        let session = serde_json::json!({ "action": "accept", "content": { "allow_for_this_session": true } });
        assert_eq!(
            answer(&req(500), &retry(state.clone(), Some(accept.clone()))),
            Some(Decision::Once)
        );
        assert_eq!(
            answer(&req(500), &retry(state.clone(), Some(session))),
            Some(Decision::Session)
        );
        for action in ["decline", "cancel"] {
            let r = retry(state.clone(), Some(serde_json::json!({ "action": action })));
            assert_eq!(answer(&req(500), &r), Some(Decision::Deny));
        }
        // 最初のリクエスト、答えが無い、別の読み取りへの答えは、もう一度尋ねる
        assert_eq!(answer(&req(500), &Retry::default()), None);
        assert_eq!(answer(&req(500), &retry(state, None)), None);
        assert_eq!(
            answer(
                &req(900),
                &retry(Some(request_state(&req(500))), Some(accept.clone()))
            ),
            None
        );
        assert_eq!(answer(&req(500), &retry(None, Some(accept))), None);
    }
}
