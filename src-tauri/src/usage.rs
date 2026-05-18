use chrono::{DateTime, Local};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader},
    path::Path,
};
use walkdir::WalkDir;

static SKILL_PATH_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)([A-Za-z]:[\\/][^'"\r\n;|<>]*?SKILL\.md)"#).unwrap());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUsageEvent {
    pub event_id: String,
    pub session_id: String,
    pub turn_id: String,
    pub timestamp: Option<String>,
    pub skill_name: String,
    pub skill_path: String,
    pub source_file: String,
    pub confidence: String,
    pub raw_read_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageIndex {
    pub scanned_files: usize,
    pub unique_sessions: usize,
    pub raw_reads: usize,
    pub events: Vec<SkillUsageEvent>,
}

pub fn scan_codex_usage() -> Result<UsageIndex, String> {
    let codex_home = dirs::home_dir()
        .ok_or_else(|| "cannot resolve home directory".to_string())?
        .join(".codex");
    let roots = [
        codex_home.join("sessions"),
        codex_home.join("archived_sessions"),
    ];

    let mut scanned_files = 0usize;
    let mut raw_reads = 0usize;
    let mut unique_sessions = HashSet::new();
    let mut event_map: HashMap<String, SkillUsageEvent> = HashMap::new();

    for root in roots {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let path = entry.path();
            let is_jsonl = path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.eq_ignore_ascii_case("jsonl"))
                .unwrap_or(false);
            if !is_jsonl {
                continue;
            }

            scanned_files += 1;
            let fallback_timestamp = file_timestamp(path);
            scan_session_file(
                path,
                fallback_timestamp,
                &mut unique_sessions,
                &mut raw_reads,
                &mut event_map,
            )?;
        }
    }

    let mut events: Vec<SkillUsageEvent> = event_map.into_values().collect();
    events.sort_by(|left, right| {
        right
            .timestamp
            .cmp(&left.timestamp)
            .then_with(|| left.skill_name.cmp(&right.skill_name))
    });

    Ok(UsageIndex {
        scanned_files,
        unique_sessions: unique_sessions.len(),
        raw_reads,
        events,
    })
}

fn scan_session_file(
    path: &Path,
    fallback_timestamp: Option<String>,
    unique_sessions: &mut HashSet<String>,
    raw_reads: &mut usize,
    event_map: &mut HashMap<String, SkillUsageEvent>,
) -> Result<(), String> {
    let file = fs::File::open(path).map_err(|err| format!("{}: {err}", path.display()))?;
    let reader = BufReader::new(file);
    let mut session_id = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown-session")
        .to_string();
    let mut turn_index = 0usize;
    let mut turn_id = "turn-0".to_string();
    let mut last_timestamp = fallback_timestamp;
    let source_file = path.to_string_lossy().to_string();

    for line in reader.lines() {
        let line = line.map_err(|err| err.to_string())?;
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };

        if let Some(ts) = value.get("timestamp").and_then(Value::as_str) {
            last_timestamp = Some(ts.to_string());
        }

        if value.get("type").and_then(Value::as_str) == Some("session_meta") {
            if let Some(id) = value
                .get("payload")
                .and_then(|payload| payload.get("id"))
                .and_then(Value::as_str)
            {
                session_id = id.to_string();
                unique_sessions.insert(session_id.clone());
            }
        }

        if value.get("type").and_then(Value::as_str) == Some("turn_context") {
            turn_index += 1;
            turn_id = format!("turn-{turn_index}");
        }

        let mut strings = Vec::new();
        collect_strings(&value, &mut strings);
        for text in strings {
            for capture in SKILL_PATH_RE.captures_iter(&text) {
                let Some(raw_match) = capture.get(1) else {
                    continue;
                };
                let skill_md_path = clean_path(raw_match.as_str());
                let skill_name = skill_name_from_path(&skill_md_path);
                if skill_name.is_empty() {
                    continue;
                }

                *raw_reads += 1;
                let key = format!("{session_id}|{turn_id}|{skill_name}");
                if let Some(event) = event_map.get_mut(&key) {
                    event.raw_read_count += 1;
                } else {
                    let event_id = stable_event_id(&key);
                    event_map.insert(
                        key,
                        SkillUsageEvent {
                            event_id,
                            session_id: session_id.clone(),
                            turn_id: turn_id.clone(),
                            timestamp: last_timestamp.clone(),
                            skill_name,
                            skill_path: skill_dir_from_skill_md(&skill_md_path),
                            source_file: source_file.clone(),
                            confidence: "high".to_string(),
                            raw_read_count: 1,
                        },
                    );
                }
            }
        }
    }

    unique_sessions.insert(session_id);
    Ok(())
}

fn collect_strings(value: &Value, found: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            found.push(text.clone());
            let trimmed = text.trim();
            if (trimmed.starts_with('{') || trimmed.starts_with('['))
                && serde_json::from_str::<Value>(trimmed)
                    .map(|nested| collect_strings(&nested, found))
                    .is_ok()
            {}
        }
        Value::Array(items) => {
            for item in items {
                collect_strings(item, found);
            }
        }
        Value::Object(map) => {
            for item in map.values() {
                collect_strings(item, found);
            }
        }
        _ => {}
    }
}

fn clean_path(value: &str) -> String {
    value
        .replace("\\\\", "\\")
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

fn skill_name_from_path(raw_path: &str) -> String {
    Path::new(raw_path)
        .parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_string()
}

fn skill_dir_from_skill_md(raw_path: &str) -> String {
    Path::new(raw_path)
        .parent()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn file_timestamp(path: &Path) -> Option<String> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .map(|modified| DateTime::<Local>::from(modified).to_rfc3339())
}

fn stable_event_id(key: &str) -> String {
    key.chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
