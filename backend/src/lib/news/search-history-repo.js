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
