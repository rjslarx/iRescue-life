-- Run via queryAppAnalytics, using a post-release window. Counts are metric
-- observations, not people. Pivot each event before grouping (one row/property).
SELECT route, device, metric, count() AS samples,
       quantileExact(0.75)(value) AS p75,
       if(count() < 100, 'insufficient_sample', 'descriptive_only') AS confidence
FROM (
  SELECT event_id,
         maxIf(string_value, data_key = 'route') AS route,
         maxIf(string_value, data_key = 'device') AS device,
         maxIf(string_value, data_key = 'metric') AS metric,
         maxIf(string_value, data_key = 'schema') AS schema_version,
         maxIf(number_value, data_key = 'value') AS value
  FROM event_data
  WHERE event_name = 'marketing_web_vital'
    AND created_at >= now() - INTERVAL 28 DAY
    AND created_at < now()
  GROUP BY event_id
)
WHERE schema_version = 'v1'
  AND metric IN ('LCP', 'CLS', 'INP')
  AND device IN ('mobile', 'tablet', 'desktop')
  AND value IS NOT NULL
GROUP BY route, device, metric
ORDER BY route, device, metric
LIMIT 100
