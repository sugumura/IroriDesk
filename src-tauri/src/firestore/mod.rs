mod client;
pub mod document;
pub mod indexes;
pub mod path;
pub mod query;
pub mod value;

pub(crate) use client::check_status_for;
pub use client::{build_http_client, FirestoreApi, RestClient};
