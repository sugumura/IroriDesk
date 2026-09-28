//! Firestore のインデックス情報（管理用 API。読み取りのみ）

use serde::{Deserialize, Serialize};

/// インデックスに含まれる1フィールド
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexField {
    pub field_path: String,
    /// asc / desc / array-contains / vector
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CompositeIndex {
    /// インデックスID（リソース名の末尾）
    pub id: String,
    pub collection_group: String,
    /// COLLECTION / COLLECTION_GROUP
    pub query_scope: String,
    pub fields: Vec<IndexField>,
    /// READY / CREATING / NEEDS_REPAIR
    pub state: String,
}

/// 単一フィールドの例外設定
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldOverride {
    pub field_path: String,
    /// 空なら自動インデックスを無効にしている
    pub indexes: Vec<FieldIndex>,
    /// TTL ポリシーが設定されている
    pub ttl: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldIndex {
    pub query_scope: String,
    pub mode: String,
    pub state: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionIndexes {
    pub collection_group: String,
    pub composite: Vec<CompositeIndex>,
    pub field_overrides: Vec<FieldOverride>,
}

// --- REST の応答 ---

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestIndexField {
    #[serde(default)]
    field_path: String,
    order: Option<String>,
    array_config: Option<String>,
    vector_config: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestIndex {
    #[serde(default)]
    name: String,
    #[serde(default)]
    query_scope: String,
    #[serde(default)]
    fields: Vec<RestIndexField>,
    #[serde(default)]
    state: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListIndexesResponse {
    #[serde(default)]
    pub indexes: Vec<RestIndex>,
    pub next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestIndexConfig {
    #[serde(default)]
    indexes: Vec<RestIndex>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestField {
    #[serde(default)]
    name: String,
    index_config: Option<RestIndexConfig>,
    ttl_config: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListFieldsResponse {
    #[serde(default)]
    pub fields: Vec<RestField>,
    pub next_page_token: Option<String>,
}

fn mode(f: &RestIndexField) -> String {
    if f.vector_config.is_some() {
        return "vector".into();
    }
    match (f.order.as_deref(), f.array_config.as_deref()) {
        (Some("DESCENDING"), _) => "desc".into(),
        (Some(_), _) => "asc".into(),
        (None, Some(_)) => "array-contains".into(),
        _ => "asc".into(),
    }
}

/// `.../collectionGroups/{cg}/indexes/{id}` や `.../fields/{path}` から名前の要素を取り出す
fn segment_after<'a>(name: &'a str, key: &str) -> &'a str {
    name.split_once(&format!("/{key}/"))
        .map(|(_, rest)| rest.split('/').next().unwrap_or(rest))
        .unwrap_or("")
}

impl From<RestIndex> for CompositeIndex {
    fn from(i: RestIndex) -> Self {
        CompositeIndex {
            id: i.name.rsplit('/').next().unwrap_or_default().to_owned(),
            collection_group: segment_after(&i.name, "collectionGroups").to_owned(),
            query_scope: i.query_scope,
            fields: i
                .fields
                .iter()
                .map(|f| IndexField {
                    field_path: f.field_path.clone(),
                    mode: mode(f),
                })
                .collect(),
            state: i.state,
        }
    }
}

impl RestField {
    /// 既定の設定（`__default__` や `*`）は除いて例外設定だけにする
    pub(crate) fn into_override(self) -> Option<FieldOverride> {
        let field_path = self
            .name
            .split_once("/fields/")
            .map(|(_, p)| p.to_owned())?;
        if field_path == "*" || segment_after(&self.name, "collectionGroups") == "__default__" {
            return None;
        }
        let indexes = self
            .index_config
            .map(|c| {
                c.indexes
                    .into_iter()
                    .map(|i| FieldIndex {
                        query_scope: i.query_scope,
                        mode: i.fields.first().map(mode).unwrap_or_else(|| "asc".into()),
                        state: i.state,
                    })
                    .collect()
            })
            .unwrap_or_default();
        Some(FieldOverride {
            field_path,
            indexes,
            ttl: self.ttl_config.is_some(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn converts_composite_index() {
        let r: ListIndexesResponse = serde_json::from_value(json!({
            "indexes": [{
                "name": "projects/p/databases/(default)/collectionGroups/logs/indexes/CICAgOjXh4EK",
                "queryScope": "COLLECTION",
                "fields": [
                    { "fieldPath": "level", "order": "ASCENDING" },
                    { "fieldPath": "tags", "arrayConfig": "CONTAINS" },
                    { "fieldPath": "seq", "order": "DESCENDING" },
                    { "fieldPath": "__name__", "order": "DESCENDING" }
                ],
                "state": "CREATING"
            }]
        }))
        .unwrap();
        let idx: CompositeIndex = r.indexes.into_iter().next().unwrap().into();
        assert_eq!(idx.id, "CICAgOjXh4EK");
        assert_eq!(idx.collection_group, "logs");
        assert_eq!(idx.state, "CREATING");
        let modes: Vec<_> = idx.fields.iter().map(|f| f.mode.as_str()).collect();
        assert_eq!(modes, vec!["asc", "array-contains", "desc", "desc"]);
    }

    #[test]
    fn keeps_only_field_overrides() {
        let r: ListFieldsResponse = serde_json::from_value(json!({
            "fields": [
                { "name": "projects/p/databases/(default)/collectionGroups/__default__/fields/*",
                  "indexConfig": { "indexes": [{ "queryScope": "COLLECTION", "fields": [{ "fieldPath": "*", "order": "ASCENDING" }], "state": "READY" }] } },
                { "name": "projects/p/databases/(default)/collectionGroups/logs/fields/body",
                  "indexConfig": {} },
                { "name": "projects/p/databases/(default)/collectionGroups/logs/fields/expireAt",
                  "indexConfig": { "indexes": [{ "queryScope": "COLLECTION_GROUP", "fields": [{ "fieldPath": "expireAt", "order": "DESCENDING" }], "state": "READY" }] },
                  "ttlConfig": { "state": "ACTIVE" } }
            ]
        }))
        .unwrap();
        let overrides: Vec<_> = r
            .fields
            .into_iter()
            .filter_map(RestField::into_override)
            .collect();
        assert_eq!(overrides.len(), 2);
        assert_eq!(overrides[0].field_path, "body");
        assert!(overrides[0].indexes.is_empty());
        assert!(overrides[1].ttl);
        assert_eq!(overrides[1].indexes[0].mode, "desc");
        assert_eq!(overrides[1].indexes[0].query_scope, "COLLECTION_GROUP");
    }
}
