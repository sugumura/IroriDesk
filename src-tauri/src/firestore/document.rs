use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::value::fields_to_display;
use crate::error::{AppError, AppResult};

/// ドキュメント一覧の1ページ
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPage {
    pub documents: Vec<DisplayDocument>,
    pub next_page_token: Option<String>,
}

/// runQuery の結果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub documents: Vec<DisplayDocument>,
    pub read_time: Option<String>,
    /// 送信した structuredQuery（画面で確認できるようにする）
    pub structured_query: Value,
}

/// REST の Document リソース
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestDocument {
    pub name: String,
    #[serde(default)]
    pub fields: Map<String, Value>,
    pub create_time: Option<String>,
    pub update_time: Option<String>,
}

/// フロントに返すドキュメント。fields は表示用JSON
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayDocument {
    pub id: String,
    /// `users/alice` のような documents 以下の相対パス
    pub path: String,
    /// `projects/.../documents/users/alice` の完全なリソース名
    pub name: String,
    pub fields: Map<String, Value>,
    pub create_time: Option<String>,
    pub update_time: Option<String>,
    /// 実体がなく、サブコレクションだけを持つドキュメント（showMissing で返る）
    pub missing: bool,
}

/// `projects/{p}/databases/{db}/documents/` 以降を取り出す
pub fn relative_path(name: &str) -> AppResult<&str> {
    name.split_once("/documents/")
        .map(|(_, rest)| rest)
        .ok_or_else(|| AppError::Decode(format!("不正なドキュメント名です: {name}")))
}

impl DisplayDocument {
    pub fn from_rest(doc: RestDocument) -> AppResult<Self> {
        let path = relative_path(&doc.name)?.to_owned();
        let id = path.rsplit('/').next().unwrap_or_default().to_owned();
        // showMissing で返る実体のないドキュメントには createTime がない
        let missing = doc.create_time.is_none();
        Ok(Self {
            id,
            path,
            fields: fields_to_display(&doc.fields)?,
            name: doc.name,
            create_time: doc.create_time,
            update_time: doc.update_time,
            missing,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn converts_rest_document() {
        let doc: RestDocument = serde_json::from_value(json!({
            "name": "projects/p/databases/(default)/documents/users/alice/orders/o1",
            "fields": { "price": { "integerValue": "12000" } },
            "createTime": "2026-01-01T00:00:00.123456Z",
            "updateTime": "2026-01-01T00:00:00.123456Z"
        }))
        .unwrap();
        let d = DisplayDocument::from_rest(doc).unwrap();
        assert_eq!(d.id, "o1");
        assert_eq!(d.path, "users/alice/orders/o1");
        assert_eq!(Value::Object(d.fields), json!({ "price": 12000 }));
        assert!(!d.missing);
    }

    #[test]
    fn document_without_fields() {
        let doc: RestDocument =
            serde_json::from_value(json!({ "name": "projects/p/databases/d/documents/a/b" }))
                .unwrap();
        let d = DisplayDocument::from_rest(doc).unwrap();
        assert!(d.fields.is_empty());
        assert!(d.missing);
    }
}
