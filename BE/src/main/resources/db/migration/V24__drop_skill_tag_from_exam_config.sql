UPDATE exam_config SET criteria = (
  SELECT jsonb_agg(elem - 'skillTag') FROM jsonb_array_elements(criteria) elem
) WHERE criteria IS NOT NULL AND jsonb_typeof(criteria) = 'array';
