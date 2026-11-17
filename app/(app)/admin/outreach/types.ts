/** Shapes the 0069 functions return, as the outreach screens read them. */

export interface Conversion {
  signed_up_at: string;
  verified: boolean;
  orders: number;
  first_order_at: string | null;
  /** Admins only (minor units, USD); null for a rep. */
  order_value: number | null;
}

export interface ContactRow {
  id: string;
  kind: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  segment: string | null;
  tags: string[];
  stage: string;
  do_not_contact: boolean;
  sender_id: string | null;
  sender_label: string | null;
  owner_id: string | null;
  owner_name: string | null;
  touches: number;
  last_contacted_at: string | null;
  replied_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  conversion: Conversion | null;
  total: number;
}

export interface SenderRow {
  id: string;
  label: string;
  channel: string;
  address: string;
  for_kind: string;
  signature: string | null;
  daily_limit: number;
  owner_id: string | null;
  owner_name: string | null;
  active: boolean;
  contacts: number;
  sent_today: number;
}

export interface TeamMember {
  user_id: string;
  name: string;
  is_admin: boolean;
}

export interface Dashboard {
  is_admin: boolean;
  totals: {
    contacts: number;
    existing: number;
    prospects: number;
    do_not_contact: number;
    due: number;
    never_contacted: number;
    contacted: number;
    replied: number;
    sent_today: number;
    sent_7d: number;
    interested: number;
    no_sender: number;
  };
  daily: { day: string; sent: number; replied: number }[];
  funnel: { kind: string; stage: string; n: number }[];
  senders: {
    id: string;
    label: string;
    channel: string;
    address: string;
    active: boolean;
    daily_limit: number;
    owner_name: string | null;
    contacts: number;
    contacted: number;
    replied: number;
    sent_today: number;
    sent_7d: number;
    clients: number;
  }[];
  owners: { owner_id: string | null; name: string; contacts: number; contacted: number; replied: number; due: number }[];
  conversion: { kind: string; signed_up: number; verified: number; ordered: number; order_value: number | null }[];
}

export interface ContactDetail {
  id: string;
  kind: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  linkedin: string | null;
  website: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  segment: string | null;
  tags: string[];
  notes: string | null;
  source: string | null;
  detail: string | null;
  fit: string | null;
  area_id: string | null;
  stage: string;
  do_not_contact: boolean;
  dnc_reason: string | null;
  sender_id: string | null;
  owner_id: string | null;
  touches: number;
  last_contacted_at: string | null;
  replied_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  sender: { id: string; label: string; channel: string; address: string; signature: string | null } | null;
  owner_name: string | null;
  conversion: Conversion | null;
  activities: {
    id: string;
    kind: string;
    channel: string | null;
    body: string | null;
    created_at: string;
    sender_label: string | null;
    actor_name: string | null;
  }[];
}

/** The name a contact is shown by. */
export const contactTitle = (c: { business_name: string | null; contact_name: string | null; email: string | null }) =>
  c.business_name ?? c.contact_name ?? c.email ?? "Contact";
