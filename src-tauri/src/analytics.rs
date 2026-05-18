use crate::{
    catalog::SkillCatalogItem,
    usage::{SkillUsageEvent, UsageIndex},
};
use chrono::{DateTime, Datelike, FixedOffset, Local, Timelike};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopSkill {
    pub name: String,
    pub calls: usize,
    pub raw_reads: usize,
    pub last_used: Option<String>,
    pub description: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentCall {
    pub skill_name: String,
    pub skill_path: String,
    pub session_id: String,
    pub turn_id: String,
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyPoint {
    pub date: String,
    pub calls: usize,
    pub unique_skills: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HourlyPoint {
    pub weekday: usize,
    pub hour: usize,
    pub calls: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillChainEdge {
    pub from_skill: String,
    pub to_skill: String,
    pub weight: usize,
    pub confidence: String,
    pub session_count: usize,
    pub last_seen: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceIssue {
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub skill_name: String,
    pub path: String,
    pub severity: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillAnalytics {
    pub seven_day_calls: usize,
    pub thirty_day_calls: usize,
    pub ninety_day_calls: usize,
    pub active_skills_30d: usize,
    pub cold_skills: Vec<MaintenanceIssue>,
    pub duplicate_skills: Vec<MaintenanceIssue>,
    pub missing_description_skills: Vec<MaintenanceIssue>,
    pub new_unused_skills: Vec<MaintenanceIssue>,
    pub oversized_skills: Vec<MaintenanceIssue>,
    pub chains: Vec<SkillChainEdge>,
    pub hourly: Vec<HourlyPoint>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub scanned_files: usize,
    pub unique_sessions: usize,
    pub high_confidence_calls: usize,
    pub raw_reads: usize,
    pub unique_skills: usize,
    pub installed_skills: usize,
    pub last_refresh: String,
    pub top_skills: Vec<TopSkill>,
    pub recent_calls: Vec<RecentCall>,
    pub daily: Vec<DailyPoint>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub summary: UsageSummary,
    pub analytics: SkillAnalytics,
    pub catalog: Vec<SkillCatalogItem>,
}

pub fn build_dashboard(catalog: Vec<SkillCatalogItem>, usage: UsageIndex) -> DashboardData {
    let catalog_by_name = catalog
        .iter()
        .map(|item| (item.name.to_ascii_lowercase(), item))
        .collect::<HashMap<_, _>>();
    let mut calls_by_skill: HashMap<String, usize> = HashMap::new();
    let mut raw_by_skill: HashMap<String, usize> = HashMap::new();
    let mut last_used_by_skill: HashMap<String, String> = HashMap::new();
    let mut daily_calls: BTreeMap<String, usize> = BTreeMap::new();
    let mut daily_skill_sets: BTreeMap<String, HashSet<String>> = BTreeMap::new();

    for event in &usage.events {
        *calls_by_skill.entry(event.skill_name.clone()).or_default() += 1;
        *raw_by_skill.entry(event.skill_name.clone()).or_default() += event.raw_read_count;
        if let Some(ts) = &event.timestamp {
            last_used_by_skill
                .entry(event.skill_name.clone())
                .and_modify(|existing| {
                    if ts > existing {
                        *existing = ts.clone();
                    }
                })
                .or_insert_with(|| ts.clone());
            if ts.len() >= 10 {
                let date = ts[..10].to_string();
                *daily_calls.entry(date.clone()).or_default() += 1;
                daily_skill_sets
                    .entry(date)
                    .or_default()
                    .insert(event.skill_name.clone());
            }
        }
    }

    let mut top_skills: Vec<TopSkill> = calls_by_skill
        .iter()
        .map(|(name, calls)| {
            let catalog_item = catalog_by_name.get(&name.to_ascii_lowercase()).copied();
            TopSkill {
                name: name.clone(),
                calls: *calls,
                raw_reads: *raw_by_skill.get(name).unwrap_or(&0),
                last_used: last_used_by_skill.get(name).cloned(),
                description: catalog_item
                    .map(|item| item.description.clone())
                    .unwrap_or_default(),
                path: catalog_item
                    .map(|item| item.path.clone())
                    .unwrap_or_default(),
            }
        })
        .collect();
    top_skills.sort_by(|left, right| {
        right
            .calls
            .cmp(&left.calls)
            .then_with(|| left.name.cmp(&right.name))
    });

    let recent_calls = usage
        .events
        .iter()
        .take(50)
        .map(|event| RecentCall {
            skill_name: event.skill_name.clone(),
            skill_path: event.skill_path.clone(),
            session_id: event.session_id.clone(),
            turn_id: event.turn_id.clone(),
            timestamp: event.timestamp.clone(),
        })
        .collect();

    let daily = daily_calls
        .iter()
        .map(|(date, calls)| DailyPoint {
            date: date.clone(),
            calls: *calls,
            unique_skills: daily_skill_sets.get(date).map(HashSet::len).unwrap_or(0),
        })
        .collect::<Vec<_>>();

    let analytics = build_analytics(&catalog, &usage.events, &last_used_by_skill, &daily);
    let summary = UsageSummary {
        scanned_files: usage.scanned_files,
        unique_sessions: usage.unique_sessions,
        high_confidence_calls: usage.events.len(),
        raw_reads: usage.raw_reads,
        unique_skills: calls_by_skill.len(),
        installed_skills: catalog.len(),
        last_refresh: Local::now().to_rfc3339(),
        top_skills,
        recent_calls,
        daily,
    };

    DashboardData {
        summary,
        analytics,
        catalog,
    }
}

fn build_analytics(
    catalog: &[SkillCatalogItem],
    events: &[SkillUsageEvent],
    last_used_by_skill: &HashMap<String, String>,
    daily: &[DailyPoint],
) -> SkillAnalytics {
    let today = Local::now().date_naive();
    let seven_day_calls = calls_since(daily, 7, today);
    let thirty_day_calls = calls_since(daily, 30, today);
    let ninety_day_calls = calls_since(daily, 90, today);
    let active_skills_30d = active_skills_since(events, 30, today);

    let cold_skills = cold_skills(catalog, last_used_by_skill, 30, today);
    let duplicate_skills = duplicate_skills(catalog);
    let missing_description_skills = missing_description_skills(catalog);
    let new_unused_skills = new_unused_skills(catalog, last_used_by_skill, 14, today);
    let oversized_skills = oversized_skills(catalog);
    let chains = build_chains(events);
    let hourly = build_hourly(events);

    SkillAnalytics {
        seven_day_calls,
        thirty_day_calls,
        ninety_day_calls,
        active_skills_30d,
        cold_skills,
        duplicate_skills,
        missing_description_skills,
        new_unused_skills,
        oversized_skills,
        chains,
        hourly,
    }
}

fn calls_since(daily: &[DailyPoint], days: i64, today: chrono::NaiveDate) -> usize {
    daily
        .iter()
        .filter(|item| {
            chrono::NaiveDate::parse_from_str(&item.date, "%Y-%m-%d")
                .map(|date| today.signed_duration_since(date).num_days() < days)
                .unwrap_or(false)
        })
        .map(|item| item.calls)
        .sum()
}

fn active_skills_since(events: &[SkillUsageEvent], days: i64, today: chrono::NaiveDate) -> usize {
    events
        .iter()
        .filter_map(|event| event_date(event).map(|date| (date, event.skill_name.clone())))
        .filter(|(date, _)| today.signed_duration_since(*date).num_days() < days)
        .map(|(_, name)| name)
        .collect::<HashSet<_>>()
        .len()
}

fn cold_skills(
    catalog: &[SkillCatalogItem],
    last_used_by_skill: &HashMap<String, String>,
    days: i64,
    today: chrono::NaiveDate,
) -> Vec<MaintenanceIssue> {
    catalog
        .iter()
        .filter(|item| {
            last_used_by_skill
                .get(&item.name)
                .and_then(|ts| parse_date(ts))
                .map(|date| today.signed_duration_since(date).num_days() >= days)
                .unwrap_or(true)
        })
        .take(80)
        .map(|item| {
            issue(
                "cold",
                "吃灰 Skill",
                "30 天内没有看到高置信调用，可考虑整理、补说明或归档。",
                item,
                "medium",
            )
        })
        .collect()
}

fn duplicate_skills(catalog: &[SkillCatalogItem]) -> Vec<MaintenanceIssue> {
    catalog
        .iter()
        .filter(|item| item.duplicate_group_id.is_some())
        .take(80)
        .map(|item| {
            issue(
                "duplicate",
                "可能重复",
                "相同 Skill 名出现在多个目录，调用统计可能分散。",
                item,
                "high",
            )
        })
        .collect()
}

fn missing_description_skills(catalog: &[SkillCatalogItem]) -> Vec<MaintenanceIssue> {
    catalog
        .iter()
        .filter(|item| {
            item.localized_note
                .as_deref()
                .filter(|note| !note.trim().is_empty())
                .unwrap_or(&item.description)
                .trim()
                .chars()
                .count()
                < 12
        })
        .take(80)
        .map(|item| {
            issue(
                "missing-description",
                "缺中文可理解说明",
                "description 为空或过短，中文用户很难判断它适合什么任务。",
                item,
                "medium",
            )
        })
        .collect()
}

fn new_unused_skills(
    catalog: &[SkillCatalogItem],
    last_used_by_skill: &HashMap<String, String>,
    days: i64,
    today: chrono::NaiveDate,
) -> Vec<MaintenanceIssue> {
    catalog
        .iter()
        .filter(|item| !last_used_by_skill.contains_key(&item.name))
        .filter(|item| {
            item.modified_at
                .as_deref()
                .and_then(parse_date)
                .map(|date| today.signed_duration_since(date).num_days() < days)
                .unwrap_or(false)
        })
        .take(50)
        .map(|item| {
            issue(
                "new-unused",
                "新装未用",
                "最近修改或安装，但尚未在日志中看到调用。",
                item,
                "low",
            )
        })
        .collect()
}

fn oversized_skills(catalog: &[SkillCatalogItem]) -> Vec<MaintenanceIssue> {
    catalog
        .iter()
        .filter(|item| item.size_bytes > 12_000)
        .take(50)
        .map(|item| {
            issue(
                "oversized",
                "入口文件偏长",
                "SKILL.md 较长，可能影响渐进披露和模型读取效率。",
                item,
                "low",
            )
        })
        .collect()
}

fn issue(
    kind: &str,
    title: &str,
    detail: &str,
    item: &SkillCatalogItem,
    severity: &str,
) -> MaintenanceIssue {
    MaintenanceIssue {
        kind: kind.to_string(),
        title: title.to_string(),
        detail: detail.to_string(),
        skill_name: item.name.clone(),
        path: item.path.clone(),
        severity: severity.to_string(),
    }
}

fn build_chains(events: &[SkillUsageEvent]) -> Vec<SkillChainEdge> {
    let mut by_session_turn: BTreeMap<(String, usize), Vec<&SkillUsageEvent>> = BTreeMap::new();
    for event in events {
        by_session_turn
            .entry((event.session_id.clone(), turn_number(&event.turn_id)))
            .or_default()
            .push(event);
    }

    let mut edge_weight: HashMap<
        (String, String, String),
        (usize, HashSet<String>, Option<String>),
    > = HashMap::new();

    for ((session_id, turn), events_in_turn) in &by_session_turn {
        let skills = unique_sorted_skills(events_in_turn);
        for left_index in 0..skills.len() {
            for right_index in (left_index + 1)..skills.len() {
                bump_edge(
                    &mut edge_weight,
                    &skills[left_index],
                    &skills[right_index],
                    "high",
                    session_id,
                    events_in_turn
                        .first()
                        .and_then(|event| event.timestamp.clone()),
                );
            }
        }

        let next_key = (session_id.clone(), turn + 1);
        if let Some(next_events) = by_session_turn.get(&next_key) {
            let next_skills = unique_sorted_skills(next_events);
            for from in &skills {
                for to in &next_skills {
                    if from != to {
                        bump_edge(
                            &mut edge_weight,
                            from,
                            to,
                            "medium",
                            session_id,
                            next_events
                                .first()
                                .and_then(|event| event.timestamp.clone()),
                        );
                    }
                }
            }
        }
    }

    let mut chains = edge_weight
        .into_iter()
        .map(
            |((from_skill, to_skill, confidence), (weight, sessions, last_seen))| SkillChainEdge {
                from_skill,
                to_skill,
                weight,
                confidence,
                session_count: sessions.len(),
                last_seen,
            },
        )
        .collect::<Vec<_>>();
    chains.sort_by(|left, right| right.weight.cmp(&left.weight));
    chains
}

fn bump_edge(
    edges: &mut HashMap<(String, String, String), (usize, HashSet<String>, Option<String>)>,
    from: &str,
    to: &str,
    confidence: &str,
    session_id: &str,
    timestamp: Option<String>,
) {
    let entry = edges
        .entry((from.to_string(), to.to_string(), confidence.to_string()))
        .or_insert_with(|| (0, HashSet::new(), None));
    entry.0 += 1;
    entry.1.insert(session_id.to_string());
    if let Some(ts) = timestamp {
        if entry
            .2
            .as_ref()
            .map(|existing| ts > *existing)
            .unwrap_or(true)
        {
            entry.2 = Some(ts);
        }
    }
}

fn build_hourly(events: &[SkillUsageEvent]) -> Vec<HourlyPoint> {
    let mut map: HashMap<(usize, usize), usize> = HashMap::new();
    for event in events {
        let Some(ts) = event.timestamp.as_deref() else {
            continue;
        };
        let Ok(parsed) = DateTime::parse_from_rfc3339(ts) else {
            continue;
        };
        let local = parsed.with_timezone(&Local);
        let weekday = local.weekday().num_days_from_monday() as usize;
        let hour = local.hour() as usize;
        *map.entry((weekday, hour)).or_default() += 1;
    }
    let mut points = map
        .into_iter()
        .map(|((weekday, hour), calls)| HourlyPoint {
            weekday,
            hour,
            calls,
        })
        .collect::<Vec<_>>();
    points.sort_by_key(|point| (point.weekday, point.hour));
    points
}

fn unique_sorted_skills(events: &[&SkillUsageEvent]) -> Vec<String> {
    let mut skills = events
        .iter()
        .map(|event| event.skill_name.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    skills.sort();
    skills
}

fn turn_number(value: &str) -> usize {
    value
        .trim_start_matches("turn-")
        .parse::<usize>()
        .unwrap_or(0)
}

fn event_date(event: &SkillUsageEvent) -> Option<chrono::NaiveDate> {
    event.timestamp.as_deref().and_then(parse_date)
}

fn parse_date(value: &str) -> Option<chrono::NaiveDate> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt: DateTime<FixedOffset>| dt.with_timezone(&Local).date_naive())
        .ok()
}
