//! AI エージェントに返すデータの形（表示用 JSON の整形、大きな値の切り詰め、個人情報を伏せる処理、クエリ条件の変換）

use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::connection::AgentPii;
use crate::firebase_auth::DisplayUser;
use crate::firestore::document::DisplayDocument;
use crate::firestore::query::{ValueType, WhereClause, WhereOp};

/// これより長い文字列は先頭だけにする
const MAX_STRING_CHARS: usize = 2000;

/// ドキュメントを、エクスポートと同じ表示用 JSON（__id・__path 付き）にする。fields を指定すると、その項目だけにする
pub fn document_json(doc: &DisplayDocument, fields: Option<&[String]>) -> Value {
    let mut out = Map::new();
    out.insert("__id".into(), json!(doc.id));
    out.insert("__path".into(), json!(doc.path));
    if doc.missing {
        out.insert("__missing".into(), json!(true));
    }
    for (k, v) in &doc.fields {
        if fields.is_none_or(|f| f.iter().any(|name| name == k)) {
            out.insert(k.clone(), shrink(v));
        }
    }
    if let Some(t) = &doc.update_time {
        out.insert("__updateTime".into(), json!(t));
    }
    Value::Object(out)
}

/// bytes は長さだけにし、長すぎる文字列は先頭だけにする
fn shrink(v: &Value) -> Value {
    match v {
        Value::String(s) if s.chars().count() > MAX_STRING_CHARS => {
            let head: String = s.chars().take(MAX_STRING_CHARS).collect();
            json!(format!(
                "{head}… [truncated, {} characters in total]",
                s.chars().count()
            ))
        }
        Value::Array(a) => Value::Array(a.iter().map(shrink).collect()),
        Value::Object(m) => {
            if let Some(Value::String(b64)) = m.get("$bytes").filter(|_| m.len() == 1) {
                return json!({ "$bytes": format!("[{} bytes omitted]", b64.len() * 3 / 4) });
            }
            Value::Object(m.iter().map(|(k, v)| (k.clone(), shrink(v))).collect())
        }
        other => other.clone(),
    }
}

/// 表示用 JSON の値の型名（describe_collection 用）
pub fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::String(_) => "string",
        Value::Number(n) if n.is_i64() || n.is_u64() => "integer",
        Value::Number(_) => "double",
        Value::Array(_) => "array",
        Value::Object(m) if m.len() == 1 => match m.keys().next().map(String::as_str) {
            Some("$int") => "integer",
            Some("$double") => "double",
            Some("$timestamp") => "timestamp",
            Some("$ref") => "reference",
            Some("$geo") => "geopoint",
            Some("$bytes") => "bytes",
            _ => "map",
        },
        Value::Object(_) => "map",
    }
}

/// 値の例（短くした JSON 文字列）
pub fn example(v: &Value) -> String {
    let text = match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    if text.chars().count() > 80 {
        format!("{}…", text.chars().take(80).collect::<String>())
    } else {
        text
    }
}

/// Authentication のユーザー。masked なら個人情報を伏せ、元の応答（raw）や写真の URL は返さない
pub fn user_json(u: &DisplayUser, pii: AgentPii) -> Value {
    let full = pii == AgentPii::Full;
    let mut out = json!({
        "uid": u.uid,
        "email": u.email.as_deref().map(|e| if full { e.to_owned() } else { mask_email(e) }),
        "emailVerified": u.email_verified,
        "displayName": u.display_name.as_deref().map(|n| if full { n.to_owned() } else { mask_name(n) }),
        "phoneNumber": u.phone_number.as_deref().map(|p| if full { p.to_owned() } else { mask_phone(p) }),
        "disabled": u.disabled,
        "providers": u.providers,
        "createdAt": u.created_at,
        "lastLoginAt": u.last_login_at,
        "customClaims": u.custom_claims,
    });
    if full {
        out["photoUrl"] = json!(u.photo_url);
        out["raw"] = u.raw.clone();
    }
    out
}

/// a***@example.com
pub fn mask_email(email: &str) -> String {
    match email.split_once('@') {
        Some((local, domain)) => format!("{}***@{domain}", local.chars().next().unwrap_or('*')),
        None => "***".into(),
    }
}

/// +81*******90（先頭の国番号と末尾2桁だけ残す）
pub fn mask_phone(phone: &str) -> String {
    let chars: Vec<char> = phone.chars().collect();
    if chars.len() <= 5 {
        return "*".repeat(chars.len());
    }
    let head: String = chars[..3].iter().collect();
    let tail: String = chars[chars.len() - 2..].iter().collect();
    format!("{head}{}{tail}", "*".repeat(chars.len() - 5))
}

/// A***
pub fn mask_name(name: &str) -> String {
    format!("{}***", name.chars().next().unwrap_or('*'))
}

