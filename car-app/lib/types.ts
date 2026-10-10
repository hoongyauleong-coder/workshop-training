export const STATUSES = ['New', 'Sent', 'Acknowledged', 'Evidence Submitted', 'Disputed', 'Closed', 'Cancelled'] as const;
export type Status = (typeof STATUSES)[number];

export interface Car {
  id: string;
  car_no: string | null;
  date_raised: string | null;
  area: string;
  finding: string;
  requirement_ref: string;
  severity: string;
  owner_name: string;
  owner_email: string;
  hod_name: string;
  hod_email: string;
  status: Status;
  sent_date: string | null;
  ack_date: string | null;
  due_date: string | null;
  extension_due: string | null;
  last_stage: string;
  last_sent: string | null;
  ack_reminders: number;
  closed_date: string | null;
  verified_by: string;
  remarks: string;
  token: string | null;
  created_at?: string;
  updated_at?: string;
}

export type NewCar = Pick<Car, 'area' | 'finding' | 'requirement_ref' | 'severity' | 'owner_name' | 'owner_email' | 'hod_name' | 'hod_email'> & {
  car_no?: string | null;
};

export interface Settings {
  closure_wd: number;
  pre_wd: number;
  r1_wd: number;
  r2_gap: number;
  repeat_gap: number;
  eff_wd: number;
  auditor_name: string;
  auditor_title: string;
  dept: string;
  auditor_email: string;
  extra_cc: string;
  car_prefix: string;
  test_mode: boolean;
  simulated_today: string | null;
}

export interface EvidenceFile {
  path: string;
  name: string;
  type: string;
  size: number;
}

export interface Evidence {
  id: string;
  car_id: string;
  root_cause: string;
  action_taken: string;
  files: EvidenceFile[];
  decision: 'Pending' | 'Accepted' | 'Rejected';
  decision_reason: string;
  submitted_at: string;
}

export interface LogEntry {
  id?: number;
  ts?: string;
  car_no: string;
  event: string;
  to_addr: string;
  cc_addr: string;
  detail: string;
  mode: 'LIVE' | 'TEST';
}

export const SEVERITIES = ['Major NC', 'Minor NC', 'Observation'];
