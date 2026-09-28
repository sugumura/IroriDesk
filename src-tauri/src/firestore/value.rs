//! Firestore REST の型付き Value と「表示用JSON」の相互変換。
//!
//! 表示用JSONの規則（docs/SPEC.md「型変換」「決定事項」参照）:
//! - JSON で表せない型は、キーが1つだけの `$` ラッパー object で表す
//!   (`$int` `$double` `$timestamp` `$bytes` `$ref` `$geo`)
//! - map のキーが `$` で始まる場合は `$` を1つ追加してエスケープする
//! - 整数値の double と NaN/Infinity は `$double` で包み、integer と区別する
//! - Timestamp はマイクロ秒6桁の RFC3339 UTC に正規化する

use base64::Engine;
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{json, Map, Number, Value};

use crate::error::{AppError, AppResult};

/// JavaScript の Number.MAX_SAFE_INTEGER
const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;

const W_INT: &str = "$int";
const W_DOUBLE: &str = "$double";
const W_TIMESTAMP: &str = "$timestamp";
const W_BYTES: &str = "$bytes";
const W_REF: &str = "$ref";
const W_GEO: &str = "$geo";

fn decode_err(msg: impl Into<String>) -> AppError {
    AppError::Decode(msg.into())
}

fn invalid(msg: impl Into<String>) -> AppError {
    AppError::InvalidInput(msg.into())
}

fn wrap(key: &str, value: Value) -> Value {
    let mut m = Map::with_capacity(1);
    m.insert(key.to_owned(), value);
    Value::Object(m)
}

// ---------------------------------------------------------------------------
// キーのエスケープ
// ---------------------------------------------------------------------------

pub fn escape_key(key: &str) -> String {
    if key.starts_with('$') {
        format!("${key}")
    } else {
        key.to_owned()
    }
}

fn unescape_key(key: &str) -> AppResult<String> {
    match key.strip_prefix('$') {
        None => Ok(key.to_owned()),
        Some(rest) if rest.starts_with('$') => Ok(rest.to_owned()),
        Some(_) => Err(invalid(tr!(
            "キー `{key}` は `$` で始まるため `${key}` とエスケープしてください",
            "Key `{key}` starts with `$`, so escape it as `${key}`"
        ))),
    }
}

// ---------------------------------------------------------------------------
// Firestore Value -> 表示用JSON
// ---------------------------------------------------------------------------

/// Document.fields / mapValue.fields を表示用 object に変換する
pub fn fields_to_display(fields: &Map<String, Value>) -> AppResult<Map<String, Value>> {
    fields
        .iter()
        .map(|(k, v)| Ok((escape_key(k), to_display(v)?)))
        .collect()
}

