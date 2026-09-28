mod auth;
mod connection;
mod error;
mod firestore;

use std::sync::Arc;

use auth::AdcTokenSource;
use connection::ConnectionConfig;
use error::AppResult;
use firestore::document::{DisplayDocument, DocumentPage};
use firestore::{FirestoreApi, RestClient};

struct AppState {
    http: reqwest::Client,
    adc: Arc<AdcTokenSource>,
}

impl AppState {
    fn client(&self, conn: &ConnectionConfig) -> AppResult<RestClient> {
        RestClient::from_connection(conn, self.http.clone(), self.adc.clone())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            http: firestore::build_http_client(),
            adc: Arc::default(),
        })
        .invoke_handler(tauri::generate_handler![
            list_collection_ids,
            get_document,
            list_documents
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
