-- =====================================================
-- FUNCTION: Lead Source Performance
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_source_performance(
  _days INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
  _result JSON;
BEGIN
  SELECT organization_id INTO _org_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;

  SELECT json_agg(row_data ORDER BY total DESC)
  INTO _result
  FROM (
    SELECT
      source,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'converted') AS converted,
      COUNT(*) FILTER (WHERE status IN ('showing_scheduled','showed','in_application','converted')) AS reached_showing,
      ROUND(AVG(lead_score), 0) AS avg_score,
      CASE WHEN COUNT(*) > 0 
        THEN ROUND(COUNT(*) FILTER (WHERE status = 'converted')::NUMERIC / COUNT(*) * 100, 1) 
        ELSE 0 
      END AS conversion_rate
    FROM leads
    WHERE organization_id = _org_id
      AND created_at >= NOW() - (_days || ' days')::INTERVAL
    GROUP BY source
  ) row_data;

  RETURN COALESCE(_result, '[]'::JSON);
END;
$$;

-- =====================================================
-- FUNCTION: Zip Code Heat Data  
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_zip_code_analytics(
  _days INTEGER DEFAULT 90
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
  _result JSON;
BEGIN
  SELECT organization_id INTO _org_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;

  SELECT json_agg(row_data ORDER BY lead_count DESC)
  INTO _result
  FROM (
    SELECT
      p.zip_code,
      COUNT(DISTINCT l.id) AS lead_count,
      COUNT(DISTINCT p.id) AS property_count,
      ROUND(AVG(l.lead_score), 0) AS avg_score,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') AS conversions,
      COUNT(DISTINCT s.id) AS showing_count
    FROM properties p
    LEFT JOIN leads l ON l.interested_property_id = p.id AND l.created_at >= NOW() - (_days || ' days')::INTERVAL
    LEFT JOIN showings s ON s.property_id = p.id AND s.scheduled_at >= NOW() - (_days || ' days')::INTERVAL
    WHERE p.organization_id = _org_id
    GROUP BY p.zip_code
    HAVING COUNT(DISTINCT l.id) > 0
  ) row_data;

  RETURN COALESCE(_result, '[]'::JSON);
END;
$$;