pub fn to_display(value: &Value) -> AppResult<Value> {
    let obj = value.as_object().ok_or_else(|| {
        decode_err(tr!(
            "Value が object ではありません: {value}",
            "Value is not an object: {value}"
        ))
    })?;
    let (kind, inner) = obj
        .iter()
        .next()
        .ok_or_else(|| decode_err(tr!("空の Value です", "Empty Value")))?;

    match kind.as_str() {
        "nullValue" => Ok(Value::Null),
        "booleanValue" => inner.as_bool().map(Value::Bool).ok_or_else(|| {
            decode_err(tr!(
                "booleanValue が bool ではありません",
                "booleanValue is not a bool"
            ))
        }),
        "integerValue" => {
            let n = parse_int(inner).ok_or_else(|| {
                decode_err(tr!(
                    "不正な integerValue: {inner}",
                    "Invalid integerValue: {inner}"
                ))
            })?;
            Ok(if (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&n) {
                json!(n)
            } else {
                wrap(W_INT, json!(n.to_string()))
            })
        }
        "doubleValue" => {
            let f = parse_double(inner).ok_or_else(|| {
                decode_err(tr!(
                    "不正な doubleValue: {inner}",
                    "Invalid doubleValue: {inner}"
                ))
            })?;
            Ok(double_to_display(f))
        }
        "timestampValue" => {
            let s = inner.as_str().ok_or_else(|| {
                decode_err(tr!(
                    "timestampValue が文字列ではありません",
                    "timestampValue is not a string"
                ))
            })?;
            let ts = normalize_timestamp(s).map_err(decode_err)?;
            Ok(wrap(W_TIMESTAMP, json!(ts)))
        }
        "stringValue" => inner.as_str().map(|s| json!(s)).ok_or_else(|| {
            decode_err(tr!(
                "stringValue が文字列ではありません",
                "stringValue is not a string"
            ))
        }),
        "bytesValue" => inner
            .as_str()
            .map(|s| wrap(W_BYTES, json!(s)))
            .ok_or_else(|| {
                decode_err(tr!(
                    "bytesValue が文字列ではありません",
                    "bytesValue is not a string"
                ))
            }),
        "referenceValue" => inner
            .as_str()
            .map(|s| wrap(W_REF, json!(s)))
            .ok_or_else(|| {
                decode_err(tr!(
                    "referenceValue が文字列ではありません",
                    "referenceValue is not a string"
                ))
            }),
        "geoPointValue" => {
            // proto3 JSON では 0 のフィールドが省略される
            let lat = inner.get("latitude").and_then(Value::as_f64).unwrap_or(0.0);
            let lng = inner
                .get("longitude")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            Ok(wrap(W_GEO, json!({ "lat": lat, "lng": lng })))
        }
        "arrayValue" => match inner.get("values") {
            None => Ok(json!([])),
            Some(Value::Array(values)) => values
                .iter()
                .map(to_display)
                .collect::<AppResult<Vec<_>>>()
                .map(Value::Array),
            Some(other) => Err(decode_err(tr!(
                "arrayValue.values が配列ではありません: {other}",
                "arrayValue.values is not an array: {other}"
            ))),
        },
        "mapValue" => match inner.get("fields") {
            None => Ok(json!({})),
            Some(Value::Object(fields)) => fields_to_display(fields).map(Value::Object),
            Some(other) => Err(decode_err(tr!(
                "mapValue.fields が object ではありません: {other}",
                "mapValue.fields is not an object: {other}"
            ))),
        },
        other => Err(decode_err(tr!(
            "未知の Value 型です: {other}",
            "Unknown Value type: {other}"
        ))),
    }
}

/// integerValue は int64 を文字列で返すが、数値でも受け付ける
fn parse_int(v: &Value) -> Option<i64> {
    match v {
        Value::String(s) => s.parse().ok(),
        Value::Number(n) => n.as_i64(),
        _ => None,
    }
}

/// doubleValue は数値、または "NaN" / "Infinity" / "-Infinity"
fn parse_double(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => match s.as_str() {
            "NaN" => Some(f64::NAN),
            "Infinity" => Some(f64::INFINITY),
            "-Infinity" => Some(f64::NEG_INFINITY),
            _ => None,
        },
        _ => None,
    }
}

fn non_finite_name(f: f64) -> &'static str {
    if f.is_nan() {
        "NaN"
    } else if f > 0.0 {
        "Infinity"
    } else {
        "-Infinity"
    }
}

fn double_to_display(f: f64) -> Value {
    if !f.is_finite() {
        return wrap(W_DOUBLE, json!(non_finite_name(f)));
    }
    let n = Value::Number(Number::from_f64(f).expect("有限値"));
    if f.fract() == 0.0 {
        // 1.0 などは JSON 上 integer と区別できないため包む
        wrap(W_DOUBLE, n)
    } else {
        n
    }
}

