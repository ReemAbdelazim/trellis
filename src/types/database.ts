
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "attachments": {
                  Row: {
                    "created_at": string,"file_name": string,"id": string,"mime_type": string | null,"size_bytes": number | null,"storage_backend": string,"storage_path": string,"task_id": string,"uploader_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"file_name": string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number | null,"storage_backend"?: string,"storage_path": string,"task_id": string,"uploader_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string | null,"size_bytes"?: number | null,"storage_backend"?: string,"storage_path"?: string,"task_id"?: string,"uploader_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_uploader_id_fkey"
      columns: ["uploader_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"edited_at": string | null,"id": string,"mentions": (string)[],"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"task_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"mentions"?: (string)[],"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"custom_fields": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"id": string,"name": string,"position": number,"project_id": string,"type": Database["public"]['Enums']["field_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"name": string,"position"?: number,"project_id": string,"type": Database["public"]['Enums']["field_type"]
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"name"?: string,"position"?: number,"project_id"?: string,"type"?: Database["public"]['Enums']["field_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "custom_fields_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"goal_projects": {
                  Row: {
                    "goal_id": string,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "goal_id": string,"project_id": string
                  }
                  Update: {
                    "goal_id"?: string,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_projects_goal_id_fkey"
      columns: ["goal_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goal_projects_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"goal_status_updates": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"goal_id": string,"id": string,"status": Database["public"]['Enums']["status_color"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"goal_id": string,"id"?: string,"status": Database["public"]['Enums']["status_color"]
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"goal_id"?: string,"id"?: string,"status"?: Database["public"]['Enums']["status_color"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_status_updates_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goal_status_updates_goal_id_fkey"
      columns: ["goal_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string,"due_date": string | null,"id": string,"metric_current": number,"metric_start": number,"metric_target": number,"metric_unit": string,"name": string,"owner_id": string | null,"parent_id": string | null,"progress_source": string,"start_date": string | null,"status": Database["public"]['Enums']["status_color"] | null,"team_id": string | null,"time_period": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string,"due_date"?: string | null,"id"?: string,"metric_current"?: number,"metric_start"?: number,"metric_target"?: number,"metric_unit"?: string,"name": string,"owner_id"?: string | null,"parent_id"?: string | null,"progress_source"?: string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["status_color"] | null,"team_id"?: string | null,"time_period"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string,"due_date"?: string | null,"id"?: string,"metric_current"?: number,"metric_start"?: number,"metric_target"?: number,"metric_unit"?: string,"name"?: string,"owner_id"?: string | null,"parent_id"?: string | null,"progress_source"?: string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["status_color"] | null,"team_id"?: string | null,"time_period"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"id": string,"invited_by": string | null,"project_id": string | null,"role": Database["public"]['Enums']["user_role"],"team_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"id"?: string,"invited_by"?: string | null,"project_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"team_id"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"invited_by"?: string | null,"project_id"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"team_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_project_fk"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_team_fk"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"archived_at": string | null,"comment_id": string | null,"created_at": string,"data": NonNullable<Json>,"emailed_at": string | null,"goal_id": string | null,"id": string,"project_id": string | null,"read_at": string | null,"task_id": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"archived_at"?: string | null,"comment_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"emailed_at"?: string | null,"goal_id"?: string | null,"id"?: string,"project_id"?: string | null,"read_at"?: string | null,"task_id"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"archived_at"?: string | null,"comment_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"emailed_at"?: string | null,"goal_id"?: string | null,"id"?: string,"project_id"?: string | null,"read_at"?: string | null,"task_id"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_goal_fk"
      columns: ["goal_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"org_settings": {
                  Row: {
                    "allow_member_invites": boolean,"allowed_domains": (string)[],"id": number,"name": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_member_invites"?: boolean,"allowed_domains"?: (string)[],"id"?: number,"name"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "allow_member_invites"?: boolean,"allowed_domains"?: (string)[],"id"?: number,"name"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"portfolio_members": {
                  Row: {
                    "can_edit": boolean,"portfolio_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_edit"?: boolean,"portfolio_id": string,"user_id": string
                  }
                  Update: {
                    "can_edit"?: boolean,"portfolio_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "portfolio_members_portfolio_id_fkey"
      columns: ["portfolio_id"]
isOneToOne: false
      referencedRelation: "portfolios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portfolio_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"portfolio_projects": {
                  Row: {
                    "portfolio_id": string,"position": number,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "portfolio_id": string,"position"?: number,"project_id": string
                  }
                  Update: {
                    "portfolio_id"?: string,"position"?: number,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "portfolio_projects_portfolio_id_fkey"
      columns: ["portfolio_id"]
isOneToOne: false
      referencedRelation: "portfolios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portfolio_projects_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"portfolios": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"is_private": boolean,"name": string,"owner_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"is_private"?: boolean,"name": string,"owner_id"?: string | null
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"is_private"?: boolean,"name"?: string,"owner_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "portfolios_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"email_notifications": boolean,"full_name": string,"id": string,"last_digest_on": string | null,"last_seen_at": string | null,"role": Database["public"]['Enums']["user_role"],"status": Database["public"]['Enums']["user_status"],"timezone": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"email_notifications"?: boolean,"full_name"?: string,"id": string,"last_digest_on"?: string | null,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["user_status"],"timezone"?: string | null,"title"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"email_notifications"?: boolean,"full_name"?: string,"id"?: string,"last_digest_on"?: string | null,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["user_status"],"timezone"?: string | null,"title"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"project_favorites": {
                  Row: {
                    "position": number,"project_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "position"?: number,"project_id": string,"user_id"?: string
                  }
                  Update: {
                    "position"?: number,"project_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_favorites_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"project_members": {
                  Row: {
                    "created_at": string,"project_id": string,"role": Database["public"]['Enums']["project_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"project_id": string,"role"?: Database["public"]['Enums']["project_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"project_id"?: string,"role"?: Database["public"]['Enums']["project_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"project_status_updates": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"project_id": string,"status": Database["public"]['Enums']["status_color"],"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"project_id": string,"status": Database["public"]['Enums']["status_color"],"title"?: string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"project_id"?: string,"status"?: Database["public"]['Enums']["status_color"],"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_status_updates_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_status_updates_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "archived": boolean,"color": string,"created_at": string,"created_by": string | null,"current_status": Database["public"]['Enums']["status_color"] | null,"default_view": string,"description": string,"due_date": string | null,"icon": string,"id": string,"is_template": boolean,"name": string,"owner_id": string | null,"privacy": Database["public"]['Enums']["project_privacy"],"start_date": string | null,"team_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"color"?: string,"created_at"?: string,"created_by"?: string | null,"current_status"?: Database["public"]['Enums']["status_color"] | null,"default_view"?: string,"description"?: string,"due_date"?: string | null,"icon"?: string,"id"?: string,"is_template"?: boolean,"name": string,"owner_id"?: string | null,"privacy"?: Database["public"]['Enums']["project_privacy"],"start_date"?: string | null,"team_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived"?: boolean,"color"?: string,"created_at"?: string,"created_by"?: string | null,"current_status"?: Database["public"]['Enums']["status_color"] | null,"default_view"?: string,"description"?: string,"due_date"?: string | null,"icon"?: string,"id"?: string,"is_template"?: boolean,"name"?: string,"owner_id"?: string | null,"privacy"?: Database["public"]['Enums']["project_privacy"],"start_date"?: string | null,"team_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"rules": {
                  Row: {
                    "actions": NonNullable<Json>,"created_at": string,"created_by": string | null,"enabled": boolean,"id": string,"name": string,"project_id": string,"trigger_config": NonNullable<Json>,"trigger_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actions"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"id"?: string,"name": string,"project_id": string,"trigger_config"?: NonNullable<Json>,"trigger_type": string
                  }
                  Update: {
                    "actions"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"id"?: string,"name"?: string,"project_id"?: string,"trigger_config"?: NonNullable<Json>,"trigger_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rules_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rules_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"sections": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"position": number,"project_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"position"?: number,"project_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"position"?: number,"project_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sections_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"task_activity": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"data": NonNullable<Json>,"id": number,"kind": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"kind": string,"task_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"kind"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_activity_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_activity_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_dependencies": {
                  Row: {
                    "created_at": string,"depends_on_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"depends_on_id": string,"task_id": string
                  }
                  Update: {
                    "created_at"?: string,"depends_on_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_dependencies_depends_on_id_fkey"
      columns: ["depends_on_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_dependencies_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_field_values": {
                  Row: {
                    "field_id": string,"task_id": string,"updated_at": string,"value": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "field_id": string,"task_id": string,"updated_at"?: string,"value"?: Json | null
                  }
                  Update: {
                    "field_id"?: string,"task_id"?: string,"updated_at"?: string,"value"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_field_values_field_id_fkey"
      columns: ["field_id"]
isOneToOne: false
      referencedRelation: "custom_fields"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_field_values_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_followers": {
                  Row: {
                    "task_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "task_id": string,"user_id": string
                  }
                  Update: {
                    "task_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_followers_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_followers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"task_likes": {
                  Row: {
                    "task_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "task_id": string,"user_id"?: string
                  }
                  Update: {
                    "task_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_likes_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"task_tags": {
                  Row: {
                    "tag_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "tag_id": string,"task_id": string
                  }
                  Update: {
                    "tag_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_tags_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assignee_id": string | null,"completed": boolean,"completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"description": string,"due_date": string | null,"estimate_hours": number | null,"id": string,"is_milestone": boolean,"my_tasks_bucket": string,"my_tasks_position": number,"name": string,"parent_id": string | null,"position": number,"project_id": string | null,"search": unknown,"section_id": string | null,"start_date": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id"?: string | null,"completed"?: boolean,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"due_date"?: string | null,"estimate_hours"?: number | null,"id"?: string,"is_milestone"?: boolean,"my_tasks_bucket"?: string,"my_tasks_position"?: number,"name"?: string,"parent_id"?: string | null,"position"?: number,"project_id"?: string | null,"search"?: never,"section_id"?: string | null,"start_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "assignee_id"?: string | null,"completed"?: boolean,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"due_date"?: string | null,"estimate_hours"?: number | null,"id"?: string,"is_milestone"?: boolean,"my_tasks_bucket"?: string,"my_tasks_position"?: number,"name"?: string,"parent_id"?: string | null,"position"?: number,"project_id"?: string | null,"search"?: never,"section_id"?: string | null,"start_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_completed_by_fkey"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "created_at": string,"is_admin": boolean,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"is_admin"?: boolean,"team_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"is_admin"?: boolean,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_members_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "archived": boolean,"color": string,"created_at": string,"created_by": string | null,"description": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"color"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "archived"?: boolean,"color"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "can_comment_task":
{ Args: { "p_task": string }; Returns: boolean
                           },
"can_edit_portfolio":
{ Args: { "p_portfolio": string }; Returns: boolean
                           },
"can_edit_project":
{ Args: { "p_project": string }; Returns: boolean
                           },
"can_edit_task":
{ Args: { "p_task": string }; Returns: boolean
                           },
"can_see_profile":
{ Args: { "p_profile": string }; Returns: boolean
                           },
"can_view_portfolio":
{ Args: { "p_portfolio": string }; Returns: boolean
                           },
"can_view_project":
{ Args: { "p_project": string }; Returns: boolean
                           },
"can_view_task":
{ Args: { "p_task": string }; Returns: boolean
                           },
"configure_notifications":
{ Args: { "p_secret": string,"p_url": string }; Returns: undefined
                           },
"duplicate_project":
{ Args: { "p_as_template"?: boolean,"p_include_tasks"?: boolean,"p_name": string,"p_project": string }; Returns: string
                           },
"is_active":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_full_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_silent":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_task_follower":
{ Args: { "p_task": string }; Returns: boolean
                           },
"is_team_admin":
{ Args: { "p_team": string }; Returns: boolean
                           },
"my_followed_task_ids":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"my_visible_project_ids":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"notification_delivery_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"project_access":
{ Args: { "p_project": string }; Returns: string
                           },
"project_stats":
{ Args: Record<PropertyKey, never>; Returns: {
              "completed_tasks": number,"last_activity_at": string,"overdue_tasks": number,"project_id": string,"total_tasks": number
            }[]
                           },
"try_uuid":
{ Args: { "p": string }; Returns: string
                           }
          }
          Enums: {
            "field_type": "text"|"number"|"single_select"|"multi_select"|"date"|"people"|"checkbox","project_privacy": "public"|"team"|"private","project_role": "owner"|"editor"|"commenter"|"viewer","status_color": "on_track"|"at_risk"|"off_track"|"on_hold"|"complete","user_role": "admin"|"member"|"guest","user_status": "active"|"deactivated"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "field_type": ["text", "number", "single_select", "multi_select", "date", "people", "checkbox"],"project_privacy": ["public", "team", "private"],"project_role": ["owner", "editor", "commenter", "viewer"],"status_color": ["on_track", "at_risk", "off_track", "on_hold", "complete"],"user_role": ["admin", "member", "guest"],"user_status": ["active", "deactivated"]
          }
        }
} as const
