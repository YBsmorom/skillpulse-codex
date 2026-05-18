use crate::analytics::{DailyPoint, UsageSummary};
use crate::catalog::SkillCatalogItem;
use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPulseSettings {
    pub codex_home: String,
    pub data_dir: String,
    pub refresh_interval_minutes: u32,
    pub startup_refresh: bool,
    pub daily_snapshot_enabled: bool,
    pub custom_icon_path: Option<String>,
    pub extra_skill_roots: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DailySnapshot {
    date: String,
    calls: usize,
    unique_skills: usize,
    raw_reads: usize,
    active_sessions: usize,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillAnnotation {
    localized_name: String,
    localized_note: String,
    generator: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillTranslationRequest {
    schema_version: &'static str,
    created_at: String,
    export_mode: String,
    batch_index: usize,
    batch_count: usize,
    total_skills: usize,
    skill_count: usize,
    instructions: &'static str,
    output_schema: Value,
    skills: Vec<SkillTranslationRequestItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillTranslationRequestItem {
    id: String,
    english_name: String,
    original_description: String,
    source: String,
    has_scripts: bool,
    has_references: bool,
    has_assets: bool,
}

#[derive(Debug)]
struct ImportedAnnotation {
    id: String,
    localized_name: String,
    localized_note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResultCandidate {
    pub path: String,
    pub file_name: String,
    pub modified_at: Option<String>,
    pub size_bytes: u64,
    pub annotation_count: usize,
}

pub fn storage_dir() -> Result<PathBuf, String> {
    dirs::data_dir()
        .ok_or_else(|| "cannot resolve AppData directory".to_string())
        .map(|path| path.join("SkillPulse"))
}

pub fn load_settings() -> Result<SkillPulseSettings, String> {
    let dir = storage_dir()?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let path = dir.join("settings.json");
    if path.exists() {
        let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
        if let Ok(settings) = serde_json::from_str::<SkillPulseSettings>(&text) {
            return Ok(settings);
        }
    }

    let codex_home = dirs::home_dir()
        .map(|path| path.join(".codex").to_string_lossy().to_string())
        .unwrap_or_default();
    let settings = SkillPulseSettings {
        codex_home,
        data_dir: dir.to_string_lossy().to_string(),
        refresh_interval_minutes: 30,
        startup_refresh: true,
        daily_snapshot_enabled: true,
        custom_icon_path: None,
        extra_skill_roots: Vec::new(),
    };
    save_settings(&settings)?;
    Ok(settings)
}

pub fn save_settings(settings: &SkillPulseSettings) -> Result<(), String> {
    let dir = storage_dir()?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let text = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(dir.join("settings.json"), text).map_err(|err| err.to_string())
}

pub fn set_custom_icon(source_path: &str) -> Result<SkillPulseSettings, String> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err("图标文件不存在".to_string());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(extension.as_str(), "png" | "svg" | "ico") {
        return Err("只支持 PNG、SVG 或 ICO 图标".to_string());
    }

    let dir = storage_dir()?.join("icons");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let target = dir.join(format!("custom.{extension}"));
    fs::copy(source, &target).map_err(|err| err.to_string())?;

    let mut settings = load_settings()?;
    settings.custom_icon_path = Some(target.to_string_lossy().to_string());
    save_settings(&settings)?;
    Ok(settings)
}

pub fn restore_default_icon() -> Result<SkillPulseSettings, String> {
    let mut settings = load_settings()?;
    settings.custom_icon_path = None;
    save_settings(&settings)?;
    Ok(settings)
}

pub fn apply_localized_notes(catalog: &mut [SkillCatalogItem]) -> Result<(), String> {
    let dir = storage_dir()?;
    let annotation_path = dir.join("skill-annotations.json");
    if annotation_path.exists() {
        let text = fs::read_to_string(annotation_path).map_err(|err| err.to_string())?;
        let annotations: BTreeMap<String, SkillAnnotation> =
            serde_json::from_str(&text).unwrap_or_default();
        for item in catalog.iter_mut() {
            if let Some(annotation) = annotations.get(&item.path) {
                item.localized_name = Some(annotation.localized_name.clone());
                item.localized_note = Some(annotation.localized_note.clone());
            }
        }
    }

    let legacy_path = dir.join("skill-notes.json");
    if !legacy_path.exists() {
        return Ok(());
    }
    let text = fs::read_to_string(legacy_path).map_err(|err| err.to_string())?;
    let notes: BTreeMap<String, String> = serde_json::from_str(&text).unwrap_or_default();
    for item in catalog {
        if item.localized_note.is_none() {
            if let Some(note) = notes.get(&item.path) {
                item.localized_note = Some(note.clone());
            }
        }
    }
    Ok(())
}

pub fn generate_skill_annotations(catalog: &[SkillCatalogItem]) -> Result<usize, String> {
    let path = storage_dir()?.join("skill-annotations.json");
    let mut annotations: BTreeMap<String, SkillAnnotation> = if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    } else {
        BTreeMap::new()
    };

    let now = Local::now().to_rfc3339();
    let mut changed = 0usize;
    for item in catalog {
        if annotations.contains_key(&item.path) {
            continue;
        }
        let localized_name = localize_skill_name(&item.name);
        let localized_note = localize_skill_note(item, &localized_name);
        annotations.insert(
            item.path.clone(),
            SkillAnnotation {
                localized_name,
                localized_note,
                generator: "local-draft".to_string(),
                updated_at: now.clone(),
            },
        );
        changed += 1;
    }

    let text = serde_json::to_string_pretty(&annotations).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())?;
    Ok(changed)
}

pub fn export_translation_request(catalog: &[SkillCatalogItem]) -> Result<Vec<String>, String> {
    export_translation_requests(catalog, None, None, "all")
}

pub fn export_translation_request_batches(
    catalog: &[SkillCatalogItem],
    batch_size: usize,
) -> Result<Vec<String>, String> {
    export_translation_requests(catalog, None, Some(batch_size), "batch")
}

pub fn export_translation_request_selected(
    catalog: &[SkillCatalogItem],
    skill_ids: &[String],
) -> Result<Vec<String>, String> {
    export_translation_requests(catalog, Some(skill_ids), None, "selected")
}

fn export_translation_requests(
    catalog: &[SkillCatalogItem],
    skill_ids: Option<&[String]>,
    batch_size: Option<usize>,
    mode: &str,
) -> Result<Vec<String>, String> {
    let selected_ids = skill_ids.map(|ids| ids.iter().cloned().collect::<HashSet<_>>());
    let selected = catalog
        .iter()
        .filter(|item| {
            selected_ids
                .as_ref()
                .map(|ids| ids.contains(&item.id))
                .unwrap_or(true)
        })
        .collect::<Vec<_>>();
    if selected.is_empty() {
        return Err("没有可导出的 Skill".to_string());
    }

    let dir = storage_dir()?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let export_dir = dir.join("annotation-requests");
    fs::create_dir_all(&export_dir).map_err(|err| err.to_string())?;
    let size = batch_size.unwrap_or(selected.len()).clamp(1, 200);
    let batch_count = selected.len().div_ceil(size);
    let timestamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut paths = Vec::new();

    for (index, chunk) in selected.chunks(size).enumerate() {
        let path = if mode == "all" && batch_count == 1 {
            dir.join("skill-annotation-request.json")
        } else if batch_count == 1 {
            export_dir.join(format!("skill-annotation-request-{mode}-{timestamp}.json"))
        } else {
            export_dir.join(format!(
                "skill-annotation-request-{mode}-{timestamp}-{:03}-of-{:03}.json",
                index + 1,
                batch_count
            ))
        };
        write_translation_request(&path, chunk, mode, index + 1, batch_count, selected.len())?;
        paths.push(path.to_string_lossy().to_string());
    }
    Ok(paths)
}

fn write_translation_request(
    path: &Path,
    catalog: &[&SkillCatalogItem],
    mode: &str,
    batch_index: usize,
    batch_count: usize,
    total_skills: usize,
) -> Result<(), String> {
    let request = SkillTranslationRequest {
        schema_version: "skillpulse.annotation-request.v1",
        created_at: Local::now().to_rfc3339(),
        export_mode: mode.to_string(),
        batch_index,
        batch_count,
        total_skills,
        skill_count: catalog.len(),
        instructions: "请把 skills 中每个 Skill 的英文名和原始说明翻译/概括为中文。不要改 id。返回严格 JSON，不要 Markdown，不要额外解释。localizedName 应简短，localizedNote 应说明它适合什么任务，控制在 1-2 句中文。",
        output_schema: json!({
            "schemaVersion": "skillpulse.annotation-result.v1",
            "annotations": [
                {
                    "id": "保持原样",
                    "englishName": "原英文名，可保留用于核对",
                    "localizedName": "中文名称",
                    "localizedNote": "中文备注"
                }
            ]
        }),
        skills: catalog
            .iter()
            .map(|item| SkillTranslationRequestItem {
                id: item.id.clone(),
                english_name: item.name.clone(),
                original_description: item.description.clone(),
                source: item.source.clone(),
                has_scripts: item.has_scripts,
                has_references: item.has_references,
                has_assets: item.has_assets,
            })
            .collect(),
    };
    let text = serde_json::to_string_pretty(&request).map_err(|err| err.to_string())?;
    fs::write(&path, text).map_err(|err| err.to_string())?;
    Ok(())
}

pub fn import_translation_result(
    catalog: &[SkillCatalogItem],
    result_path: &str,
) -> Result<usize, String> {
    let source = Path::new(result_path);
    if !source.is_file() {
        return Err("翻译结果 JSON 文件不存在".to_string());
    }
    let text = fs::read_to_string(source).map_err(|err| err.to_string())?;
    let value: Value =
        serde_json::from_str(&text).map_err(|err| format!("JSON 解析失败：{err}"))?;
    let imported = extract_imported_annotations(&value)?;
    let path_by_id = catalog
        .iter()
        .map(|item| (item.id.clone(), item.path.clone()))
        .collect::<HashMap<_, _>>();
    let annotation_path = storage_dir()?.join("skill-annotations.json");
    let mut annotations: BTreeMap<String, SkillAnnotation> = if annotation_path.exists() {
        fs::read_to_string(&annotation_path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    } else {
        BTreeMap::new()
    };

    let now = Local::now().to_rfc3339();
    let mut changed = 0usize;
    for item in imported {
        let Some(skill_path) = path_by_id.get(&item.id) else {
            continue;
        };
        if item.localized_name.trim().is_empty() || item.localized_note.trim().is_empty() {
            continue;
        }
        annotations.insert(
            skill_path.clone(),
            SkillAnnotation {
                localized_name: item.localized_name.trim().to_string(),
                localized_note: item.localized_note.trim().to_string(),
                generator: "llm-import".to_string(),
                updated_at: now.clone(),
            },
        );
        changed += 1;
    }

    let text = serde_json::to_string_pretty(&annotations).map_err(|err| err.to_string())?;
    fs::write(annotation_path, text).map_err(|err| err.to_string())?;
    Ok(changed)
}

pub fn import_latest_translation_result(catalog: &[SkillCatalogItem]) -> Result<usize, String> {
    let Some(candidate) = list_translation_result_candidates()?.into_iter().next() else {
        return Err("没有检测到翻译结果 JSON。请把 LLM 返回结果保存到 SkillPulse 数据目录，或手动填写路径。".to_string());
    };
    import_translation_result(catalog, &candidate.path)
}

pub fn list_translation_result_candidates() -> Result<Vec<TranslationResultCandidate>, String> {
    let dir = storage_dir()?;
    let mut roots = vec![dir.clone()];
    let request_dir = dir.join("annotation-requests");
    if request_dir.exists() {
        roots.push(request_dir);
    }

    let mut candidates = Vec::new();
    for root in roots {
        if !root.exists() {
            continue;
        }
        for entry in fs::read_dir(root).map_err(|err| err.to_string())? {
            let entry = entry.map_err(|err| err.to_string())?;
            let path = entry.path();
            if !path.is_file()
                || path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| !value.eq_ignore_ascii_case("json"))
                    .unwrap_or(true)
            {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_string();
            if matches!(
                name.as_str(),
                "settings.json"
                    | "daily-snapshots.json"
                    | "skill-annotations.json"
                    | "skill-annotation-request.json"
            ) {
                continue;
            }
            let Ok(text) = fs::read_to_string(&path) else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            let Some(annotation_count) = annotation_count(&value) else {
                continue;
            };
            let metadata = fs::metadata(&path).map_err(|err| err.to_string())?;
            candidates.push(TranslationResultCandidate {
                path: path.to_string_lossy().to_string(),
                file_name: name,
                modified_at: metadata
                    .modified()
                    .ok()
                    .map(|time| chrono::DateTime::<Local>::from(time).to_rfc3339()),
                size_bytes: metadata.len(),
                annotation_count,
            });
        }
    }

    candidates.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    Ok(candidates)
}

pub fn save_skill_note(skill_path: &str, note: &str) -> Result<(), String> {
    let path = storage_dir()?.join("skill-annotations.json");
    let mut annotations: BTreeMap<String, SkillAnnotation> = if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    } else {
        BTreeMap::new()
    };
    let now = Local::now().to_rfc3339();
    annotations
        .entry(skill_path.to_string())
        .and_modify(|entry| {
            entry.localized_note = note.to_string();
            entry.generator = "manual".to_string();
            entry.updated_at = now.clone();
        })
        .or_insert_with(|| SkillAnnotation {
            localized_name: String::new(),
            localized_note: note.to_string(),
            generator: "manual".to_string(),
            updated_at: now,
        });
    let text = serde_json::to_string_pretty(&annotations).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
}

fn extract_imported_annotations(value: &Value) -> Result<Vec<ImportedAnnotation>, String> {
    let array = if let Some(items) = value.get("annotations").and_then(Value::as_array) {
        items
    } else if let Some(items) = value.get("skills").and_then(Value::as_array) {
        items
    } else if let Some(items) = value.as_array() {
        items
    } else {
        return Err("翻译结果必须包含 annotations 数组，或直接是数组".to_string());
    };

    let mut result = Vec::new();
    for item in array {
        let id = pick_string(item, &["id"]).unwrap_or_default();
        let localized_name = pick_string(
            item,
            &[
                "localizedName",
                "localized_name",
                "chineseName",
                "chinese_name",
                "zhName",
                "zh_name",
            ],
        )
        .unwrap_or_default();
        let localized_note = pick_string(
            item,
            &[
                "localizedNote",
                "localized_note",
                "chineseNote",
                "chinese_note",
                "descriptionZh",
                "description_zh",
                "note",
            ],
        )
        .unwrap_or_default();
        if !id.is_empty() {
            result.push(ImportedAnnotation {
                id,
                localized_name,
                localized_note,
            });
        }
    }
    Ok(result)
}

fn annotation_count(value: &Value) -> Option<usize> {
    if value
        .get("schemaVersion")
        .and_then(Value::as_str)
        .map(|schema| schema == "skillpulse.annotation-result.v1")
        .unwrap_or(false)
    {
        return value
            .get("annotations")
            .and_then(Value::as_array)
            .map(Vec::len);
    }
    if let Some(items) = value.get("annotations").and_then(Value::as_array) {
        return Some(items.len());
    }
    if let Some(items) = value.as_array() {
        return Some(items.len());
    }
    None
}

fn pick_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}

fn localize_skill_name(name: &str) -> String {
    let tokens = name
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let translated = tokens
        .iter()
        .map(|token| translate_token(token))
        .collect::<Vec<_>>();
    let joined = translated
        .iter()
        .filter(|part| !part.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join("");
    if joined.is_empty() {
        name.to_string()
    } else {
        joined
    }
}

fn localize_skill_note(item: &SkillCatalogItem, localized_name: &str) -> String {
    let source_hint = match item.source.as_str() {
        "user" => "用户自定义 Skill",
        "agent" => "Agent 兼容 Skill",
        "system" => "Codex 系统 Skill",
        "plugin" => "插件内置 Skill",
        _ => "本地 Skill",
    };
    let description = item.description.trim();
    if description.is_empty() {
        format!("{source_hint}，用于处理与“{localized_name}”相关的任务。建议后续用 LLM 补充更准确的中文说明。")
    } else {
        format!("{source_hint}，用于处理与“{localized_name}”相关的任务。原始说明：{description}")
    }
}

fn translate_token(token: &str) -> &'static str {
    match token.to_ascii_lowercase().as_str() {
        "academic" => "学术",
        "adverse" => "不良事件",
        "agent" | "agents" => "Agent",
        "analysis" | "analyze" => "分析",
        "api" => "API",
        "article" => "文章",
        "audio" => "音频",
        "bayesian" => "贝叶斯",
        "bilibili" => "B站",
        "bio" | "biomedical" => "生物医学",
        "browser" => "浏览器",
        "cell" => "细胞",
        "chemical" | "chem" => "化学",
        "clinical" => "临床",
        "code" => "代码",
        "creator" => "创建器",
        "critical" => "批判性",
        "data" => "数据",
        "database" => "数据库",
        "debugging" => "调试",
        "decision" => "决策",
        "deep" => "深度",
        "deweight" => "降重",
        "discovery" => "发现",
        "document" | "documents" => "文档",
        "drug" => "药物",
        "evaluation" => "评价",
        "experiment" | "experimental" => "实验",
        "export" => "导出",
        "feedback" => "反馈",
        "gene" => "基因",
        "generate" | "generator" => "生成",
        "github" => "GitHub",
        "grants" => "基金",
        "hypothesis" => "假设",
        "image" => "图像",
        "interaction" | "interactions" => "互作",
        "lab" => "实验室",
        "latex" => "LaTeX",
        "literature" => "文献",
        "lookup" => "查找",
        "management" => "管理",
        "medical" => "医学",
        "modeling" => "建模",
        "network" => "网络",
        "office" => "Office",
        "paper" => "论文",
        "pdf" => "PDF",
        "peer" => "同行",
        "plugin" => "插件",
        "poster" | "posters" => "海报",
        "presentation" | "presentations" => "演示文稿",
        "protein" => "蛋白",
        "protocol" | "protocols" => "方案",
        "python" => "Python",
        "review" => "综述",
        "research" => "研究",
        "retrieval" => "检索",
        "scientific" => "科学",
        "search" => "搜索",
        "selection" => "选择",
        "skill" | "skills" => "Skill",
        "slide" | "slides" => "幻灯片",
        "statistical" | "statistics" => "统计",
        "subagent" => "子 Agent",
        "topic" => "主题",
        "trial" | "trials" => "试验",
        "video" => "视频",
        "visualization" => "可视化",
        "whisper" => "Whisper",
        "writing" => "写作",
        _ => "",
    }
}

pub fn persist_and_merge_daily(summary: &mut UsageSummary) -> Result<(), String> {
    let settings = load_settings()?;
    if !settings.daily_snapshot_enabled {
        return Ok(());
    }

    let dir = storage_dir()?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let path = dir.join("daily-snapshots.json");
    let today = Local::now().format("%Y-%m-%d").to_string();
    let today_point = summary
        .daily
        .iter()
        .find(|item| item.date == today)
        .cloned()
        .unwrap_or(DailyPoint {
            date: today.clone(),
            calls: 0,
            unique_skills: 0,
        });
    let mut snapshots: Vec<DailySnapshot> = if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    snapshots.retain(|item| item.date != today);
    snapshots.push(DailySnapshot {
        date: today,
        calls: today_point.calls,
        unique_skills: today_point.unique_skills,
        raw_reads: summary.raw_reads,
        active_sessions: summary.unique_sessions,
        created_at: Local::now().to_rfc3339(),
    });
    snapshots.sort_by(|left, right| left.date.cmp(&right.date));
    fs::write(
        &path,
        serde_json::to_string_pretty(&snapshots).map_err(|err| err.to_string())?,
    )
    .map_err(|err| err.to_string())?;

    let mut daily: BTreeMap<String, DailyPoint> = summary
        .daily
        .iter()
        .cloned()
        .map(|item| (item.date.clone(), item))
        .collect();
    for snapshot in snapshots {
        daily.entry(snapshot.date.clone()).or_insert(DailyPoint {
            date: snapshot.date,
            calls: snapshot.calls,
            unique_skills: snapshot.unique_skills,
        });
    }
    summary.daily = daily.into_values().collect();
    Ok(())
}
