use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::{AppHandle, Emitter};

const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Lyricly</title></head>
<body style="font-family: sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#0f0f14; color:#fff;">
  <div style="text-align:center;">
    <h2>Lyricly connected 🎶</h2>
    <p>You can close this tab and return to the app.</p>
  </div>
</body></html>"#;

/// Starts a one-shot HTTP server on 127.0.0.1:<port>, waits for Spotify's
/// OAuth redirect (which will hit /callback?code=...), extracts the
/// authorization code, and emits it to the frontend as "oauth-code-received".
///
/// This runs on a background thread so it doesn't block the Tauri event loop,
/// and it exits automatically after handling exactly one request.
pub fn start(app: AppHandle, port: u16) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("Failed to bind callback port {port}: {e}"))?;

    std::thread::spawn(move || {
        // Only need to handle the single redirect Spotify sends back.
        if let Ok((mut stream, _addr)) = listener.accept() {
            let mut buffer = [0u8; 4096];
            let bytes_read = stream.read(&mut buffer).unwrap_or(0);
            let request = String::from_utf8_lossy(&buffer[..bytes_read]);

            // Request line looks like: "GET /callback?code=AQC...&state=... HTTP/1.1"
            if let Some(code) = extract_code(&request) {
                let _ = app.emit("oauth-code-received", code);
            }

            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
                SUCCESS_HTML.len(),
                SUCCESS_HTML
            );
            let _ = stream.write_all(response.as_bytes());
        }
    });

    Ok(())
}

fn extract_code(raw_request: &str) -> Option<String> {
    let request_line = raw_request.lines().next()?;
    let path_and_query = request_line.split_whitespace().nth(1)?;
    let query = path_and_query.split('?').nth(1)?;

    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next()?;
        let value = parts.next().unwrap_or("");
        if key == "code" {
            return Some(urldecode(value));
        }
    }
    None
}

/// Minimal percent-decoding sufficient for OAuth codes (which are
/// URL-safe base64, but Spotify may still percent-encode '=' etc).
fn urldecode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(hex);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}
