import { query } from '../db/postgres.js'

export async function createNewsSearchHistory(input) {
  const result = await query(
    `insert into news_search_history (user_email, query, total_results, theme_id)
     values ($1, $2, $3, null)
     returning id, user_email, query, total_results, theme_id, created_at`,
    [input.userEmail, input.query, input.totalResults],
  )

  return result.rows[0] ?? null
}

export async function listRecentNewsSearchQueries(input) {
  const result = await query(
    `with ranked as (
       select
         query,
         created_at,
         row_number() over (
           partition by lower(query)
           order by created_at desc
         ) as position
       from news_search_history
       where user_email = $1
     )
     select query
     from ranked
     where position = 1
     order by created_at desc
     limit $2`,
    [input.userEmail, input.limit],
  )

  return result.rows.map((row) => row.query)
}

export async function listSearchThemes() {
  const result = await query(
    `select id, name, name_normalized, created_at
     from news_search_themes
     order by name asc`,
  )

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameNormalized: row.name_normalized,
    createdAt: row.created_at,
  }))
}

export async function listUnlinkedSearchHistory(limit = 500) {
  const result = await query(
    `select id, user_email, query, total_results, created_at
     from news_search_history
     where theme_id is null
     order by created_at asc
     limit $1`,
    [limit],
  )

  return result.rows.map((row) => ({
    id: row.id,
    userEmail: row.user_email,
    query: row.query,
    totalResults: row.total_results,
    createdAt: row.created_at,
  }))
}

export async function upsertSearchThemeNames(themeNames) {
  const rowByKey = new Map()

  for (const themeName of themeNames) {
    const name = normalizeThemeName(themeName)
    const nameNormalized = normalizeThemeKey(name)

    if (name && nameNormalized && !rowByKey.has(nameNormalized)) {
      rowByKey.set(nameNormalized, {
        name,
        name_normalized: nameNormalized,
      })
    }
  }

  const rows = Array.from(rowByKey.values())

  if (rows.length === 0) {
    return new Map()
  }

  const result = await query(
    `insert into news_search_themes (name, name_normalized)
     select name, name_normalized
     from jsonb_to_recordset($1::jsonb) as input(name text, name_normalized text)
     on conflict (name_normalized)
     do update set
       name = excluded.name,
       updated_at = now()
     returning id, name, name_normalized`,
    [JSON.stringify(rows)],
  )

  return new Map(
    result.rows.map((row) => [
      row.name_normalized,
      {
        id: row.id,
        name: row.name,
        nameNormalized: row.name_normalized,
      },
    ]),
  )
}

export async function assignHistoryThemes(assignments) {
  const rows = assignments
    .map((assignment) => ({
      history_id: String(assignment.historyId ?? '').trim(),
      theme_id: String(assignment.themeId ?? '').trim(),
    }))
    .filter((row) => row.history_id && row.theme_id)

  if (rows.length === 0) {
    return
  }

  const result = await query(
    `update news_search_history as history
     set theme_id = input.theme_id::uuid
     from jsonb_to_recordset($1::jsonb) as input(history_id uuid, theme_id uuid)
     where history.id = input.history_id
       and history.theme_id is null`,
    [JSON.stringify(rows)],
  )

  return result.rowCount
}

export async function listNewsSearchMetricRows() {
  const result = await query(
    `select
       history.user_email,
       theme.id as theme_id,
       theme.name as theme,
       count(*)::integer as search_count,
       max(history.created_at) as last_searched_at
     from news_search_history history
     join news_search_themes theme on theme.id = history.theme_id
     group by history.user_email, theme.id, theme.name
     order by last_searched_at desc`,
  )

  return result.rows.map((row) => ({
    userEmail: row.user_email,
    themeId: row.theme_id,
    theme: row.theme,
    searchCount: row.search_count,
    lastSearchedAt: row.last_searched_at,
  }))
}

export function normalizeThemeName(value) {
  const theme = String(value ?? '').trim().replace(/\s+/g, ' ')

  if (!theme) {
    return ''
  }

  return theme.charAt(0).toUpperCase() + theme.slice(1)
}

export function normalizeThemeKey(value) {
  return normalizeThemeName(value).toLowerCase()
}
