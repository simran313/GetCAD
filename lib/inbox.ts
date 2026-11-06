/** One notification as the bell shows it (app/api/notifications, revamp R3). */
export interface InboxItem {
  id: string;
  kind: string;
  order_id: string | null;
  summary: string;
  created_at: string;
  read_at: string | null;
}
