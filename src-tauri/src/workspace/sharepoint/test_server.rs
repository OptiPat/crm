use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

#[derive(Clone)]
pub struct ScriptedResponse {
    pub status: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
}

impl ScriptedResponse {
    pub fn json(status: u16, body: impl Into<String>) -> Self {
        Self {
            status,
            content_type: "application/json",
            body: body.into().into_bytes(),
        }
    }

    pub fn bytes(status: u16, body: impl Into<Vec<u8>>) -> Self {
        Self {
            status,
            content_type: "application/octet-stream",
            body: body.into(),
        }
    }

    pub fn disconnect() -> Self {
        Self {
            status: 0,
            content_type: "application/octet-stream",
            body: Vec::new(),
        }
    }
}

pub struct ScriptedGraphServer {
    pub base_url: String,
    requests: Arc<Mutex<Vec<String>>>,
    handle: Option<JoinHandle<()>>,
}

impl ScriptedGraphServer {
    pub fn spawn(responses: Vec<ScriptedResponse>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Graph");
        let address = listener.local_addr().expect("fake Graph address");
        let base_url = format!("http://{address}");
        let responses = responses
            .into_iter()
            .map(|mut response| {
                if let Ok(body) = String::from_utf8(response.body.clone()) {
                    response.body = body.replace("{{BASE_URL}}", &base_url).into_bytes();
                }
                response
            })
            .collect::<Vec<_>>();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&requests);
        let handle = thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().expect("fake Graph accept");
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .expect("fake Graph timeout");
                let request = read_http_request(&mut stream);
                captured.lock().expect("captured requests").push(request);
                if response.status == 0 {
                    continue;
                }
                let reason = match response.status {
                    200 => "OK",
                    201 => "Created",
                    204 => "No Content",
                    401 => "Unauthorized",
                    404 => "Not Found",
                    412 => "Precondition Failed",
                    429 => "Too Many Requests",
                    _ => "Test",
                };
                let headers = format!(
                    "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    response.status,
                    reason,
                    response.content_type,
                    response.body.len()
                );
                stream.write_all(headers.as_bytes()).expect("fake headers");
                stream.write_all(&response.body).expect("fake body");
                stream.flush().expect("fake flush");
            }
        });
        Self {
            base_url,
            requests,
            handle: Some(handle),
        }
    }

    pub fn finish(mut self) -> Vec<String> {
        if let Some(handle) = self.handle.take() {
            handle.join().expect("fake Graph thread");
        }
        Arc::try_unwrap(self.requests)
            .expect("single request owner")
            .into_inner()
            .expect("captured requests")
    }
}

fn read_http_request(stream: &mut impl Read) -> String {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => {
                bytes.extend_from_slice(&buffer[..read]);
                if request_is_complete(&bytes) {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn request_is_complete(bytes: &[u8]) -> bool {
    let Some(header_end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") else {
        return false;
    };
    let header_text = String::from_utf8_lossy(&bytes[..header_end]);
    let content_length = header_text
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .unwrap_or(0);
    bytes.len() >= header_end + 4 + content_length
}
