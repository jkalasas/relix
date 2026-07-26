use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

#[derive(Debug)]
pub struct SocksConnect {
    pub host: String,
    pub port: u16,
}

pub async fn accept_socks5_connect(stream: &mut TcpStream) -> Result<SocksConnect, String> {
    let mut header = [0u8; 2];
    stream
        .read_exact(&mut header)
        .await
        .map_err(|e| format!("SOCKS read failed: {e}"))?;

    if header[0] != 0x05 {
        return Err(format!("Unsupported SOCKS version {}", header[0]));
    }

    let nmethods = header[1] as usize;
    let mut methods = vec![0u8; nmethods];
    if nmethods > 0 {
        stream
            .read_exact(&mut methods)
            .await
            .map_err(|e| format!("SOCKS methods read failed: {e}"))?;
    }

    if !methods.iter().any(|m| *m == 0x00) {
        stream
            .write_all(&[0x05, 0xFF])
            .await
            .map_err(|e| format!("SOCKS write failed: {e}"))?;
        return Err("SOCKS client requires authentication".into());
    }

    stream
        .write_all(&[0x05, 0x00])
        .await
        .map_err(|e| format!("SOCKS write failed: {e}"))?;

    let mut req = [0u8; 4];
    stream
        .read_exact(&mut req)
        .await
        .map_err(|e| format!("SOCKS request read failed: {e}"))?;

    if req[0] != 0x05 {
        return Err(format!("Unsupported SOCKS version {}", req[0]));
    }
    if req[1] != 0x01 {
        let _ = reply_failure(stream, 0x07).await;
        return Err("Only SOCKS CONNECT is supported".into());
    }

    let host = match req[3] {
        0x01 => {
            let mut addr = [0u8; 4];
            stream
                .read_exact(&mut addr)
                .await
                .map_err(|e| format!("SOCKS IPv4 read failed: {e}"))?;
            std::net::Ipv4Addr::from(addr).to_string()
        }
        0x03 => {
            let mut len = [0u8; 1];
            stream
                .read_exact(&mut len)
                .await
                .map_err(|e| format!("SOCKS domain length read failed: {e}"))?;
            let mut name = vec![0u8; len[0] as usize];
            stream
                .read_exact(&mut name)
                .await
                .map_err(|e| format!("SOCKS domain read failed: {e}"))?;
            String::from_utf8(name).map_err(|_| "SOCKS domain is not valid UTF-8".to_string())?
        }
        0x04 => {
            let mut addr = [0u8; 16];
            stream
                .read_exact(&mut addr)
                .await
                .map_err(|e| format!("SOCKS IPv6 read failed: {e}"))?;
            std::net::Ipv6Addr::from(addr).to_string()
        }
        other => {
            let _ = reply_failure(stream, 0x08).await;
            return Err(format!("Unsupported SOCKS address type {other}"));
        }
    };

    let mut port_bytes = [0u8; 2];
    stream
        .read_exact(&mut port_bytes)
        .await
        .map_err(|e| format!("SOCKS port read failed: {e}"))?;
    let port = u16::from_be_bytes(port_bytes);

    Ok(SocksConnect { host, port })
}

pub async fn reply_success(stream: &mut TcpStream) -> Result<(), String> {
    stream
        .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        .await
        .map_err(|e| format!("SOCKS success reply failed: {e}"))
}

pub async fn reply_failure(stream: &mut TcpStream, code: u8) -> Result<(), String> {
    stream
        .write_all(&[0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        .await
        .map_err(|e| format!("SOCKS failure reply failed: {e}"))
}
