-- ============================================================
-- 005_qr_invitation.sql
-- QRコード招待フロー対応
-- Supabase Dashboard の SQL Editor で実行する
-- ============================================================

-- token と expires_at カラムを追加
ALTER TABLE user_invitations
  ADD COLUMN IF NOT EXISTS token uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- email と name を nullable に（QRフローでは登録時にスタッフが入力）
ALTER TABLE user_invitations
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN name DROP NOT NULL;

-- status に 'used' を追加（QRコード使用済み）
ALTER TABLE user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_status_check,
  ADD CONSTRAINT user_invitations_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'used'));

-- token 検索用インデックス
CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token);
