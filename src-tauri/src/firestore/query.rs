//! クエリフォームの入力（QuerySpec）を runQuery の structuredQuery に変換する

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::path::{collection_segments, split_relative};
use super::value::normalize_timestamp;
use crate::error::{AppError, AppResult};

pub const MAX_LIMIT: u32 = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TargetKind {
    Collection,
    CollectionGroup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WhereOp {
    #[serde(rename = "==")]
    Eq,
    #[serde(rename = "!=")]
    Ne,
    #[serde(rename = "<")]
    Lt,
    #[serde(rename = "<=")]
    Le,
    #[serde(rename = ">")]
    Gt,
    #[serde(rename = ">=")]
    Ge,
    #[serde(rename = "in")]
    In,
    #[serde(rename = "not-in")]
    NotIn,
    #[serde(rename = "array-contains")]
    ArrayContains,
    #[serde(rename = "array-contains-any")]
    ArrayContainsAny,
}

impl WhereOp {
    fn api_name(self) -> &'static str {
        match self {
            WhereOp::Eq => "EQUAL",
            WhereOp::Ne => "NOT_EQUAL",
            WhereOp::Lt => "LESS_THAN",
            WhereOp::Le => "LESS_THAN_OR_EQUAL",
            WhereOp::Gt => "GREATER_THAN",
            WhereOp::Ge => "GREATER_THAN_OR_EQUAL",
            WhereOp::In => "IN",
            WhereOp::NotIn => "NOT_IN",
            WhereOp::ArrayContains => "ARRAY_CONTAINS",
            WhereOp::ArrayContainsAny => "ARRAY_CONTAINS_ANY",
        }
    }

    /// 値をカンマ区切りのリストとして受け取る演算子
    fn takes_list(self) -> bool {
        matches!(
            self,
            WhereOp::In | WhereOp::NotIn | WhereOp::ArrayContainsAny
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValueType {
    String,
    Integer,
    Double,
    Boolean,
    Null,
    Timestamp,
    Reference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhereClause {
    pub field: String,
    pub op: WhereOp,
    pub value_type: ValueType,
    #[serde(default)]
    pub value: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Direction {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderClause {
    pub field: String,
    pub direction: Direction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuerySpec {
    pub target_kind: TargetKind,
    /// collection ならコレクションパス、collectionGroup ならコレクションID
    pub target: String,
    #[serde(default, rename = "where")]
    pub where_: Vec<WhereClause>,
    #[serde(default)]
    pub order_by: Vec<OrderClause>,
    pub limit: Option<u32>,
}

/// runQuery を呼ぶ親（documents からの相対セグメント）とリクエスト本文
#[derive(Debug)]
pub struct BuiltQuery {
    pub parent_segments: Vec<String>,
    pub body: Value,
}

impl BuiltQuery {
    /// 条件に一致する件数を数える runAggregationQuery の本文（limit と orderBy は外す）
    pub fn count_body(&self) -> Value {
        let mut sq = self.body["structuredQuery"].clone();
        if let Some(obj) = sq.as_object_mut() {
            obj.remove("limit");
            obj.remove("orderBy");
        }
        json!({
            "structuredAggregationQuery": {
                "structuredQuery": sq,
                "aggregations": [{ "alias": "count", "count": {} }]
            }
        })
    }
}

fn invalid(msg: impl Into<String>) -> AppError {
    AppError::InvalidInput(msg.into())
}

/// `profile.address.city` のようなドット区切りを fieldPath に変換する。
/// 識別子として使えないセグメントはバッククォートで囲む。すでにバッククォートを含む入力はそのまま使う
pub fn to_field_path(input: &str) -> AppResult<String> {
    let input = input.trim();
    if input.is_empty() {
        return Err(invalid(tr!("フィールド名が空です", "Field name is empty")));
    }
    if input == "__name__" || input.contains('`') {
        return Ok(input.to_owned());
    }
    let segments: Vec<&str> = input.split('.').collect();
    if segments.iter().any(|s| s.is_empty()) {
        return Err(invalid(tr!(
            "フィールドパスに空のセグメントがあります: {input}",
            "The field path has an empty segment: {input}"
        )));
    }
    Ok(segments
        .iter()
        .map(|s| {
            let simple = s
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
                && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
            if simple {
                (*s).to_owned()
            } else {
                format!("`{}`", s.replace('\\', "\\\\").replace('`', "\\`"))
            }
        })
        .collect::<Vec<_>>()
        .join("."))
}

struct Ctx<'a> {
    /// `projects/{p}/databases/{db}/documents`
    documents_root: &'a str,
    /// コレクション指定時のコレクションパス（`__name__` にIDだけ渡されたときに使う）
    collection_path: Option<&'a str>,
}

impl Ctx<'_> {
    fn reference(&self, raw: &str, is_name_field: bool) -> AppResult<Value> {
        let raw = raw.trim();
        let full = if raw.starts_with("projects/") {
            raw.to_owned()
        } else if raw.contains('/') {
            let segs = split_relative(raw)?;
            if segs.len() % 2 != 0 {
                return Err(invalid(tr!(
                    "ドキュメントパスではありません: {raw}",
                    "Not a document path: {raw}"
                )));
            }
            format!("{}/{}", self.documents_root, segs.join("/"))
        } else if is_name_field {
            let col = self.collection_path.ok_or_else(|| {
                invalid(tr!("collectionGroup クエリの __name__ にはドキュメントの完全なパスを指定してください", "For __name__ in a collectionGroup query, specify the full document path"))
            })?;
            if raw.is_empty() {
                return Err(invalid(tr!(
                    "ドキュメントIDが空です",
                    "Document ID is empty"
                )));
            }
            format!("{}/{}/{}", self.documents_root, col, raw)
        } else {
            return Err(invalid(tr!(
                "reference にはドキュメントパス（users/alice など）を指定してください: {raw}",
                "Specify a document path (e.g. users/alice) for reference: {raw}"
            )));
        };
        Ok(json!({ "referenceValue": full }))
    }

    fn scalar(&self, ty: ValueType, raw: &str, is_name_field: bool) -> AppResult<Value> {
        // __name__ はドキュメント参照で比較する
        if is_name_field && matches!(ty, ValueType::String | ValueType::Reference) {
            return self.reference(raw, true);
        }
        let t = raw.trim();
        Ok(match ty {
            ValueType::String => json!({ "stringValue": raw }),
            ValueType::Integer => {
                let n: i64 = t.parse().map_err(|_| {
                    invalid(tr!(
                        "integer として解釈できません: {raw}",
                        "Cannot parse as integer: {raw}"
                    ))
                })?;
                json!({ "integerValue": n.to_string() })
            }
            ValueType::Double => match t {
                "NaN" | "Infinity" | "-Infinity" => json!({ "doubleValue": t }),
                _ => {
                    let f: f64 = t.parse().map_err(|_| {
                        invalid(tr!(
                            "double として解釈できません: {raw}",
                            "Cannot parse as double: {raw}"
                        ))
                    })?;
                    json!({ "doubleValue": f })
                }
            },
            ValueType::Boolean => match t {
                "true" => json!({ "booleanValue": true }),
                "false" => json!({ "booleanValue": false }),
                _ => {
                    return Err(invalid(tr!(
                        "boolean は true / false で指定してください: {raw}",
                        "Specify boolean as true / false: {raw}"
                    )))
                }
            },
            ValueType::Null => json!({ "nullValue": null }),
            ValueType::Timestamp => {
                let ts = normalize_timestamp(t).map_err(|e| {
                    invalid(tr!(
                        "{e}（例: 2026-01-01T00:00:00Z / 2026-01-01T09:00:00+09:00）",
                        "{e} (e.g. 2026-01-01T00:00:00Z / 2026-01-01T09:00:00+09:00)"
                    ))
                })?;
                json!({ "timestampValue": ts })
            }
            ValueType::Reference => self.reference(raw, false)?,
        })
    }

    fn filter(&self, w: &WhereClause) -> AppResult<Value> {
        let field_path = to_field_path(&w.field)?;
        let is_name = field_path == "__name__";
        let field = json!({ "fieldPath": field_path });

        // null / NaN との等値比較は unaryFilter で表す
        let is_nan = w.value_type == ValueType::Double && w.value.trim() == "NaN";
        if w.value_type == ValueType::Null || is_nan {
            let op = match (w.op, is_nan) {
                (WhereOp::Eq, false) => "IS_NULL",
                (WhereOp::Ne, false) => "IS_NOT_NULL",
                (WhereOp::Eq, true) => "IS_NAN",
                (WhereOp::Ne, true) => "IS_NOT_NAN",
                _ => {
                    return Err(invalid(tr!(
                        "{} との比較は == / != のみ使えます（{}）",
                        "Only == / != can be used to compare with {} ({})",
                        if is_nan { "NaN" } else { "null" },
                        w.field
                    )))
                }
            };
            return Ok(json!({ "unaryFilter": { "op": op, "field": field } }));
        }

        let value = if w.op.takes_list() {
            let items: Vec<&str> = w
                .value
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect();
            if items.is_empty() {
                return Err(invalid(tr!(
                    "{} の値をカンマ区切りで指定してください",
                    "Specify the values for {} separated by commas",
                    w.field
                )));
            }
            let values = items
                .iter()
                .map(|s| self.scalar(w.value_type, s, is_name))
                .collect::<AppResult<Vec<_>>>()?;
            json!({ "arrayValue": { "values": values } })
        } else {
            self.scalar(w.value_type, &w.value, is_name)?
        };
        Ok(json!({
            "fieldFilter": { "field": field, "op": w.op.api_name(), "value": value }
        }))
    }
}

/// `documents_root` は `projects/{p}/databases/{db}/documents`
pub fn build(spec: &QuerySpec, documents_root: &str) -> AppResult<BuiltQuery> {
    let target = spec.target.trim();
    let (parent_segments, from, collection_path) = match spec.target_kind {
        TargetKind::Collection => {
            let segs = collection_segments(target)?;
            let (id, parent) = segs.split_last().expect("奇数個のセグメント");
            (
                parent.iter().map(|s| (*s).to_owned()).collect(),
                json!({ "collectionId": id }),
                Some(segs.join("/")),
            )
        }
        TargetKind::CollectionGroup => {
            if target.is_empty() || target.contains('/') {
                return Err(invalid(tr!(
                    "collectionGroup にはコレクションID（/ を含まない）を指定してください",
                    "Specify a collection ID (without /) for collectionGroup"
                )));
            }
            (
                Vec::new(),
                json!({ "collectionId": target, "allDescendants": true }),
                None,
            )
        }
    };

    let ctx = Ctx {
        documents_root,
        collection_path: collection_path.as_deref(),
    };

    let mut sq = serde_json::Map::new();
    sq.insert("from".into(), json!([from]));

    let filters = spec
        .where_
        .iter()
        .map(|w| ctx.filter(w))
        .collect::<AppResult<Vec<_>>>()?;
    match filters.len() {
        0 => {}
        1 => {
            sq.insert(
                "where".into(),
                filters.into_iter().next().expect("len == 1"),
            );
        }
        _ => {
            sq.insert(
                "where".into(),
                json!({ "compositeFilter": { "op": "AND", "filters": filters } }),
            );
        }
    }

    if !spec.order_by.is_empty() {
        let order = spec
            .order_by
            .iter()
            .map(|o| {
                Ok(json!({
                    "field": { "fieldPath": to_field_path(&o.field)? },
                    "direction": match o.direction {
                        Direction::Asc => "ASCENDING",
                        Direction::Desc => "DESCENDING",
                    }
                }))
            })
            .collect::<AppResult<Vec<_>>>()?;
        sq.insert("orderBy".into(), Value::Array(order));
    }

    if let Some(limit) = spec.limit {
        if limit == 0 || limit > MAX_LIMIT {
            return Err(invalid(tr!(
                "limit は 1〜{MAX_LIMIT} で指定してください",
                "limit must be between 1 and {MAX_LIMIT}"
            )));
        }
        sq.insert("limit".into(), json!(limit));
    }

    Ok(BuiltQuery {
        parent_segments,
        body: json!({ "structuredQuery": sq }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = "projects/p/databases/(default)/documents";

    fn spec(kind: TargetKind, target: &str) -> QuerySpec {
        QuerySpec {
            target_kind: kind,
            target: target.into(),
            where_: vec![],
            order_by: vec![],
            limit: None,
        }
    }

    fn w(field: &str, op: WhereOp, ty: ValueType, value: &str) -> WhereClause {
        WhereClause {
            field: field.into(),
            op,
            value_type: ty,
            value: value.into(),
        }
    }

    fn where_of(clause: WhereClause) -> AppResult<Value> {
        let mut s = spec(TargetKind::Collection, "users");
        s.where_ = vec![clause];
        build(&s, ROOT).map(|b| b.body["structuredQuery"]["where"].clone())
    }

    #[test]
    fn field_paths() {
        assert_eq!(to_field_path("age").unwrap(), "age");
        assert_eq!(
            to_field_path("profile.address.city").unwrap(),
            "profile.address.city"
        );
        assert_eq!(to_field_path("a.first-name.b").unwrap(), "a.`first-name`.b");
        assert_eq!(to_field_path("日本語").unwrap(), "`日本語`");
        assert_eq!(to_field_path("1st").unwrap(), "`1st`");
        assert_eq!(to_field_path("$ref").unwrap(), "`$ref`");
        assert_eq!(to_field_path("`a.b`.c").unwrap(), "`a.b`.c");
        assert_eq!(to_field_path("__name__").unwrap(), "__name__");
        assert!(to_field_path("a..b").is_err());
        assert!(to_field_path(" ").is_err());
    }

    #[test]
    fn collection_target_uses_parent() {
        let b = build(&spec(TargetKind::Collection, "users/alice/orders"), ROOT).unwrap();
        assert_eq!(b.parent_segments, vec!["users", "alice"]);
        assert_eq!(
            b.body,
            json!({ "structuredQuery": { "from": [{ "collectionId": "orders" }] } })
        );
        assert!(build(&spec(TargetKind::Collection, "users/alice"), ROOT).is_err());
    }

    #[test]
    fn collection_group_target() {
        let b = build(&spec(TargetKind::CollectionGroup, "orders"), ROOT).unwrap();
        assert!(b.parent_segments.is_empty());
        assert_eq!(
            b.body["structuredQuery"]["from"],
            json!([{ "collectionId": "orders", "allDescendants": true }])
        );
        assert!(build(&spec(TargetKind::CollectionGroup, "users/orders"), ROOT).is_err());
    }

    #[test]
    fn typed_values() {
        let cases = [
            (ValueType::String, " a ", json!({ "stringValue": " a " })),
            (ValueType::Integer, "42", json!({ "integerValue": "42" })),
            (ValueType::Double, "1.5", json!({ "doubleValue": 1.5 })),
            (
                ValueType::Double,
                "Infinity",
                json!({ "doubleValue": "Infinity" }),
            ),
            (ValueType::Boolean, "true", json!({ "booleanValue": true })),
            (
                ValueType::Timestamp,
                "2026-01-01T09:00:00+09:00",
                json!({ "timestampValue": "2026-01-01T00:00:00.000000Z" }),
            ),
            (
                ValueType::Reference,
                "users/bob",
                json!({ "referenceValue": format!("{ROOT}/users/bob") }),
            ),
        ];
        for (ty, raw, expected) in cases {
            let f = where_of(w("f", WhereOp::Eq, ty, raw)).unwrap();
            assert_eq!(f["fieldFilter"]["value"], expected, "{ty:?} {raw}");
            assert_eq!(f["fieldFilter"]["op"], "EQUAL");
        }
        assert!(where_of(w("f", WhereOp::Eq, ValueType::Integer, "1.5")).is_err());
        assert!(where_of(w("f", WhereOp::Eq, ValueType::Boolean, "yes")).is_err());
        assert!(where_of(w("f", WhereOp::Eq, ValueType::Timestamp, "2026-01-01")).is_err());
        assert!(where_of(w("f", WhereOp::Eq, ValueType::Reference, "bob")).is_err());
    }

    #[test]
    fn null_and_nan_become_unary_filters() {
        let cases = [
            (WhereOp::Eq, ValueType::Null, "", "IS_NULL"),
            (WhereOp::Ne, ValueType::Null, "", "IS_NOT_NULL"),
            (WhereOp::Eq, ValueType::Double, "NaN", "IS_NAN"),
            (WhereOp::Ne, ValueType::Double, " NaN ", "IS_NOT_NAN"),
        ];
        for (op, ty, raw, expected) in cases {
            assert_eq!(
                where_of(w("nickname", op, ty, raw)).unwrap(),
                json!({ "unaryFilter": { "op": expected, "field": { "fieldPath": "nickname" } } })
            );
        }
        assert!(where_of(w("x", WhereOp::Lt, ValueType::Null, "")).is_err());
    }

    #[test]
    fn list_operators_split_on_commas() {
        let f = where_of(w(
            "tags",
            WhereOp::ArrayContainsAny,
            ValueType::String,
            "admin, beta ,",
        ))
        .unwrap();
        assert_eq!(
            f,
            json!({ "fieldFilter": {
                "field": { "fieldPath": "tags" },
                "op": "ARRAY_CONTAINS_ANY",
                "value": { "arrayValue": { "values": [
                    { "stringValue": "admin" }, { "stringValue": "beta" }
                ] } }
            } })
        );
        let f = where_of(w("age", WhereOp::NotIn, ValueType::Integer, "1,2")).unwrap();
        assert_eq!(f["fieldFilter"]["op"], "NOT_IN");
        assert!(where_of(w("age", WhereOp::In, ValueType::Integer, " , ")).is_err());
        assert!(where_of(w("age", WhereOp::In, ValueType::Integer, "1,x")).is_err());
    }

    #[test]
    fn name_field_accepts_ids_and_paths() {
        let f = where_of(w("__name__", WhereOp::Eq, ValueType::String, "alice")).unwrap();
        assert_eq!(
            f["fieldFilter"]["value"],
            json!({ "referenceValue": format!("{ROOT}/users/alice") })
        );
        let f = where_of(w(
            "__name__",
            WhereOp::In,
            ValueType::String,
            "alice, users/bob",
        ))
        .unwrap();
        assert_eq!(
            f["fieldFilter"]["value"]["arrayValue"]["values"][1],
            json!({ "referenceValue": format!("{ROOT}/users/bob") })
        );

        let mut s = spec(TargetKind::CollectionGroup, "orders");
        s.where_ = vec![w("__name__", WhereOp::Eq, ValueType::String, "o1")];
        assert!(build(&s, ROOT).is_err());
    }

    #[test]
    fn multiple_filters_order_and_limit() {
        let mut s = spec(TargetKind::Collection, "users");
        s.where_ = vec![
            w("age", WhereOp::Ge, ValueType::Integer, "20"),
            w("active", WhereOp::Eq, ValueType::Boolean, "true"),
        ];
        s.order_by = vec![
            OrderClause {
                field: "age".into(),
                direction: Direction::Desc,
            },
            OrderClause {
                field: "name".into(),
                direction: Direction::Asc,
            },
        ];
        s.limit = Some(10);
        let sq = build(&s, ROOT).unwrap().body["structuredQuery"].clone();
        assert_eq!(sq["where"]["compositeFilter"]["op"], "AND");
        assert_eq!(
            sq["where"]["compositeFilter"]["filters"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            sq["orderBy"],
            json!([
                { "field": { "fieldPath": "age" }, "direction": "DESCENDING" },
                { "field": { "fieldPath": "name" }, "direction": "ASCENDING" }
            ])
        );
        assert_eq!(sq["limit"], 10);

        s.limit = Some(0);
        assert!(build(&s, ROOT).is_err());
        s.limit = Some(MAX_LIMIT + 1);
        assert!(build(&s, ROOT).is_err());
    }

    #[test]
    fn spec_deserializes_from_frontend_json() {
        let s: QuerySpec = serde_json::from_value(json!({
            "targetKind": "collectionGroup",
            "target": "orders",
            "where": [{ "field": "price", "op": "array-contains-any", "valueType": "integer", "value": "1" }],
            "orderBy": [{ "field": "price", "direction": "desc" }],
            "limit": 5
        }))
        .unwrap();
        assert_eq!(s.where_[0].op, WhereOp::ArrayContainsAny);
        assert_eq!(s.order_by[0].direction, Direction::Desc);
    }

    #[test]
    fn count_body_drops_limit_and_order() {
        let mut s = spec(TargetKind::Collection, "logs");
        s.where_ = vec![w("level", WhereOp::Eq, ValueType::String, "error")];
        s.order_by = vec![OrderClause {
            field: "seq".into(),
            direction: Direction::Desc,
        }];
        s.limit = Some(5);
        let body = build(&s, ROOT).unwrap().count_body();
        let sq = &body["structuredAggregationQuery"]["structuredQuery"];
        assert!(sq.get("limit").is_none());
        assert!(sq.get("orderBy").is_none());
        assert_eq!(sq["where"]["fieldFilter"]["op"], "EQUAL");
        assert_eq!(
            body["structuredAggregationQuery"]["aggregations"],
            json!([{ "alias": "count", "count": {} }])
        );
    }
}
