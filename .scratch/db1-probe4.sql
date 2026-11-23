\pset pager off
-- 标题腿：现在的形状（join projects 判所有权） vs 预先解析项目 id 数组
WITH ids AS (
  SELECT array_agg(p.id) AS a FROM projects p
  WHERE p.owner_id = (SELECT id FROM users WHERE handle='seed1') AND p.deleted_at IS NULL
)
SELECT 'A 现在形状' AS arm;
EXPLAIN (ANALYZE, BUFFERS)
SELECT nd.id, nd.name, pg.name AS page_name, pg.project_id
  FROM design_nodes nd
  JOIN pages pg ON pg.id = nd.page_id
  JOIN projects pr ON pr.id = pg.project_id
 WHERE pr.owner_id = (SELECT id FROM users WHERE handle='seed1')
   AND pr.deleted_at IS NULL
   AND nexus_bigrams(nd.name) @> nexus_bigrams('王城')
   AND nd.name ILIKE '%王城%'
 ORDER BY (CASE WHEN lower(nd.name)='王城' THEN 6
                WHEN lower(nd.name) LIKE '王城%' THEN 5
                WHEN lower(nd.name) LIKE '%王城%' THEN 4 ELSE 0 END) DESC,
          nd.updated_at DESC
 LIMIT 9;

SELECT 'B 预解析 id 数组' AS arm;
EXPLAIN (ANALYZE, BUFFERS)
WITH ids AS (
  SELECT array_agg(p.id) AS a FROM projects p
  WHERE p.owner_id = (SELECT id FROM users WHERE handle='seed1') AND p.deleted_at IS NULL
)
SELECT nd.id, nd.name, pg.name AS page_name, pg.project_id
  FROM design_nodes nd
  JOIN pages pg ON pg.id = nd.page_id
  JOIN ids ON pg.project_id = ANY(ids.a)
 WHERE nexus_bigrams(nd.name) @> nexus_bigrams('王城')
   AND nd.name ILIKE '%王城%'
 ORDER BY (CASE WHEN lower(nd.name)='王城' THEN 6
                WHEN lower(nd.name) LIKE '王城%' THEN 5
                WHEN lower(nd.name) LIKE '%王城%' THEN 4 ELSE 0 END) DESC,
          nd.updated_at DESC
 LIMIT 9;
