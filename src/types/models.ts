import type { Database } from "./database";
import { STATUS_LABEL as SHARED_STATUS_LABEL } from "../../supabase/functions/_shared/notification-text";

type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];
type Insert<T extends keyof Tables> = Tables[T]["Insert"];
type Update<T extends keyof Tables> = Tables[T]["Update"];

export type Enums = Database["public"]["Enums"];
export type UserRole = Enums["user_role"];
export type ProjectPrivacy = Enums["project_privacy"];
export type ProjectRole = Enums["project_role"];
export type StatusColor = Enums["status_color"];
export type FieldType = Enums["field_type"];

export type OrgSettings = Row<"org_settings">;
export type Profile = Row<"profiles">;
export type Invitation = Row<"invitations">;
export type Team = Row<"teams">;
export type TeamMember = Row<"team_members">;
export type Project = Row<"projects">;
export type ProjectInsert = Insert<"projects">;
export type ProjectUpdate = Update<"projects">;
export type ProjectMember = Row<"project_members">;
export type Section = Row<"sections">;
export type ProjectStatusUpdate = Row<"project_status_updates">;
/** A task row as the app reads it (without the server-side full-text `search` column). */
export type Task = Omit<Row<"tasks">, "search">;
export type TaskInsert = Insert<"tasks">;
export type TaskUpdate = Update<"tasks">;
export type TaskDependency = Row<"task_dependencies">;
export type Tag = Row<"tags">;
export type Comment = Row<"comments">;
export type TaskActivity = Row<"task_activity">;
export type Attachment = Row<"attachments">;
export type CustomField = Row<"custom_fields">;
export type TaskFieldValue = Row<"task_field_values">;
export type Rule = Row<"rules">;
export type Notification = Row<"notifications">;
export type Goal = Row<"goals">;
export type GoalStatusUpdate = Row<"goal_status_updates">;
export type Portfolio = Row<"portfolios">;
export type PortfolioProject = Row<"portfolio_projects">;
export type ProjectStats = Database["public"]["Functions"]["project_stats"]["Returns"][number];

/** Option inside a single/multi select custom field's `config.options`. */
export interface FieldOption {
  id: string;
  name: string;
  color: string;
}

export interface FieldConfig {
  options?: FieldOption[];
  precision?: number;
  unit?: string;
}

export type RuleTrigger =
  | "task_added"
  | "section_changed"
  | "completed"
  | "assignee_changed"
  | "due_date_changed"
  | "field_changed";

export type RuleAction =
  | { type: "move_to_section"; section_id: string }
  | { type: "set_complete"; value: boolean }
  | { type: "set_assignee"; user_id: string | null }
  | { type: "set_due_in_days"; days: number }
  | { type: "add_follower"; user_id: string }
  | { type: "add_comment"; body: string }
  | { type: "set_field"; field_id: string; value: unknown };

export const STATUS_LABEL: Record<StatusColor, string> = SHARED_STATUS_LABEL;

export const STATUS_CLASS: Record<StatusColor, string> = {
  on_track: "bg-success-soft text-success",
  at_risk: "bg-warning-soft text-warning",
  off_track: "bg-danger-soft text-danger",
  on_hold: "bg-info-soft text-info",
  complete: "bg-surface-3 text-muted",
};

export const STATUS_DOT: Record<StatusColor, string> = {
  on_track: "bg-success",
  at_risk: "bg-warning",
  off_track: "bg-danger",
  on_hold: "bg-info",
  complete: "bg-faint",
};
