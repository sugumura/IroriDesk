mod client;
pub mod document;
pub mod path;
pub mod query;
pub mod value;

pub use client::{build_http_client, FirestoreApi, RestClient};
pub(crate) use client::check_status_for;
