import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { productWord } from "@/lib/client/orders";

/**
 * What the designer and pod lead screens read (Phase 5c, migration 0047).
 * Read as the user: the functions decide what each person may see.
 */

export interface Job {
  order_id: string;
  job_code: string | null;
  product: string;
  centre_shape: string | null;
  service: string;
  status: string;
  category: string | null;
  minutes: number | null;
  pay_paise: number | null;
  work_version: number;
  assigned_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  designer_due_at: string | null;
}

export interface PodJob {
  order_id: string;
  order_ref: string | null;
  title: string;
  product: string;
  service: string;
  status: string;
  category: string | null;
  minutes: number | null;
  work_version: number;
  pod_id: string | null;
  pod_name: string | null;
  pod_lead_name: string | null;
  designer_id: string | null;
  designer_ref: string | null;
  designer_name: string | null;
  client_code: string | null;
  started_at: string | null;
  submitted_at: string | null;
  qc_ticks: number;
  designer_ticks: number;
  sla_status: string | null;
  sla_due_at: string | null;
  designer_due_at: string | null;
  first_look_at: string | null;
  confirmed_at: string | null;
  paid_at: string | null;
  source: string | null;
  dispute_reason: string | null;
  currency: string | null;
  price_total: number | null;
  qc_payout_paise: number | null;
  designer_payout_paise: number | null;
  created_at: string;
}

export interface PodDesignerLoad {
  designer_id: string;
  designer_ref: string | null;
  name: string | null;
  pod_id: string;
  pod_name: string;
  open_minutes: number;
  shift_minutes: number;
  assignable: boolean;
}

export interface Earning {
  obligation_id: string;
  order_id: string;
  display_ref: string | null;
  product: string;
  category: string | null;
  minutes: number | null;
  party: "DESIGNER" | "QC";
  amount_paise: number;
  status: "owed" | "exported" | "paid";
  created_at: string;
  exported_at: string | null;
  paid_at: string | null;
}

/** A designer's name for a job: never the client's label (job_brief drops it). */
export function jobTitle(job: Pick<Job, "product" | "centre_shape">): string {
  const shape = job.centre_shape ? `${job.centre_shape.toLowerCase().replace(/_/g, " ")} centre` : null;
  return [productWord(job.product), shape].filter(Boolean).join(" · ");
}

async function rows<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export const loadMyWork = (s: SupabaseClient, orderId?: string) =>
  rows<Job>(s.rpc("my_work", orderId ? { p_order_id: orderId } : {}));

export const loadPodJobs = (s: SupabaseClient, orderId?: string) =>
  rows<PodJob>(s.rpc("pod_jobs", orderId ? { p_order_id: orderId } : {}));

export const loadPodLoad = (s: SupabaseClient) => rows<PodDesignerLoad>(s.rpc("pod_load"));

export const loadEarnings = (s: SupabaseClient) => rows<Earning>(s.rpc("my_earnings"));