/// RFC3339 をマイクロ秒6桁の UTC 表記に正規化する（それより細かい桁は切り捨て）
pub fn normalize_timestamp(s: &str) -> Result<String, String> {
    let dt = DateTime::parse_from_rfc3339(s)
        .map_err(|e| tr!("不正な日時 `{s}`: {e}", "Invalid date-time `{s}`: {e}"))?;
    Ok(dt
        .with_timezone(&Utc)
        .to_rfc3339_opts(SecondsFormat::Micros, true))
}

// ---------------------------------------------------------------------------
// 表示用JSON -> Firestore Value（第2段階の書き込み用）
// ---------------------------------------------------------------------------

/// 表示用 object を Document.fields に変換する
#[allow(dead_code)] // 第2段階（書き込み）で使用する
pub fn fields_from_display(obj: &Map<String, Value>) -> AppResult<Map<String, Value>> {
    obj.iter()
        .map(|(k, v)| Ok((unescape_key(k)?, from_display(v)?)))
        .collect()
}

#[allow(dead_code)] // 第2段階（書き込み）で使用する
pub fn from_display(value: &Value) -> AppResult<Value> {
    match value {
        Value::Null => Ok(json!({ "nullValue": null })),
        Value::Bool(b) => Ok(json!({ "booleanValue": b })),
        Value::String(s) => Ok(json!({ "stringValue": s })),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(json!({ "integerValue": i.to_string() }))
            } else if n.is_u64() {
                Err(invalid(tr!(
                    "整数 {n} は int64 の範囲外です",
                    "Integer {n} is out of int64 range"
                )))
            } else {
                Ok(json!({ "doubleValue": n }))
            }
        }
        Value::Array(items) => {
            let values = items
                .iter()
                .map(from_display)
                .collect::<AppResult<Vec<_>>>()?;
            Ok(json!({ "arrayValue": { "values": values } }))
        }
        Value::Object(obj) => {
            if obj.len() == 1 {
                let (k, v) = obj.iter().next().expect("len == 1");
                if let Some(converted) = wrapper_from_display(k, v)? {
                    return Ok(converted);
                }
            }
            Ok(json!({ "mapValue": { "fields": fields_from_display(obj)? } }))
        }
    }
}

