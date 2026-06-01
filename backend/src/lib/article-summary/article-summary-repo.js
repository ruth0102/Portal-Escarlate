import { query } from '../db/postgres.js'

function toArticleSummary(row) {
  return {
    id: row.id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    title: row.title,
    author: row.author ?? '',
    source: row.source ?? '',
    publishedAt: row.published_at ?? '',
    urlToImage: row.url_to_image ?? '',
    summary: row.summary,
    provider: row.ai_provider ?? '',
    model: row.ai_model ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function findArticleSummaryByNormalizedUrl(normalizedUrl) {
  const result = await query(
    `select
       id,
       url,
       normalized_url,
       title,
       author,
       source,
       published_at,
       url_to_image,
       summary,
       ai_provider,
       ai_model,
       created_at,
       updated_at
     from news_article_summaries
     where normalized_url = $1
     limit 1`,
    [normalizedUrl],
  )

  return result.rows[0] ? toArticleSummary(result.rows[0]) : null
}

export async function findArticleSummaryById(id) {
  const result = await query(
    `select
       id,
       url,
       normalized_url,
       title,
       author,
       source,
       published_at,
       url_to_image,
       summary,
       ai_provider,
       ai_model,
       created_at,
       updated_at
     from news_article_summaries
     where id = $1
     limit 1`,
    [id],
  )

  return result.rows[0] ? toArticleSummary(result.rows[0]) : null
}

export async function upsertArticleSummary(input) {
  const result = await query(
    `insert into news_article_summaries (
       url,
       normalized_url,
       title,
       author,
       source,
       published_at,
       url_to_image,
       summary,
       ai_provider,
       ai_model,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (normalized_url)
     do update set
       url = excluded.url,
       title = excluded.title,
       author = excluded.author,
       source = excluded.source,
       published_at = excluded.published_at,
       url_to_image = excluded.url_to_image,
       summary = excluded.summary,
       ai_provider = excluded.ai_provider,
       ai_model = excluded.ai_model,
       updated_at = now()
     returning
       id,
       url,
       normalized_url,
       title,
       author,
       source,
       published_at,
       url_to_image,
       summary,
       ai_provider,
       ai_model,
       created_at,
       updated_at`,
    [
      input.url,
      input.normalizedUrl,
      input.title,
      input.author || null,
      input.source || null,
      input.publishedAt || null,
      input.urlToImage || null,
      input.summary,
      input.provider || null,
      input.model || null,
    ],
  )

  return toArticleSummary(result.rows[0])
}
