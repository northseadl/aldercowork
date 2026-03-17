use serde::Serialize;
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use std::sync::Arc;

const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(500);
#[cfg(unix)]
const STOP_POLL_INTERVAL: Duration = Duration::from_millis(100);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
#[cfg(unix)]
const STOP_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize)]
pub struct KernelInfo {
    pub port: u16,
    pub pid: u32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStatusPayload {
    pub running: bool,
    pub port: Option<u16>,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

pub struct KernelManager {
    child: Option<CommandChild>,
    port: Option<u16>,
    pid: Option<u32>,
    /// True only after /health responds — prevents premature SDK connections.
    ready: bool,
    last_error: Option<String>,
    engine_dir: Option<String>,
    /// Provider env vars persisted across restarts
    provider_env: Option<Vec<(String, String)>>,
}

impl KernelManager {
    pub fn new() -> Self {
        Self {
            child: None,
            port: None,
            pid: None,
            ready: false,
            last_error: None,
            engine_dir: None,
            provider_env: None,
        }
    }

    /// Store Provider env for use in current and future starts
    pub fn set_provider_env(&mut self, env: Vec<(String, String)>) {
        self.provider_env = Some(env);
    }

    /// Set the OpenCode engine directory (injected via XDG_CONFIG_HOME + XDG_DATA_HOME)
    pub fn set_engine_dir(&mut self, dir: String) {
        self.engine_dir = Some(dir);
    }

    pub fn spawn_process(
        &mut self,
        app: &AppHandle,
        extra_env: Option<Vec<(String, String)>>,
        state: Arc<Mutex<KernelManager>>,
    ) -> Result<KernelInfo, String> {
        // Already running
        if self.child.is_some() {
            if let Some(port) = self.port {
                return Ok(KernelInfo {
                    port,
                    pid: self.pid.unwrap_or(0),
                    status: "running".into(),
                });
            }
        }

        self.last_error = None;

        // Find available port
        let port = find_available_port().map_err(|e| format!("Failed to allocate port: {e}"))?;

        // Launch sidecar
        let shell = app.shell();
        let mut command = shell
            .sidecar("opencode")
            .map_err(|e| format!("Failed to create sidecar command: {e}"))?
            .args(["serve", "--port", &port.to_string()]);

        // Isolate kernel data from user's own OpenCode installation.
        //
        // IMPORTANT: OpenCode does NOT respect OPENCODE_CONFIG_DIR.
        // It follows XDG spec on ALL platforms (including macOS).
        // We redirect both config and data via XDG env vars:
        //   XDG_CONFIG_HOME → {engine}/  →  config at {engine}/opencode/config.json
        //   XDG_DATA_HOME   → {engine}/  →  DB at {engine}/opencode/opencode.db
        //
        // This ensures AlderCowork's kernel never reads/writes ~/.config/opencode/
        // or ~/.local/share/opencode/, preserving the user's own OpenCode state.
        if let Some(ref engine_dir) = self.engine_dir {
            command = command.env("XDG_CONFIG_HOME", engine_dir);
            command = command.env("XDG_DATA_HOME", engine_dir);
        }

        // Tell OpenCode it's running inside a desktop client
        command = command.env("OPENCODE_CLIENT", "desktop");

        // Disable OpenCode's built-in external skill discovery.
        // Without this, OpenCode scans ~/.claude/skills/, ~/.agents/skills/
        // and walks up from CWD looking for .claude/ and .agents/ directories.
        // AlderCowork manages its own skill pipeline via config.json skills.paths.
        command = command.env("OPENCODE_DISABLE_EXTERNAL_SKILLS", "1");

        // Inject stored provider env (persisted across restarts)
        if let Some(ref stored_env) = self.provider_env {
            for (key, value) in stored_env {
                command = command.env(key, value);
            }
        }

        // Inject per-call extra env (overrides stored env)
        if let Some(env_pairs) = extra_env {
            for (key, value) in env_pairs {
                command = command.env(&key, &value);
            }
        }

        let (mut rx, child) = command
            .spawn()
            .map_err(|e| format!("Failed to spawn opencode: {e}"))?;

        let pid = child.pid();
        self.child = Some(child);
        self.port = Some(port);
        self.pid = Some(pid);
        self.ready = false;

        // Spawn log reader (fire and forget)
        let handle = app.clone();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        eprintln!("[kernel:stdout] {}", String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Stderr(line) => {
                        eprintln!("[kernel:stderr] {}", String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!(
                            "[kernel:exit] code={:?} signal={:?}",
                            payload.code, payload.signal
                        );
                        let message = format!(
                            "Engine process exited (code={:?} signal={:?})",
                            payload.code, payload.signal
                        );
                        let should_notify = {
                            let mut mgr = state.lock().await;
                            if mgr.pid_matches(pid) {
                                mgr.set_last_error(message.clone());
                                let _ = mgr.take_child_if_pid(pid);
                                true
                            } else {
                                false
                            }
                        };
                        if should_notify {
                            let _ = handle.emit("kernel-error", message);
                        }
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(KernelInfo {
            port,
            pid,
            status: "starting".into(),
        })
    }

    /// Mark engine as ready (HTTP health check passed).
    pub fn set_ready(&mut self) {
        self.ready = true;
    }

    pub fn take_child(&mut self) -> Option<CommandChild> {
        let child = self.child.take();
        if child.is_some() {
            self.port = None;
            self.pid = None;
            self.ready = false;
        }
        child
    }

    pub fn take_child_if_pid(&mut self, pid: u32) -> Option<CommandChild> {
        if self.pid == Some(pid) {
            return self.take_child();
        }
        None
    }

    pub fn pid_matches(&self, pid: u32) -> bool {
        self.pid == Some(pid) && self.child.is_some()
    }

    pub fn set_last_error(&mut self, message: impl Into<String>) {
        self.last_error = Some(message.into());
    }

    pub fn clear_last_error(&mut self) {
        self.last_error = None;
    }

    pub fn status(&self) -> KernelStatusPayload {
        KernelStatusPayload {
            running: self.child.is_some(),
            port: if self.ready { self.port } else { None },
            pid: self.pid,
            error: self.last_error.clone(),
        }
    }
}

fn find_available_port() -> Result<u16, std::io::Error> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    Ok(port)
}

pub async fn wait_for_ready(port: u16) -> bool {
    // The engine serves its web UI at /health, returning HTML with 200 OK.
    // We just need HTTP 200 — don't parse the body.
    let url = format!("http://127.0.0.1:{port}/health");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    let deadline = tokio::time::Instant::now() + STARTUP_TIMEOUT;

    while tokio::time::Instant::now() < deadline {
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                eprintln!("[kernel] engine ready on port {port}");
                return true;
            }
            _ => {}
        }
        sleep(HEALTH_POLL_INTERVAL).await;
    }

    eprintln!("[kernel] engine failed to become ready within timeout");
    false
}

pub async fn stop_child_process(child: CommandChild) {
    #[cfg(unix)]
    {
        use std::process::Command;

        let pid = child.pid();
        if let Err(error) = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .output()
        {
            eprintln!("[kernel] failed to send SIGTERM to pid {pid}: {error}");
        } else {
            let deadline = tokio::time::Instant::now() + STOP_TIMEOUT;
            while tokio::time::Instant::now() < deadline {
                let alive = Command::new("kill")
                    .arg("-0")
                    .arg(pid.to_string())
                    .output()
                    .map(|output| output.status.success())
                    .unwrap_or(false);

                if !alive {
                    return;
                }

                sleep(STOP_POLL_INTERVAL).await;
            }
        }
    }

    if let Err(error) = child.kill() {
        eprintln!("[kernel] failed to force-kill kernel process: {error}");
    }
}
