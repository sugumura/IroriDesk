use crate::error::{AppError, AppResult};

/// `users/abc/orders` のような相対パスを検証してセグメントに分割する
pub fn split_relative(path: &str) -> AppResult<Vec<&str>> {
    let trimmed = path.trim_matches('/');
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let segments: Vec<&str> = trimmed.split('/').collect();
    if segments.iter().any(|s| s.is_empty()) {
        return Err(AppError::InvalidInput(format!(
            "パスに空のセグメントがあります: {path}"
        )));
    }
    Ok(segments)
}

/// ドキュメントパス（セグメント数が偶数）であることを確認する。空はルート扱い
pub fn document_segments(path: &str) -> AppResult<Vec<&str>> {
    let segments = split_relative(path)?;
    if segments.len() % 2 != 0 {
        return Err(AppError::InvalidInput(format!(
            "ドキュメントパスではありません: {path}"
        )));
    }
    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_and_trims() {
        assert_eq!(split_relative("/a/b/").unwrap(), vec!["a", "b"]);
        assert!(split_relative("").unwrap().is_empty());
        assert!(split_relative("a//b").is_err());
    }

    #[test]
    fn document_path_must_be_even() {
        assert!(document_segments("users").is_err());
        assert_eq!(document_segments("users/u1").unwrap(), vec!["users", "u1"]);
    }
}
