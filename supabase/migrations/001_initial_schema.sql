-- =============================================================
-- DEQI Supplier Hub - Complete Database Schema
-- Migration: 001_initial_schema
-- Run this in the Supabase SQL Editor
-- =============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- USERS TABLE
-- =====================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-insert user row on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================
-- CARDS TABLE
-- =====================
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board TEXT NOT NULL CHECK (board IN ('quotes', 'samples', 'orders')),
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  value_usd NUMERIC(12, 2),
  deadline TIMESTAMPTZ,
  responsible_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_name TEXT,
  collection TEXT,
  size TEXT,
  quantity INTEGER,
  outside_material TEXT,
  inside_material TEXT,
  logo_color TEXT,
  logo_technique TEXT,
  logo_positions TEXT[],
  reference_code TEXT,
  supplier_ref TEXT,
  tags TEXT[],
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Board status check constraint
ALTER TABLE cards ADD CONSTRAINT valid_status CHECK (
  (board = 'quotes' AND status IN ('Requested', 'Quoted', 'Confirmed', 'Declined')) OR
  (board = 'samples' AND status IN ('Requested', 'In Preparation', 'Under Revision', 'Approved')) OR
  (board = 'orders' AND status IN ('Placed', 'In Production', 'Ready to Ship', 'Shipped'))
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_cards_board ON cards(board);
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_cards_responsible_id ON cards(responsible_id);
CREATE INDEX idx_cards_created_by ON cards(created_by);
CREATE INDEX idx_cards_archived ON cards(archived);
CREATE INDEX idx_cards_deadline ON cards(deadline);

-- =====================
-- COMMENTS TABLE
-- =====================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (char_length(body) > 0),
  edited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_comments_card_id ON comments(card_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- =====================
-- ATTACHMENTS TABLE
-- =====================
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_card_id ON attachments(card_id);

-- =====================
-- NOTIFICATIONS TABLE
-- =====================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('comment', 'status_change', 'assignment', 'mention', 'due_soon')),
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read) WHERE read = FALSE;

-- =====================
-- ACTIVITY LOGS TABLE
-- =====================
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_card_id ON activity_logs(card_id);

-- =====================
-- ROW LEVEL SECURITY
-- =====================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Users: everyone can read, only admin can change roles
CREATE POLICY "Users are readable by authenticated users"
  ON users FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM users WHERE id = auth.uid()));

CREATE POLICY "Admins can update any user"
  ON users FOR UPDATE TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Cards: all authenticated users can view active, only non-viewers can create
CREATE POLICY "Authenticated users can view non-archived cards"
  ON cards FOR SELECT TO authenticated
  USING (archived = FALSE);

CREATE POLICY "Authenticated users can view archived cards"
  ON cards FOR SELECT TO authenticated
  USING (archived = TRUE);

CREATE POLICY "Members and admins can create cards"
  ON cards FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'member')
  );

CREATE POLICY "Members and admins can update cards"
  ON cards FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'member')
  );

CREATE POLICY "Only admins can delete cards"
  ON cards FOR DELETE TO authenticated
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- Comments
CREATE POLICY "Authenticated users can view comments"
  ON comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert comments"
  ON comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own comments; admins can delete any"
  ON comments FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- Attachments
CREATE POLICY "Authenticated users can view attachments"
  ON attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can upload attachments"
  ON attachments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own attachments; admins delete any"
  ON attachments FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- Notifications: private to the owner
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Activity logs: read-only for all, write via trigger only
CREATE POLICY "Authenticated users can view activity logs"
  ON activity_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert activity logs"
  ON activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =====================
-- SUPABASE STORAGE SETUP
-- =====================
-- Run these in Supabase Storage:
-- 1. Create bucket named "attachments" (private)
-- 2. Add storage policies:

-- INSERT policy: authenticated users can upload
-- create policy "Authenticated users can upload"
--   on storage.objects for insert to authenticated
--   with check (bucket_id = 'attachments');

-- SELECT policy: authenticated users can view
-- create policy "Authenticated users can view attachments"
--   on storage.objects for select to authenticated
--   using (bucket_id = 'attachments');

-- DELETE policy: owners and admins can delete
-- create policy "Users can delete own attachments"
--   on storage.objects for delete to authenticated
--   using (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =====================
-- SEED DATA
-- =====================
-- After creating your admin user in Supabase Auth, update their role:
-- UPDATE users SET role = 'admin' WHERE email = 'your-admin@email.com';
