mod auth;
mod connection;
mod error;
mod export;
mod firebase_auth;
mod firestore;

use std::sync::Arc;

use auth::AdcTokenSource;
use connection::ConnectionConfig;
use error::AppResult;
use firebase_auth::{AuthClient, DisplayUser, LookupKind, UserPage};
use firestore::document::{DisplayDocument, DocumentPage, QueryResult};
use firestore::query::QuerySpec;
use firestore::{FirestoreApi, RestClient};

struct AppState {
    http: reqwest::Client,
    adc: Arc<AdcTokenSource>,
}

impl AppState {
    fn client(&self, conn: &ConnectionConfig) -> AppResult<RestClient> {
        RestClient::from_connection(conn, self.http.clone(), self.adc.clone())
    }

    fn auth_client(&self, conn: &ConnectionConfig) -> AppResult<AuthClient> {
        AuthClient::from_connection(conn, self.http.clone(), self.adc.clone())
    }
}

/// `parentPath` が空ならルートコレクション、ドキュメントパスならそのサブコレクション
#[tauri::command]
async fn list_collection_ids(
    state: tauri::State<'_, AppState>,
    connection: ConnectionConfig,
    parent_path: Option<String>,
) -> AppResult<Vec<String>> {
    state
        .client(&connection)?
        .list_collection_ids(parent_path.as_deref().unwrap_or(""))
        .await
}

#[tauri::command]
async fn get_document(
    state: tauri::State<'_, AppState>,
    connection: ConnectionConfig,
    path: String,
) -> AppResult<DisplayDocument> {
    state.client(&connection)?.get_document(&path).await
}

#[tauri::command]
async fn list_documents(
    state: tauri::State<'_, AppState>,
    connection: ConnectionConfig,
    collection_path: String,
    page_size: u32,
    page_token: Option<String>,
) -> AppResult<DocumentPage> {
    state
        .client(&connection)?
        .list_documents(&collection_path, page_size, page_token.as_deref())
        .await
}

#[tauri::command]
async fn run_query(
    state: tauri::State<'_, AppState>,
    connection: ConnectionConfig,
    spec: QuerySpec,
) -> AppResult<QueryResult> {
    state.client(&connection)?.run_query(&spec).await
}

#[tauri::command]
async fn list_auth_users(
    state: tauri::State<'_, AppState>,
    connection: ConnectionConfig,
    page_size: u32,
    page_token: Option<String>,
) -> AppResult<UserPage> {
    state
        .auth_client(&connection)?
        .list_users(page_size, page_token.as_deref())
        .await
}

#[tauri::command]
async fn lookup_auth_users(
    state: tauri::State<'_, AppState>,
    connection: ConnectionConfig,
    kind: LookupKind,
    value: String,
) -> AppResult<Vec<DisplayUser>> {
    state.auth_client(&connection)?.lookup(kind, &value).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            http: firestore::build_http_client(),
            adc: Arc::default(),
        })
        .invoke_handler(tauri::generate_handler![
            list_collection_ids,
            get_document,
            list_documents,
            run_query,
            export::save_text_file,
            list_auth_users,
            lookup_auth_users
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
