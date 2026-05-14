import { query } from '../db/postgres.js'

export async function createNewsSearchHistory(input) {
  const result = await query(
    `insert into news_search_history (user_email, query, total_results)
     values ($1, $2, $3)
     returning id, user_email, query, total_results, created_at`,
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

export async function listNewsSearchMetricRows() {
  const result = await query(
    `select
       user_email,
       query,
       count(*)::integer as search_count,
       max(created_at) as last_searched_at
     from news_search_history
     group by user_email, query
     order by last_searched_at desc
     limit 500`,
  )

  return result.rows.map((row) => ({
    userEmail: row.user_email,
    query: row.query,
    searchCount: row.search_count,
    lastSearchedAt: row.last_searched_at,
  }))
}

export async function listCachedSearchThemes(queries) {
  if (!Array.isArray(queries) || queries.length === 0) {
    return new Map()
  }

  const normalizedQueries = queries.map((item) => item.trim().toLowerCase()).filter(Boolean)

  if (normalizedQueries.length === 0) {
    return new Map()
  }

  let result

  try {
    result = await query(
      `select query_normalized, theme
       from news_search_theme_cache
       where query_normalized = any($1::text[])`,
      [normalizedQueries],
    )
  } catch (error) {
    if (error?.code === '42P01') {
      return new Map()
    }

    throw error
  }

  return new Map(result.rows.map((row) => [row.query_normalized, row.theme]))
}

export async function upsertSearchThemes(themeByQuery) {
  if (!(themeByQuery instanceof Map) || themeByQuery.size === 0) {
    return
  }

  const rows = Array.from(themeByQuery.entries())
    .map(([queryNormalized, theme]) => ({
      queryNormalized: String(queryNormalized ?? '').trim().toLowerCase(),
      theme: String(theme ?? '').trim(),
    }))
    .filter((row) => row.queryNormalized && row.theme)

  if (rows.length === 0) {
    return
  }

  try {
    await query(
      `insert into news_search_theme_cache (query_normalized, theme)
       select query_normalized, theme
       from jsonb_to_recordset($1::jsonb) as input(query_normalized text, theme text)
       on conflict (query_normalized)
       do update set
         theme = excluded.theme,
         updated_at = now()`,
      [JSON.stringify(rows.map((row) => ({ query_normalized: row.queryNormalized, theme: row.theme })))],
    )
  } catch (error) {
    if (error?.code === '42P01') {
      return
    }

    throw error
  }
}
