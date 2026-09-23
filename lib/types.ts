export type Category = 'stay' | 'food' | 'transport' | 'adventure' | 'travel' | 'shopping' | 'other';

export type Trip = {
  id: string; code: string; name: string; destination: string;
  start_date: string; end_date: string; currency: string; budget: number;
  admin_member_id: string | null; settings: Partial<Settings> | null;
};
export type Settings = { members_can_edit_plan: boolean; members_can_add_expenses: boolean; members_can_add_members: boolean; members_can_upload_photos: boolean; members_can_use_ai: boolean; members_can_announce: boolean; members_can_assign_tasks: boolean; gets_notifications: boolean };
export type PermKey = keyof Settings;
export type Member = { id: string; trip_id: string; name: string; color: string; upi_id: string | null; email: string | null; phone: string | null; user_id: string | null; role: 'admin' | 'member'; perms: Partial<Settings> | null; avatar_path: string | null };
export type Profile = { id: string; name: string; upi_id: string | null; avatar_path: string | null };
export type Expense = {
  id: string; trip_id: string; title: string; amount: number; category: Category;
  paid_by: string; split_among: string[]; shares: Record<string, number> | null; date: string; note: string | null; created_at: string;
};
export type PlanItem = {
  id: string; trip_id: string; date: string; time: string; title: string;
  note: string | null; cost: number; category: Category; done: boolean;
};
export type Payment = {
  id: string; trip_id: string; from_member: string; to_member: string; amount: number; expense_id: string | null; created_at: string;
};
export type Message = {
  id: string; trip_id: string; member_id: string | null; body: string; is_ai: boolean; kind: 'text' | 'image' | 'sticker' | 'gif' | 'call' | 'poll'; image_path: string | null; session_id: string | null; created_at: string;
};
export type Photo = {
  id: string; trip_id: string; member_id: string | null; path: string; caption: string | null;
  width: number | null; height: number | null; created_at: string;
};

export type Passenger = { name: string; coach: string; seat: string; status?: string };
export type Ticket = {
  id: string; trip_id: string; member_id: string | null; direction: 'outbound' | 'return' | 'other';
  train_name: string; train_no: string; from_station: string; to_station: string;
  depart_at: string; arrive_at: string | null; pnr: string | null; travel_class: string | null;
  passengers: Passenger[]; image_path: string | null; reminded: number[]; created_at: string;
};

export type Task = { id: string; trip_id: string; title: string; assignee_id: string | null; done: boolean; created_by: string | null; created_at: string };
export type PollVote = { id: string; trip_id: string; message_id: string; member_id: string; option_index: number; created_at: string };
export type PollData = { question: string; options: string[]; multi: boolean };

export type ChatSession = { id: string; trip_id: string; title: string | null; created_by: string | null; created_at: string };
