import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface User {
  id: string;
  login: string;
  password: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: string;
  user_id: string;
  email: string;
  password: string;
  status: string;
  sent_count: number;
  success_count: number;
  failed_count: number;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  email: string;
  name: string;
  link: string;
  owner_id: string;
  default_sender_email_id: string | null;
  created_at: string;
  updated_at: string;
  has_changes: boolean;
}

export interface Mailing {
  id: string;
  user_id: string;
  subject: string;
  text_content: string | null;
  html_content: string | null;
  scheduled_at: string | null;
  timezone: string;
  status: string;
  sent_count: number;
  success_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
