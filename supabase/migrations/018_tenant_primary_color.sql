-- Migration 018: テナントテーマカラー
-- tenants テーブルに primary_color カラムを追加し、既存テナントに個別の色を割り当てる

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#FF6B35';

-- 既存テナントに作成順で視覚的に異なるテーマカラーを割り当てる
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM tenants
)
UPDATE tenants
SET primary_color = CASE ranked.rn
  WHEN 1 THEN '#FF6B35'
  WHEN 2 THEN '#2563EB'
  WHEN 3 THEN '#16A34A'
  WHEN 4 THEN '#9333EA'
  WHEN 5 THEN '#0891B2'
  WHEN 6 THEN '#DC2626'
  WHEN 7 THEN '#DB2777'
  WHEN 8 THEN '#F59E0B'
  ELSE '#FF6B35'
END
FROM ranked
WHERE tenants.id = ranked.id;
