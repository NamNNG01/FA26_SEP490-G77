-- Machine-enforced capabilities are stored separately from marketing copy.
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS feature_keys JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE subscription_plans
SET feature_keys = CASE LOWER(plan_name)
    WHEN 'free plan' THEN '[]'::jsonb
    WHEN 'basic' THEN '["AI_FLASHCARD_GENERATION","AI_QUIZ_FROM_MATERIAL"]'::jsonb
    WHEN 'standard' THEN '["AI_FLASHCARD_GENERATION","AI_QUIZ_FROM_MATERIAL","AI_ESSAY_GRADING","PERSONALISED_RECOMMENDATIONS","WEAK_SPOTS"]'::jsonb
    WHEN 'premium' THEN '["AI_FLASHCARD_GENERATION","AI_QUIZ_FROM_MATERIAL","AI_ESSAY_GRADING","PERSONALISED_RECOMMENDATIONS","WEAK_SPOTS","SMART_PRACTICE","WEAKNESS_REPORT","EARLY_ACCESS"]'::jsonb
    ELSE feature_keys
END,
features_json = CASE WHEN LOWER(plan_name) IN ('basic','standard','premium') THEN
    (COALESCE(features_json, '[]'::json)::text)::json
    ELSE features_json END,
updated_at = NOW()
WHERE deleted_at IS NULL;

-- Plan membership never grants access to individually sold courses.
UPDATE subscription_plans
SET features_json = COALESCE((
    SELECT json_agg(value)
    FROM json_array_elements_text(COALESCE(features_json, '[]'::json)) AS value
    WHERE value NOT ILIKE 'Full access to all paid courses%'
), '[]'::json), updated_at = NOW()
WHERE LOWER(plan_name) IN ('basic','standard','premium') AND deleted_at IS NULL;