/// `$` ラッパーなら Some を返す。`$$` で始まるエスケープ済みキーは None（通常の map）
fn wrapper_from_display(key: &str, v: &Value) -> AppResult<Option<Value>> {
    let converted = match key {
        W_INT => {
            let s = v.as_str().ok_or_else(|| {
                invalid(tr!(
                    "$int は文字列で指定してください",
                    "Specify $int as a string"
                ))
            })?;
            let n: i64 = s.parse().map_err(|_| {
                invalid(tr!(
                    "$int `{s}` は int64 として解釈できません",
                    "$int `{s}` cannot be parsed as int64"
                ))
            })?;
            json!({ "integerValue": n.to_string() })
        }
        W_DOUBLE => {
            let f = parse_double(v).ok_or_else(|| {
                invalid(tr!("$double は数値か \"NaN\" / \"Infinity\" / \"-Infinity\" で指定してください: {v}", "Specify $double as a number or \"NaN\" / \"Infinity\" / \"-Infinity\": {v}"))
            })?;
            if f.is_finite() {
                json!({ "doubleValue": Number::from_f64(f).expect("有限値") })
            } else {
                json!({ "doubleValue": non_finite_name(f) })
            }
        }
        W_TIMESTAMP => {
            let s = v.as_str().ok_or_else(|| {
                invalid(tr!(
                    "$timestamp は文字列で指定してください",
                    "Specify $timestamp as a string"
                ))
            })?;
            json!({ "timestampValue": normalize_timestamp(s).map_err(invalid)? })
        }
        W_BYTES => {
            let s = v.as_str().ok_or_else(|| {
                invalid(tr!(
                    "$bytes は base64 文字列で指定してください",
                    "Specify $bytes as a base64 string"
                ))
            })?;
            base64::engine::general_purpose::STANDARD
                .decode(s)
                .map_err(|e| {
                    invalid(tr!(
                        "$bytes が base64 として不正です: {e}",
                        "$bytes is not valid base64: {e}"
                    ))
                })?;
            json!({ "bytesValue": s })
        }
        W_REF => {
            let s = v.as_str().ok_or_else(|| {
                invalid(tr!(
                    "$ref は文字列で指定してください",
                    "Specify $ref as a string"
                ))
            })?;
            if !(s.starts_with("projects/")
                && s.contains("/databases/")
                && s.contains("/documents/"))
            {
                return Err(invalid(tr!(
                    "$ref は projects/{{p}}/databases/{{db}}/documents/... の形式で指定してください: {s}", "Specify $ref in the form projects/{{p}}/databases/{{db}}/documents/...: {s}"
                )));
            }
            json!({ "referenceValue": s })
        }
        W_GEO => {
            let lat = v.get("lat").and_then(Value::as_f64);
            let lng = v.get("lng").and_then(Value::as_f64);
            match (lat, lng) {
                (Some(lat), Some(lng))
                    if (-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lng) =>
                {
                    json!({ "geoPointValue": { "latitude": lat, "longitude": lng } })
                }
                _ => {
                    return Err(invalid(tr!(
                        "$geo は {{\"lat\": -90..90, \"lng\": -180..180}} で指定してください: {v}",
                        "Specify $geo as {{\"lat\": -90..90, \"lng\": -180..180}}: {v}"
                    )))
                }
            }
        }
        _ => return Ok(None),
    };
    Ok(Some(converted))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(v: Value) -> Value {
        to_display(&v).unwrap()
    }

    fn f(v: Value) -> Value {
        from_display(&v).unwrap()
    }

    #[test]
    fn scalars_to_display() {
        assert_eq!(d(json!({ "nullValue": null })), Value::Null);
        assert_eq!(d(json!({ "booleanValue": false })), json!(false));
        assert_eq!(
            d(json!({ "stringValue": "こんにちは" })),
            json!("こんにちは")
        );
        assert_eq!(
            d(json!({ "bytesValue": "AAE=" })),
            json!({ "$bytes": "AAE=" })
        );
        assert_eq!(
            d(json!({ "referenceValue": "projects/p/databases/(default)/documents/a/b" })),
            json!({ "$ref": "projects/p/databases/(default)/documents/a/b" })
        );
    }

    #[test]
    fn integers_respect_safe_range() {
        assert_eq!(d(json!({ "integerValue": "42" })), json!(42));
        assert_eq!(
            d(json!({ "integerValue": "-9007199254740991" })),
            json!(-9007199254740991_i64)
        );
        assert_eq!(
            d(json!({ "integerValue": "9007199254740992" })),
            json!({ "$int": "9007199254740992" })
        );
        assert_eq!(
            d(json!({ "integerValue": "-9223372036854775808" })),
            json!({ "$int": "-9223372036854775808" })
        );
        // 数値で返ってきても受け付ける
        assert_eq!(d(json!({ "integerValue": 7 })), json!(7));
        assert!(to_display(&json!({ "integerValue": "1.5" })).is_err());
    }

    #[test]
    fn doubles() {
        assert_eq!(d(json!({ "doubleValue": 92.5 })), json!(92.5));
        // proto3 JSON は 1.0 を 1 と出力する
        assert_eq!(d(json!({ "doubleValue": 1 })), json!({ "$double": 1.0 }));
        assert_eq!(
            d(json!({ "doubleValue": "NaN" })),
            json!({ "$double": "NaN" })
        );
        assert_eq!(
            d(json!({ "doubleValue": "Infinity" })),
            json!({ "$double": "Infinity" })
        );
        assert_eq!(
            d(json!({ "doubleValue": "-Infinity" })),
            json!({ "$double": "-Infinity" })
        );
    }

    #[test]
    fn timestamps_are_normalized_to_micros() {
        let cases = [
            ("2026-01-01T00:00:00Z", "2026-01-01T00:00:00.000000Z"),
            ("2026-01-01T00:00:00.1Z", "2026-01-01T00:00:00.100000Z"),
            (
                "2026-01-01T00:00:00.123456789Z",
                "2026-01-01T00:00:00.123456Z",
            ),
            ("2026-01-01T09:00:00+09:00", "2026-01-01T00:00:00.000000Z"),
        ];
        for (input, expected) in cases {
            assert_eq!(
                d(json!({ "timestampValue": input })),
                json!({ "$timestamp": expected }),
                "{input}"
            );
        }
        assert!(to_display(&json!({ "timestampValue": "2026-13-01" })).is_err());
    }

    #[test]
    fn geo_point_fills_omitted_zero() {
        assert_eq!(
            d(json!({ "geoPointValue": { "latitude": 35.5, "longitude": 139.7 } })),
            json!({ "$geo": { "lat": 35.5, "lng": 139.7 } })
        );
        assert_eq!(
            d(json!({ "geoPointValue": { "longitude": 139.7 } })),
            json!({ "$geo": { "lat": 0.0, "lng": 139.7 } })
        );
        assert_eq!(
            d(json!({ "geoPointValue": {} })),
            json!({ "$geo": { "lat": 0.0, "lng": 0.0 } })
        );
    }

    #[test]
    fn nested_and_empty_containers() {
        assert_eq!(d(json!({ "arrayValue": {} })), json!([]));
        assert_eq!(d(json!({ "mapValue": {} })), json!({}));
        let v = json!({ "mapValue": { "fields": {
            "list": { "arrayValue": { "values": [
                { "integerValue": "1" },
                { "mapValue": { "fields": { "deep": { "booleanValue": true } } } }
            ] } }
        } } });
        assert_eq!(d(v), json!({ "list": [1, { "deep": true }] }));
    }

    #[test]
    fn dollar_keys_are_escaped() {
        let v = json!({ "mapValue": { "fields": {
            "$ref": { "stringValue": "not a reference" },
            "$$x": { "integerValue": "1" },
            "a$": { "integerValue": "2" }
        } } });
        assert_eq!(
            d(v.clone()),
            json!({ "$$ref": "not a reference", "$$$x": 1, "a$": 2 })
        );
        assert_eq!(f(d(v.clone())), v);
    }

    #[test]
    fn unknown_or_malformed_values_are_errors() {
        assert!(to_display(&json!({ "fooValue": 1 })).is_err());
        assert!(to_display(&json!({})).is_err());
        assert!(to_display(&json!("raw")).is_err());
        assert!(to_display(&json!({ "arrayValue": { "values": 1 } })).is_err());
    }

    #[test]
    fn from_display_numbers() {
        assert_eq!(f(json!(5)), json!({ "integerValue": "5" }));
        assert_eq!(f(json!(-5)), json!({ "integerValue": "-5" }));
        assert_eq!(f(json!(2.5)), json!({ "doubleValue": 2.5 }));
        assert_eq!(f(json!({ "$double": 3 })), json!({ "doubleValue": 3.0 }));
        assert_eq!(
            f(json!({ "$double": "NaN" })),
            json!({ "doubleValue": "NaN" })
        );
        assert_eq!(
            f(json!({ "$int": "9223372036854775807" })),
            json!({ "integerValue": "9223372036854775807" })
        );
        assert!(from_display(&json!(u64::MAX)).is_err());
        assert!(from_display(&json!({ "$int": "9223372036854775808" })).is_err());
        assert!(from_display(&json!({ "$int": 1 })).is_err());
        assert!(from_display(&json!({ "$double": "nan" })).is_err());
    }

    #[test]
    fn from_display_wrapper_validation() {
        assert_eq!(
            f(json!({ "$timestamp": "2026-01-01T09:00:00+09:00" })),
            json!({ "timestampValue": "2026-01-01T00:00:00.000000Z" })
        );
        assert!(from_display(&json!({ "$timestamp": "yesterday" })).is_err());
        assert!(from_display(&json!({ "$bytes": "***" })).is_err());
        assert!(from_display(&json!({ "$ref": "users/alice" })).is_err());
        assert!(from_display(&json!({ "$geo": { "lat": 91, "lng": 0 } })).is_err());
        assert!(from_display(&json!({ "$geo": { "lat": 1 } })).is_err());
    }

    #[test]
    fn from_display_rejects_unescaped_dollar_keys() {
        // ラッパーではない $ キー（キーが2つ以上、または未知のラッパー名）
        assert!(
            from_display(&json!({ "$ref": "projects/p/databases/d/documents/a/b", "x": 1 }))
                .is_err()
        );
        assert!(from_display(&json!({ "$unknown": 1 })).is_err());
        assert_eq!(
            f(json!({ "$$unknown": 1 })),
            json!({ "mapValue": { "fields": { "$unknown": { "integerValue": "1" } } } })
        );
    }

    /// 正規形の Firestore Value は 表示用JSON を経由しても元に戻る
    #[test]
    fn round_trip_from_firestore() {
        let fields = json!({
            "null": { "nullValue": null },
            "bool": { "booleanValue": true },
            "int": { "integerValue": "30" },
            "bigInt": { "integerValue": "9007199254740993" },
            "minInt": { "integerValue": "-9223372036854775808" },
            "double": { "doubleValue": 92.5 },
            "wholeDouble": { "doubleValue": 1.0 },
            "negZero": { "doubleValue": -0.0 },
            "nan": { "doubleValue": "NaN" },
            "inf": { "doubleValue": "-Infinity" },
            "ts": { "timestampValue": "2026-01-01T09:00:00.123456Z" },
            "str": { "stringValue": "" },
            "bytes": { "bytesValue": "iVBORw0KGgo=" },
            "ref": { "referenceValue": "projects/p/databases/(default)/documents/users/bob" },
            "geo": { "geoPointValue": { "latitude": 35.681236, "longitude": 139.767125 } },
            "emptyArr": { "arrayValue": { "values": [] } },
            "emptyMap": { "mapValue": { "fields": {} } },
            "$ref": { "stringValue": "ドルで始まるキー" },
            "nested": { "mapValue": { "fields": {
                "tags": { "arrayValue": { "values": [
                    { "stringValue": "admin" },
                    { "arrayValue": { "values": [{ "integerValue": "1" }] } }
                ] } },
                "$geo": { "mapValue": { "fields": { "lat": { "integerValue": "1" } } } }
            } } }
        });
        let fields = fields.as_object().unwrap();
        let display = fields_to_display(fields).unwrap();
        assert_eq!(&fields_from_display(&display).unwrap(), fields);
    }

    /// 表示用JSON も Firestore Value を経由して元に戻る
    #[test]
    fn round_trip_from_display() {
        let display = json!({
            "n": null,
            "b": false,
            "i": -12,
            "big": { "$int": "-9007199254740993" },
            "d": 0.25,
            "whole": { "$double": 2.0 },
            "inf": { "$double": "Infinity" },
            "ts": { "$timestamp": "1970-01-01T00:00:00.000001Z" },
            "bytes": { "$bytes": "" },
            "ref": { "$ref": "projects/p/databases/named-db/documents/a/b/c/d" },
            "geo": { "$geo": { "lat": -33.5, "lng": 0.0 } },
            "arr": [1, "two", [3.5], { "k": { "$timestamp": "2026-12-31T23:59:59.999999Z" } }],
            "$$escaped": { "$$int": "not a wrapper" }
        });
        let obj = display.as_object().unwrap();
        let fields = fields_from_display(obj).unwrap();
        assert_eq!(&fields_to_display(&fields).unwrap(), obj);
    }
}
