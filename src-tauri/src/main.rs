// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `irori-desk mcp` は AI エージェント向けの MCP サーバー（画面は出さない）
    if std::env::args().nth(1).as_deref() == Some("mcp") {
        irori_desk_lib::run_mcp();
    } else {
        irori_desk_lib::run()
    }
}