/// エージェントが指定する where 条件。value は JSON の値（型は値から判断する）
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AgentWhere {
    /// Field path, e.g. "status" or "profile.city"
    pub field: String,
    /// One of ==, !=, <, <=, >, >=, in, not-in, array-contains, array-contains-any
    pub op: String,
    /// A JSON value: string, number, boolean, null, {"$timestamp": "2026-01-01T00:00:00Z"} or {"$ref": "users/alice"}. Use an array for in, not-in and array-contains-any.
    pub value: Value,
}

/// エージェントの where 条件を、アプリのクエリ条件（QuerySpec の WhereClause）に変換する
pub fn to_where_clause(w: &AgentWhere) -> Result<WhereClause, String> {
    let op: WhereOp = serde_json::from_value(json!(w.op))
        .map_err(|_| format!("Unknown operator \"{}\"", w.op))?;
    let list_op = matches!(w.op.as_str(), "in" | "not-in" | "array-contains-any");
    let values: Vec<&Value> = match (&w.value, list_op) {
        (Value::Array(items), true) if !items.is_empty() => items.iter().collect(),
        (_, true) => return Err(format!("\"{}\" needs a non-empty array as the value", w.op)),
        (Value::Array(_), false) => {
            return Err(format!("\"{}\" doesn't take an array value", w.op));
        }
        (v, false) => vec![v],
    };
    let mut value_type = None;
    let mut texts = Vec::new();
    for v in values {
        let (t, text) = scalar(v)?;
        if value_type.is_some_and(|prev| prev != t) {
            return Err("All values in the list must have the same type".into());
        }
        if list_op && text.contains(',') {
            return Err("List values containing commas are not supported".into());
        }
        value_type = Some(t);
        texts.push(text);
    }
    Ok(WhereClause {
        field: w.field.clone(),
        op,
        value_type: value_type.unwrap_or(ValueType::Null),
        value: texts.join(","),
    })
}

fn scalar(v: &Value) -> Result<(ValueType, String), String> {
    Ok(match v {
        Value::Null => (ValueType::Null, String::new()),
        Value::Bool(b) => (ValueType::Boolean, b.to_string()),
        Value::String(s) => (ValueType::String, s.clone()),
        Value::Number(n) if n.is_i64() || n.is_u64() => (ValueType::Integer, n.to_string()),
        Value::Number(n) => (ValueType::Double, n.to_string()),
        Value::Object(m) if m.len() == 1 => match m.iter().next() {
            Some((k, Value::String(s))) if k == "$timestamp" => (ValueType::Timestamp, s.clone()),
            Some((k, Value::String(s))) if k == "$ref" => (ValueType::Reference, s.clone()),
            Some((k, Value::String(s))) if k == "$int" => (ValueType::Integer, s.clone()),
            _ => return Err(format!("Unsupported value: {v}")),
        },
        _ => return Err(format!("Unsupported value: {v}")),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_personal_information() {
        assert_eq!(mask_email("alice@example.com"), "a***@example.com");
        assert_eq!(mask_phone("+819012345678"), "+81********78");
        assert_eq!(mask_name("Alice"), "A***");
    }

    #[test]
    fn shrinks_bytes_and_long_strings() {
        let v = json!({ "$bytes": "AAAA" });
        assert_eq!(shrink(&v), json!({ "$bytes": "[3 bytes omitted]" }));
        let long = "x".repeat(MAX_STRING_CHARS + 5);
        let s = shrink(&json!(long));
        assert!(s.as_str().unwrap().contains("truncated, 2005 characters"));
    }

    #[test]
    fn names_display_types() {
        assert_eq!(
            type_name(&json!({ "$timestamp": "2026-01-01T00:00:00Z" })),
            "timestamp"
        );
        assert_eq!(type_name(&json!({ "$int": "9007199254740993" })), "integer");
        assert_eq!(type_name(&json!({ "city": "Tokyo" })), "map");
        assert_eq!(type_name(&json!(1.5)), "double");
        assert_eq!(type_name(&json!(3)), "integer");
    }

    #[test]
    fn converts_where_values() {
        let w = |op: &str, value: Value| AgentWhere {
            field: "f".into(),
            op: op.into(),
            value,
        };
        let c = to_where_clause(&w("==", json!("delivered"))).unwrap();
        assert_eq!(
            (c.value_type, c.value.as_str()),
            (ValueType::String, "delivered")
        );
        let c = to_where_clause(&w(">=", json!(10))).unwrap();
        assert_eq!(c.value_type, ValueType::Integer);
        let c = to_where_clause(&w("<", json!({ "$timestamp": "2026-01-01T00:00:00Z" }))).unwrap();
        assert_eq!(c.value_type, ValueType::Timestamp);
        let c = to_where_clause(&w("in", json!(["a", "b"]))).unwrap();
        assert_eq!(c.value, "a,b");
        assert!(to_where_clause(&w("in", json!("a"))).is_err());
        assert!(to_where_clause(&w("in", json!(["a,b"]))).is_err());
        assert!(to_where_clause(&w("in", json!(["a", 1]))).is_err());
        assert!(to_where_clause(&w("~=", json!(1))).is_err());
    }
}
