use crate::{analytics::DashboardData, storage};
use chrono::Local;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

pub fn open_path(path: &str) -> Result<(), String> {
    let requested = PathBuf::from(path);
    if !requested.exists() {
        return Err("路径不存在".to_string());
    }
    let canonical = requested.canonicalize().map_err(|err| err.to_string())?;
    if !is_allowed_path(&canonical)? {
        return Err("该路径不在 SkillPulse 允许打开的本地目录内".to_string());
    }

    let mut command = Command::new("explorer.exe");
    if canonical.is_file() {
        command.arg("/select,").arg(&canonical);
    } else {
        command.arg(&canonical);
    }
    command.spawn().map_err(|err| err.to_string())?;
    Ok(())
}

pub fn open_default_skill_root() -> Result<(), String> {
    let path = dirs::home_dir()
        .ok_or_else(|| "cannot resolve home directory".to_string())?
        .join(".codex")
        .join("skills");
    open_path(&path.to_string_lossy())
}

pub fn export_json(data: &DashboardData) -> Result<String, String> {
    let dir = export_dir()?;
    let path = dir.join(format!(
        "skillpulse-export-{}.json",
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    let text = serde_json::to_string_pretty(data).map_err(|err| err.to_string())?;
    fs::write(&path, text).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

pub fn export_csv(data: &DashboardData) -> Result<String, String> {
    let dir = export_dir()?;
    let path = dir.join(format!(
        "skillpulse-skills-{}.csv",
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    let mut text = String::from("name,source,calls,raw_reads,last_used,path,description\n");
    for item in &data.catalog {
        let stat = data
            .summary
            .top_skills
            .iter()
            .find(|skill| skill.name == item.name);
        text.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            csv(&item.name),
            csv(&item.source),
            stat.map(|skill| skill.calls).unwrap_or(0),
            stat.map(|skill| skill.raw_reads).unwrap_or(0),
            csv(&stat
                .and_then(|skill| skill.last_used.clone())
                .unwrap_or_default()),
            csv(&item.path),
            csv(&item.description)
        ));
    }
    fs::write(&path, text).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn export_dir() -> Result<PathBuf, String> {
    let dir = storage::storage_dir()?.join("exports");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn is_allowed_path(path: &Path) -> Result<bool, String> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".codex"));
        roots.push(home.join(".agents"));
    }
    roots.push(storage::storage_dir()?);

    for root in roots {
        if root.exists() {
            let canonical_root = root.canonicalize().map_err(|err| err.to_string())?;
            if path.starts_with(canonical_root) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn csv(value: &str) -> String {
    let escaped = value.replace('"', "\"\"");
    format!("\"{escaped}\"")
}
