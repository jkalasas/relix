use base64::{
    engine::general_purpose::{STANDARD as B64, STANDARD_NO_PAD as B64_NO_PAD},
    Engine as _,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

use super::error::{SshError, SshErrorCode};

pub const STORE_FILE: &str = "relix.json";
pub const KNOWN_HOSTS_KEY: &str = "known_hosts";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnownHostEntry {
    pub algorithm: String,
    pub key_base64: String,
}

pub type KnownHosts = HashMap<String, KnownHostEntry>;

pub fn host_key_id(hostname: &str, port: u16) -> String {
    format!("{}:{}", hostname.trim().to_lowercase(), port)
}

pub fn fingerprint_sha256(key_bytes: &[u8]) -> String {
    let digest = Sha256::digest(key_bytes);
    // OpenSSH SHA256 fingerprints use unpadded base64 (ssh-keygen -lf).
    format!("SHA256:{}", B64_NO_PAD.encode(digest))
}

pub enum HostKeyCheck {
    Match,
    Unknown,
    Changed { previous: KnownHostEntry },
}

pub fn check_host_key(
    known: &KnownHosts,
    hostname: &str,
    port: u16,
    algorithm: &str,
    key_bytes: &[u8],
) -> HostKeyCheck {
    let id = host_key_id(hostname, port);
    let key_base64 = B64.encode(key_bytes);
    match known.get(&id) {
        None => HostKeyCheck::Unknown,
        Some(entry)
            if entry.algorithm == algorithm && entry.key_base64 == key_base64 =>
        {
            HostKeyCheck::Match
        }
        Some(entry) => HostKeyCheck::Changed {
            previous: entry.clone(),
        },
    }
}

pub fn host_key_error(
    check: HostKeyCheck,
    hostname: &str,
    port: u16,
    algorithm: &str,
    key_bytes: &[u8],
) -> Option<SshError> {
    let key_base64 = B64.encode(key_bytes);
    let fingerprint = fingerprint_sha256(key_bytes);
    match check {
        HostKeyCheck::Match => None,
        HostKeyCheck::Unknown => Some(
            SshError::new(
                SshErrorCode::HostKeyUnknown,
                format!("Host key for {hostname}:{port} is not trusted yet"),
            )
            .with_host_key(hostname, port, algorithm, key_base64, fingerprint),
        ),
        HostKeyCheck::Changed { .. } => Some(
            SshError::new(
                SshErrorCode::HostKeyChanged,
                format!(
                    "Host key for {hostname}:{port} does not match the stored key"
                ),
            )
            .with_host_key(hostname, port, algorithm, key_base64, fingerprint),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_known() -> KnownHosts {
        let mut map = KnownHosts::new();
        map.insert(
            host_key_id("Example.COM", 22),
            KnownHostEntry {
                algorithm: "ssh-ed25519".into(),
                key_base64: B64.encode(b"key-bytes-a"),
            },
        );
        map
    }

    #[test]
    fn host_key_id_lowercases_host() {
        assert_eq!(host_key_id("Example.COM", 22), "example.com:22");
    }

    #[test]
    fn check_match() {
        let known = sample_known();
        let result = check_host_key(&known, "example.com", 22, "ssh-ed25519", b"key-bytes-a");
        assert!(matches!(result, HostKeyCheck::Match));
    }

    #[test]
    fn check_unknown() {
        let known = sample_known();
        let result = check_host_key(&known, "other", 22, "ssh-ed25519", b"key-bytes-a");
        assert!(matches!(result, HostKeyCheck::Unknown));
    }

    #[test]
    fn check_changed() {
        let known = sample_known();
        let result = check_host_key(&known, "example.com", 22, "ssh-ed25519", b"key-bytes-b");
        assert!(matches!(result, HostKeyCheck::Changed { .. }));
    }

    #[test]
    fn fingerprint_is_prefixed_unpadded() {
        let fp = fingerprint_sha256(b"abc");
        assert!(fp.starts_with("SHA256:"));
        // OpenSSH fingerprints are unpadded base64 — no trailing '='.
        assert!(!fp.ends_with('='), "fingerprint must not have base64 padding: {fp}");
        // Known SHA256 of b"abc" as unpadded base64.
        assert_eq!(fp, "SHA256:ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0");
    }
}
