-- =====================================================
-- VIEW: Property Performance (para Investor Dashboard)
-- Agrega leads, showings, days-on-market por propiedad
-- =====================================================

CREATE OR REPLACE VIEW public.property_performance AS
SELECT
  p.id AS property_id,
  p.organization_id,
  p.address,
  p.unit_number,
  p.city,
  p.status,
  p.rent_price,
  p.listed_date,
  p.photos,
  p.investor_id,
  -- Days on market
  CASE 
    WHEN p.listed_date IS NOT NULL AND p.status != 'rented'
    THEN (CURRENT_DATE - p.listed_date)
    ELSE NULL
  END AS days_on_market,
  -- Lead metrics
  COALESCE(lead_stats.total_leads, 0) AS total_leads,
  COALESCE(lead_stats.active_leads, 0) AS active_leads,
  COALESCE(lead_stats.avg_score, 0) AS avg_lead_score,
  -- Showing metrics
  COALESCE(showing_stats.total_scheduled, 0) AS showings_scheduled,
  COALESCE(showing_stats.total_completed, 0) AS showings_completed,
  COALESCE(showing_stats.total_no_show, 0) AS showings_no_show,
  -- Conversion rates
  CASE 
    WHEN COALESCE(lead_stats.total_leads, 0) > 0 
    THEN ROUND(COALESCE(showing_stats.total_scheduled, 0)::NUMERIC / lead_stats.total_leads * 100, 1)
    ELSE 0
  END AS lead_to_showing_rate,
  CASE 
    WHEN COALESCE(showing_stats.total_scheduled, 0) > 0
    THEN ROUND(COALESCE(showing_stats.total_completed, 0)::NUMERIC / showing_stats.total_scheduled * 100, 1)
    ELSE 0
  END AS showing_completion_rate
FROM properties p
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (WHERE l.status NOT IN ('lost','converted')) AS active_leads,
    ROUND(AVG(l.lead_score), 0) AS avg_score
  FROM leads l
  WHERE l.interested_property_id = p.id
) lead_stats ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_scheduled,
    COUNT(*) FILTER (WHERE s.status = 'completed') AS total_completed,
    COUNT(*) FILTER (WHERE s.status = 'no_show') AS total_no_show
  FROM showings s
  WHERE s.property_id = p.id
) showing_stats ON true;

-- Seguridad: RLS se hereda de la tabla properties
-- Si ya tienes RLS en properties, esta view la respeta automáticamente