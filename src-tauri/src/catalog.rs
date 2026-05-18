use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogItem {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub localized_name: Option<String>,
    pub localized_note: Option<String>,
    pub source: String,
    pub root: String,
    pub path: String,
    pub skill_md_path: String,
    pub has_scripts: bool,
    pub has_references: bool,
    pub has_assets: bool,
    pub modified_at: Option<String>,
    pub size_bytes: u64,
    pub frontmatter_valid: bool,
    pub duplicate_group_id: Option<String>,
}

#[derive(Debug, Default)]
struct Frontmatter {
    name: Option<String>,
    description: Option<String>,
    valid: bool,
}

pub fn default_skill_roots() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    vec![
        home.join(".codex").join("skills"),
        home.join(".agents").join("skills"),
        home.join(".codex").join("plugins").join("cache"),
    ]
}

pub fn scan_skill_catalog() -> Result<Vec<SkillCatalogItem>, String> {
    let roots = default_skill_roots();
    let mut items = Vec::new();

    for root in roots.iter().filter(|path| path.exists()) {
        let max_depth = if root.ends_with(Path::new("cache")) {
            10
        } else {
            5
        };

        for entry in WalkDir::new(root)
            .max_depth(max_depth)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let path = entry.path();
            if path
                .file_name()
                .and_then(|value| value.to_str())
                .map(|value| value.eq_ignore_ascii_case("SKILL.md"))
                != Some(true)
            {
                continue;
            }

            let Some(skill_dir) = path.parent() else {
                continue;
            };
            items.push(read_skill_item(root, skill_dir, path)?);
        }
    }

    let mut groups: HashMap<String, usize> = HashMap::new();
    for item in &items {
        *groups.entry(item.name.to_ascii_lowercase()).or_default() += 1;
    }
    for item in &mut items {
        let group_key = item.name.to_ascii_lowercase();
        if groups.get(&group_key).copied().unwrap_or(0) > 1 {
            item.duplicate_group_id = Some(format!("duplicate:{group_key}"));
        }
    }

    items.sort_by(|left, right| {
        left.source
            .cmp(&right.source)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(items)
}

fn read_skill_item(
    root: &Path,
    skill_dir: &Path,
    skill_md_path: &Path,
) -> Result<SkillCatalogItem, String> {
    let text = fs::read_to_string(skill_md_path).unwrap_or_default();
    let frontmatter = parse_frontmatter(&text);
    let dir_name = skill_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown-skill")
        .to_string();
    let name = frontmatter.name.clone().unwrap_or_else(|| dir_name.clone());
    let description = frontmatter.description.unwrap_or_default();
    let metadata = fs::metadata(skill_md_path).map_err(|err| err.to_string())?;
    let modified_at = metadata
        .modified()
        .ok()
        .map(|time| DateTime::<Local>::from(time).to_rfc3339());

    Ok(SkillCatalogItem {
        id: stable_id(skill_dir),
        display_name: name.clone(),
        name,
        description,
        localized_name: None,
        localized_note: None,
        source: classify_source(skill_dir),
        root: root.to_string_lossy().to_string(),
        path: skill_dir.to_string_lossy().to_string(),
        skill_md_path: skill_md_path.to_string_lossy().to_string(),
        has_scripts: skill_dir.join("scripts").is_dir(),
        has_references: skill_dir.join("references").is_dir()
            || skill_dir.join("examples").is_dir(),
        has_assets: skill_dir.join("assets").is_dir() || skill_dir.join("templates").is_dir(),
        modified_at,
        size_bytes: metadata.len(),
        frontmatter_valid: frontmatter.valid,
        duplicate_group_id: None,
    })
}

fn parse_frontmatter(text: &str) -> Frontmatter {
    let mut result = Frontmatter::default();
    let normalized = text.replace("\r\n", "\n");
    let mut lines = normalized.lines();
    if lines.next() != Some("---") {
        return result;
    }
    result.valid = true;

    for line in lines {
        if line.trim() == "---" {
            break;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        match key.trim() {
            "name" if !value.is_empty() => result.name = Some(value),
            "description" if !value.is_empty() => result.description = Some(value),
            _ => {}
        }
    }
    result
}

fn classify_source(path: &Path) -> String {
    let lower = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    if lower.contains("\\.codex\\skills\\.system\\") {
        "system".to_string()
    } else if lower.contains("\\.codex\\skills\\") {
        "user".to_string()
    } else if lower.contains("\\.agents\\skills\\") {
        "agent".to_string()
    } else if lower.contains("\\.codex\\plugins\\cache\\") {
        "plugin".to_string()
    } else {
        "unknown".to_string()
    }
}

fn stable_id(path: &Path) -> String {
    path.to_string_lossy()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
