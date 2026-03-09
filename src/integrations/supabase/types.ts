export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      academy_courses: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          sort_order: number
          status: string
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          sort_order?: number
          status?: string
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          sort_order?: number
          status?: string
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_lessons: {
        Row: {
          content_text: string | null
          content_type: string
          content_url: string | null
          course_id: string
          created_at: string | null
          description: string | null
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          content_text?: string | null
          content_type?: string
          content_url?: string | null
          course_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          content_text?: string | null
          content_type?: string
          content_url?: string | null
          course_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "academy_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          area: string
          created_at: string | null
          description: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          property_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          area: string
          created_at?: string | null
          description: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          property_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          area?: string
          created_at?: string | null
          description?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          property_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_activity_log: {
        Row: {
          action: string
          agent_key: string
          cost_incurred: number | null
          created_at: string | null
          details: Json | null
          execution_ms: number | null
          id: string
          message: string
          organization_id: string
          related_call_id: string | null
          related_lead_id: string | null
          related_property_id: string | null
          related_showing_id: string | null
          related_task_id: string | null
          status: string
        }
        Insert: {
          action: string
          agent_key: string
          cost_incurred?: number | null
          created_at?: string | null
          details?: Json | null
          execution_ms?: number | null
          id?: string
          message: string
          organization_id: string
          related_call_id?: string | null
          related_lead_id?: string | null
          related_property_id?: string | null
          related_showing_id?: string | null
          related_task_id?: string | null
          status: string
        }
        Update: {
          action?: string
          agent_key?: string
          cost_incurred?: number | null
          created_at?: string | null
          details?: Json | null
          execution_ms?: number | null
          id?: string
          message?: string
          organization_id?: string
          related_call_id?: string | null
          related_lead_id?: string | null
          related_property_id?: string | null
          related_showing_id?: string | null
          related_task_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_log_related_call_id_fkey"
            columns: ["related_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_log_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_log_related_property_id_fkey"
            columns: ["related_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_log_related_property_id_fkey"
            columns: ["related_property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "agent_activity_log_related_showing_id_fkey"
            columns: ["related_showing_id"]
            isOneToOne: false
            referencedRelation: "showings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_log_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          action_type: string
          agent_type: string
          attempt_number: number | null
          completed_at: string | null
          context: Json | null
          created_at: string | null
          executed_at: string | null
          id: string
          lead_id: string
          max_attempts: number | null
          organization_id: string
          pause_reason: string | null
          paused_at: string | null
          paused_by: string | null
          result_call_id: string | null
          result_communication_id: string | null
          scheduled_for: string
          status: string
        }
        Insert: {
          action_type: string
          agent_type: string
          attempt_number?: number | null
          completed_at?: string | null
          context?: Json | null
          created_at?: string | null
          executed_at?: string | null
          id?: string
          lead_id: string
          max_attempts?: number | null
          organization_id: string
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          result_call_id?: string | null
          result_communication_id?: string | null
          scheduled_for: string
          status?: string
        }
        Update: {
          action_type?: string
          agent_type?: string
          attempt_number?: number | null
          completed_at?: string | null
          context?: Json | null
          created_at?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string
          max_attempts?: number | null
          organization_id?: string
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          result_call_id?: string | null
          result_communication_id?: string | null
          scheduled_for?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_result_call_id_fkey"
            columns: ["result_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_result_communication_id_fkey"
            columns: ["result_communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
        ]
      }
      agents_registry: {
        Row: {
          agent_key: string
          avg_execution_ms: number | null
          biblical_name: string
          category: string
          created_at: string | null
          description: string
          display_role: string
          edge_function_name: string | null
          executions_today: number | null
          executions_total: number | null
          failures_today: number | null
          failures_total: number | null
          id: string
          is_enabled: boolean | null
          last_error_at: string | null
          last_error_message: string | null
          last_execution_at: string | null
          last_success_at: string | null
          organization_id: string
          required_services: string[] | null
          sprint: number
          status: string
          successes_today: number | null
          successes_total: number | null
          updated_at: string | null
        }
        Insert: {
          agent_key: string
          avg_execution_ms?: number | null
          biblical_name: string
          category: string
          created_at?: string | null
          description: string
          display_role: string
          edge_function_name?: string | null
          executions_today?: number | null
          executions_total?: number | null
          failures_today?: number | null
          failures_total?: number | null
          id?: string
          is_enabled?: boolean | null
          last_error_at?: string | null
          last_error_message?: string | null
          last_execution_at?: string | null
          last_success_at?: string | null
          organization_id: string
          required_services?: string[] | null
          sprint?: number
          status?: string
          successes_today?: number | null
          successes_total?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_key?: string
          avg_execution_ms?: number | null
          biblical_name?: string
          category?: string
          created_at?: string | null
          description?: string
          display_role?: string
          edge_function_name?: string | null
          executions_today?: number | null
          executions_total?: number | null
          failures_today?: number | null
          failures_total?: number | null
          id?: string
          is_enabled?: boolean | null
          last_error_at?: string | null
          last_error_message?: string | null
          last_execution_at?: string | null
          last_success_at?: string | null
          organization_id?: string
          required_services?: string[] | null
          sprint?: number
          status?: string
          successes_today?: number | null
          successes_total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_registry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      applicant_notes: {
        Row: {
          applicant_id: string
          author_id: string
          created_at: string | null
          id: string
          note: string
        }
        Insert: {
          applicant_id: string
          author_id: string
          created_at?: string | null
          id?: string
          note: string
        }
        Update: {
          applicant_id?: string
          author_id?: string
          created_at?: string | null
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_notes_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "job_applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applicant_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_quality_details: Json | null
          agent_quality_score: number | null
          agent_type: string
          bland_call_id: string | null
          cost_bland: number | null
          cost_openai: number | null
          cost_total: number | null
          cost_twilio: number | null
          created_at: string | null
          detected_language: string | null
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          is_demo: boolean | null
          key_questions: Json | null
          lead_id: string | null
          organization_id: string
          phone_number: string
          property_id: string | null
          recording_disclosure_played: boolean | null
          recording_url: string | null
          score_change: number | null
          sentiment: string | null
          started_at: string
          status: string
          summary: string | null
          transcript: string | null
          twilio_call_sid: string | null
          unanswered_questions: Json | null
        }
        Insert: {
          agent_quality_details?: Json | null
          agent_quality_score?: number | null
          agent_type: string
          bland_call_id?: string | null
          cost_bland?: number | null
          cost_openai?: number | null
          cost_total?: number | null
          cost_twilio?: number | null
          created_at?: string | null
          detected_language?: string | null
          direction: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          is_demo?: boolean | null
          key_questions?: Json | null
          lead_id?: string | null
          organization_id: string
          phone_number: string
          property_id?: string | null
          recording_disclosure_played?: boolean | null
          recording_url?: string | null
          score_change?: number | null
          sentiment?: string | null
          started_at: string
          status: string
          summary?: string | null
          transcript?: string | null
          twilio_call_sid?: string | null
          unanswered_questions?: Json | null
        }
        Update: {
          agent_quality_details?: Json | null
          agent_quality_score?: number | null
          agent_type?: string
          bland_call_id?: string | null
          cost_bland?: number | null
          cost_openai?: number | null
          cost_total?: number | null
          cost_twilio?: number | null
          created_at?: string | null
          detected_language?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          is_demo?: boolean | null
          key_questions?: Json | null
          lead_id?: string | null
          organization_id?: string
          phone_number?: string
          property_id?: string | null
          recording_disclosure_played?: boolean | null
          recording_url?: string | null
          score_change?: number | null
          sentiment?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          transcript?: string | null
          twilio_call_sid?: string | null
          unanswered_questions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          call_id: string | null
          campaign_id: string
          channel: string | null
          communication_id: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          lead_id: string
          organization_id: string
          sent_at: string | null
          status: string
          task_id: string | null
        }
        Insert: {
          call_id?: string | null
          campaign_id: string
          channel?: string | null
          communication_id?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          lead_id: string
          organization_id: string
          sent_at?: string | null
          status?: string
          task_id?: string | null
        }
        Update: {
          call_id?: string | null
          campaign_id?: string
          channel?: string | null
          communication_id?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string
          organization_id?: string
          sent_at?: string | null
          status?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          campaign_type: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          delivered_count: number | null
          description: string | null
          email_body: string | null
          email_subject: string | null
          failed_count: number | null
          id: string
          max_per_hour: number | null
          max_total: number | null
          name: string
          organization_id: string
          scheduled_at: string | null
          sent_count: number | null
          sms_template: string | null
          started_at: string | null
          status: string
          target_count: number | null
          target_criteria: Json
          updated_at: string | null
          voice_script: string | null
        }
        Insert: {
          campaign_type: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          email_body?: string | null
          email_subject?: string | null
          failed_count?: number | null
          id?: string
          max_per_hour?: number | null
          max_total?: number | null
          name: string
          organization_id: string
          scheduled_at?: string | null
          sent_count?: number | null
          sms_template?: string | null
          started_at?: string | null
          status?: string
          target_count?: number | null
          target_criteria?: Json
          updated_at?: string | null
          voice_script?: string | null
        }
        Update: {
          campaign_type?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          description?: string | null
          email_body?: string | null
          email_subject?: string | null
          failed_count?: number | null
          id?: string
          max_per_hour?: number | null
          max_total?: number | null
          name?: string
          organization_id?: string
          scheduled_at?: string | null
          sent_count?: number | null
          sms_template?: string | null
          started_at?: string | null
          status?: string
          target_count?: number | null
          target_criteria?: Json
          updated_at?: string | null
          voice_script?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          body: string
          channel: string
          cost_twilio: number | null
          delivered_at: string | null
          direction: string
          id: string
          is_demo: boolean | null
          lead_id: string | null
          opened_at: string | null
          organization_id: string
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
          twilio_message_sid: string | null
        }
        Insert: {
          body: string
          channel: string
          cost_twilio?: number | null
          delivered_at?: string | null
          direction: string
          id?: string
          is_demo?: boolean | null
          lead_id?: string | null
          opened_at?: string | null
          organization_id: string
          recipient: string
          sent_at?: string | null
          status: string
          subject?: string | null
          twilio_message_sid?: string | null
        }
        Update: {
          body?: string
          channel?: string
          cost_twilio?: number | null
          delivered_at?: string | null
          direction?: string
          id?: string
          is_demo?: boolean | null
          lead_id?: string | null
          opened_at?: string | null
          organization_id?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          twilio_message_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_mentions: {
        Row: {
          advantage_mentioned: string | null
          call_id: string | null
          competitor_address: string | null
          competitor_name: string | null
          competitor_price: number | null
          confidence: number | null
          created_at: string | null
          id: string
          lead_chose_competitor: boolean | null
          lead_id: string | null
          organization_id: string
          transcript_excerpt: string | null
        }
        Insert: {
          advantage_mentioned?: string | null
          call_id?: string | null
          competitor_address?: string | null
          competitor_name?: string | null
          competitor_price?: number | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          lead_chose_competitor?: boolean | null
          lead_id?: string | null
          organization_id: string
          transcript_excerpt?: string | null
        }
        Update: {
          advantage_mentioned?: string | null
          call_id?: string | null
          competitor_address?: string | null
          competitor_name?: string | null
          competitor_price?: number | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          lead_chose_competitor?: boolean | null
          lead_id?: string | null
          organization_id?: string
          transcript_excerpt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_mentions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_mentions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_mentions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_log: {
        Row: {
          call_id: string | null
          consent_type: string
          created_at: string | null
          evidence_text: string | null
          evidence_url: string | null
          granted: boolean
          id: string
          ip_address: string | null
          lead_id: string
          method: string
          organization_id: string
          user_agent: string | null
          withdrawal_method: string | null
          withdrawn_at: string | null
        }
        Insert: {
          call_id?: string | null
          consent_type: string
          created_at?: string | null
          evidence_text?: string | null
          evidence_url?: string | null
          granted: boolean
          id?: string
          ip_address?: string | null
          lead_id: string
          method: string
          organization_id: string
          user_agent?: string | null
          withdrawal_method?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          call_id?: string | null
          consent_type?: string
          created_at?: string | null
          evidence_text?: string | null
          evidence_url?: string | null
          granted?: boolean
          id?: string
          ip_address?: string | null
          lead_id?: string
          method?: string
          organization_id?: string
          user_agent?: string | null
          withdrawal_method?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_log_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_predictions: {
        Row: {
          action_reasoning: string | null
          confidence_level: string | null
          conversion_probability: number
          created_at: string | null
          data_points_used: number | null
          id: string
          is_current: boolean | null
          lead_id: string
          model_used: string | null
          negative_factors: Json | null
          organization_id: string
          positive_factors: Json | null
          predicted_days_to_convert: number | null
          recommended_action: string | null
          superseded_by: string | null
        }
        Insert: {
          action_reasoning?: string | null
          confidence_level?: string | null
          conversion_probability: number
          created_at?: string | null
          data_points_used?: number | null
          id?: string
          is_current?: boolean | null
          lead_id: string
          model_used?: string | null
          negative_factors?: Json | null
          organization_id: string
          positive_factors?: Json | null
          predicted_days_to_convert?: number | null
          recommended_action?: string | null
          superseded_by?: string | null
        }
        Update: {
          action_reasoning?: string | null
          confidence_level?: string | null
          conversion_probability?: number
          created_at?: string | null
          data_points_used?: number | null
          id?: string
          is_current?: boolean | null
          lead_id?: string
          model_used?: string | null
          negative_factors?: Json | null
          organization_id?: string
          positive_factors?: Json | null
          predicted_days_to_convert?: number | null
          recommended_action?: string | null
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_predictions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_predictions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "conversion_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_records: {
        Row: {
          call_id: string | null
          communication_id: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          organization_id: string
          period_end: string
          period_start: string
          recorded_at: string
          service: string
          total_cost: number
          unit_cost: number
          usage_quantity: number
          usage_unit: string
        }
        Insert: {
          call_id?: string | null
          communication_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          period_end: string
          period_start: string
          recorded_at?: string
          service: string
          total_cost: number
          unit_cost: number
          usage_quantity: number
          usage_unit: string
        }
        Update: {
          call_id?: string | null
          communication_id?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          recorded_at?: string
          service?: string
          total_cost?: number
          unit_cost?: number
          usage_quantity?: number
          usage_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_records_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_records_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_records_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          message: string | null
          notes: string | null
          phone: string
          portfolio_size: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          message?: string | null
          notes?: string | null
          phone: string
          portfolio_size?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          notes?: string | null
          phone?: string
          portfolio_size?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string | null
          file_url: string
          id: string
          name: string
          owner_id: string
          property_id: string | null
          type: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_url: string
          id?: string
          name: string
          owner_id: string
          property_id?: string | null
          type?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_url?: string
          id?: string
          name?: string
          owner_id?: string
          property_id?: string | null
          type?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doorloop_sync_log: {
        Row: {
          action_taken: string | null
          created_at: string | null
          details: Json | null
          doorloop_id: string | null
          entity_type: string
          error_message: string | null
          id: string
          local_id: string | null
          organization_id: string
          status: string
          sync_direction: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string | null
          details?: Json | null
          doorloop_id?: string | null
          entity_type: string
          error_message?: string | null
          id?: string
          local_id?: string | null
          organization_id: string
          status: string
          sync_direction: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string | null
          details?: Json | null
          doorloop_id?: string | null
          entity_type?: string
          error_message?: string | null
          id?: string
          local_id?: string | null
          organization_id?: string
          status?: string
          sync_direction?: string
        }
        Relationships: [
          {
            foreignKeyName: "doorloop_sync_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          communication_id: string | null
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          lead_id: string | null
          organization_id: string | null
          recipient_email: string | null
          resend_email_id: string | null
          subject: string | null
        }
        Insert: {
          communication_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          recipient_email?: string | null
          resend_email_id?: string | null
          subject?: string | null
        }
        Update: {
          communication_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          recipient_email?: string | null
          resend_email_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_documents: {
        Row: {
          category: string
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faq_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health: {
        Row: {
          consecutive_failures: number | null
          created_at: string | null
          details: Json | null
          id: string
          last_checked_at: string
          last_healthy_at: string | null
          message: string | null
          organization_id: string
          response_ms: number | null
          service: string
          status: string
          updated_at: string | null
        }
        Insert: {
          consecutive_failures?: number | null
          created_at?: string | null
          details?: Json | null
          id?: string
          last_checked_at?: string
          last_healthy_at?: string | null
          message?: string | null
          organization_id: string
          response_ms?: number | null
          service: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          consecutive_failures?: number | null
          created_at?: string | null
          details?: Json | null
          id?: string
          last_checked_at?: string
          last_healthy_at?: string | null
          message?: string | null
          organization_id?: string
          response_ms?: number | null
          service?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_health_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_insights: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          data_points: Json
          headline: string
          id: string
          insight_type: string
          is_highlighted: boolean | null
          narrative: string
          organization_id: string
          period_end: string
          period_start: string
          property_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          data_points: Json
          headline: string
          id?: string
          insight_type: string
          is_highlighted?: boolean | null
          narrative: string
          organization_id: string
          period_end: string
          period_start: string
          property_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          data_points?: Json
          headline?: string
          id?: string
          insight_type?: string
          is_highlighted?: boolean | null
          narrative?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_insights_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_insights_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      investor_property_access: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          investor_id: string
          organization_id: string
          property_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          investor_id: string
          organization_id: string
          property_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          investor_id?: string
          organization_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_property_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_property_access_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_property_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_property_access_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_property_access_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      investor_reports: {
        Row: {
          created_at: string | null
          highlights: Json | null
          id: string
          investor_id: string | null
          organization_id: string
          period_end: string
          period_start: string
          property_id: string | null
          report_type: string
          resend_email_id: string | null
          sections: Json
          sent_at: string | null
          sent_to_email: string | null
          status: string
          summary: string
          title: string
        }
        Insert: {
          created_at?: string | null
          highlights?: Json | null
          id?: string
          investor_id?: string | null
          organization_id: string
          period_end: string
          period_start: string
          property_id?: string | null
          report_type: string
          resend_email_id?: string | null
          sections: Json
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string
          summary: string
          title: string
        }
        Update: {
          created_at?: string | null
          highlights?: Json | null
          id?: string
          investor_id?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          property_id?: string | null
          report_type?: string
          resend_email_id?: string | null
          sections?: Json
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_reports_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      job_applicants: {
        Row: {
          availability: string | null
          cover_letter: string | null
          created_at: string | null
          desired_start_date: string | null
          email: string
          first_name: string
          id: string
          languages: string[] | null
          last_name: string
          linkedin_url: string | null
          location: string | null
          phone: string | null
          portfolio_url: string | null
          position_id: string | null
          referral_source: string | null
          resume_url: string | null
          status: string
          step_completed: number
          updated_at: string | null
          work_authorization: boolean | null
          years_experience: number | null
        }
        Insert: {
          availability?: string | null
          cover_letter?: string | null
          created_at?: string | null
          desired_start_date?: string | null
          email: string
          first_name: string
          id?: string
          languages?: string[] | null
          last_name: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          portfolio_url?: string | null
          position_id?: string | null
          referral_source?: string | null
          resume_url?: string | null
          status?: string
          step_completed?: number
          updated_at?: string | null
          work_authorization?: boolean | null
          years_experience?: number | null
        }
        Update: {
          availability?: string | null
          cover_letter?: string | null
          created_at?: string | null
          desired_start_date?: string | null
          email?: string
          first_name?: string
          id?: string
          languages?: string[] | null
          last_name?: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          portfolio_url?: string | null
          position_id?: string | null
          referral_source?: string | null
          resume_url?: string | null
          status?: string
          step_completed?: number
          updated_at?: string | null
          work_authorization?: boolean | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applicants_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "job_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_positions: {
        Row: {
          created_at: string | null
          department: string | null
          description: string | null
          id: string
          is_active: boolean
          location: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          department?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          title?: string
        }
        Relationships: []
      }
      lead_field_changes: {
        Row: {
          change_source: string
          changed_by_agent: string | null
          changed_by_user_id: string | null
          created_at: string | null
          field_name: string
          id: string
          lead_id: string
          new_value: string | null
          note: string | null
          old_value: string | null
          organization_id: string
          related_call_id: string | null
        }
        Insert: {
          change_source: string
          changed_by_agent?: string | null
          changed_by_user_id?: string | null
          created_at?: string | null
          field_name: string
          id?: string
          lead_id: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          organization_id: string
          related_call_id?: string | null
        }
        Update: {
          change_source?: string
          changed_by_agent?: string | null
          changed_by_user_id?: string | null
          created_at?: string | null
          field_name?: string
          id?: string
          lead_id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          organization_id?: string
          related_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_field_changes_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_field_changes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_field_changes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_field_changes_related_call_id_fkey"
            columns: ["related_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_pinned: boolean | null
          lead_id: string
          note_type: string
          organization_id: string
          related_call_id: string | null
          related_showing_id: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_pinned?: boolean | null
          lead_id: string
          note_type?: string
          organization_id: string
          related_call_id?: string | null
          related_showing_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_pinned?: boolean | null
          lead_id?: string
          note_type?: string
          organization_id?: string
          related_call_id?: string | null
          related_showing_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_related_call_id_fkey"
            columns: ["related_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_related_showing_id_fkey"
            columns: ["related_showing_id"]
            isOneToOne: false
            referencedRelation: "showings"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_predictions: {
        Row: {
          based_on_leads_count: number | null
          conversion_probability: number | null
          created_at: string | null
          expires_at: string | null
          factors: Json
          id: string
          lead_id: string
          model_version: string | null
          organization_id: string
          predicted_at: string | null
          predicted_days_to_convert: number | null
          predicted_outcome: string | null
        }
        Insert: {
          based_on_leads_count?: number | null
          conversion_probability?: number | null
          created_at?: string | null
          expires_at?: string | null
          factors?: Json
          id?: string
          lead_id: string
          model_version?: string | null
          organization_id: string
          predicted_at?: string | null
          predicted_days_to_convert?: number | null
          predicted_outcome?: string | null
        }
        Update: {
          based_on_leads_count?: number | null
          conversion_probability?: number | null
          created_at?: string | null
          expires_at?: string | null
          factors?: Json
          id?: string
          lead_id?: string
          model_version?: string | null
          organization_id?: string
          predicted_at?: string | null
          predicted_days_to_convert?: number | null
          predicted_outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_predictions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_properties: {
        Row: {
          created_at: string | null
          id: string
          lead_id: string
          listing_source: string | null
          notes: string | null
          organization_id: string
          property_id: string
          source: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          lead_id: string
          listing_source?: string | null
          notes?: string | null
          organization_id: string
          property_id: string
          source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          lead_id?: string
          listing_source?: string | null
          notes?: string | null
          organization_id?: string
          property_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_properties_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      lead_property_interests: {
        Row: {
          created_at: string | null
          id: string
          lead_id: string
          organization_id: string
          property_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lead_id: string
          organization_id: string
          property_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lead_id?: string
          organization_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_property_interests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_property_interests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      lead_score_history: {
        Row: {
          change_amount: number
          changed_by_agent: string | null
          changed_by_user_id: string | null
          created_at: string | null
          id: string
          is_demo: boolean | null
          lead_id: string
          new_score: number
          organization_id: string
          previous_score: number
          reason_code: string
          reason_text: string
          related_call_id: string | null
          related_showing_id: string | null
          triggered_by: string
        }
        Insert: {
          change_amount: number
          changed_by_agent?: string | null
          changed_by_user_id?: string | null
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          lead_id: string
          new_score: number
          organization_id: string
          previous_score: number
          reason_code: string
          reason_text: string
          related_call_id?: string | null
          related_showing_id?: string | null
          triggered_by: string
        }
        Update: {
          change_amount?: number
          changed_by_agent?: string | null
          changed_by_user_id?: string | null
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          lead_id?: string
          new_score?: number
          organization_id?: string
          previous_score?: number
          reason_code?: string
          reason_text?: string
          related_call_id?: string | null
          related_showing_id?: string | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_score_history_call"
            columns: ["related_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_score_history_showing"
            columns: ["related_showing_id"]
            isOneToOne: false
            referencedRelation: "showings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ai_brief: string | null
          ai_brief_generated_at: string | null
          ai_brief_generated_by: string | null
          assigned_leasing_agent_id: string | null
          budget_max: number | null
          budget_min: number | null
          call_consent: boolean | null
          call_consent_at: string | null
          contact_preference: string | null
          created_at: string | null
          do_not_contact: boolean | null
          doorloop_prospect_id: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          has_voucher: boolean | null
          hemlane_email_id: string | null
          hemlane_lead_id: string | null
          housing_authority: string | null
          human_control_reason: string | null
          human_controlled_at: string | null
          human_controlled_by: string | null
          id: string
          identity_verified: boolean | null
          interested_property_id: string | null
          interested_zip_codes: string[] | null
          is_demo: boolean | null
          is_human_controlled: boolean | null
          is_priority: boolean | null
          last_contact_at: string | null
          last_name: string | null
          lead_score: number | null
          lost_reason: string | null
          move_in_date: string | null
          next_follow_up_at: string | null
          organization_id: string
          persona_verification_id: string | null
          phone: string | null
          phone_verified: boolean | null
          preferred_language: string | null
          priority_reason: string | null
          sms_consent: boolean | null
          sms_consent_at: string | null
          source: string
          source_detail: string | null
          stage: string
          status: string
          updated_at: string | null
          verification_completed_at: string | null
          verification_provider: string | null
          verification_started_at: string | null
          verification_status: string | null
          voucher_amount: number | null
          voucher_status: string | null
          whatsapp_consent: boolean | null
          whatsapp_consent_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          ai_brief?: string | null
          ai_brief_generated_at?: string | null
          ai_brief_generated_by?: string | null
          assigned_leasing_agent_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          call_consent?: boolean | null
          call_consent_at?: string | null
          contact_preference?: string | null
          created_at?: string | null
          do_not_contact?: boolean | null
          doorloop_prospect_id?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          has_voucher?: boolean | null
          hemlane_email_id?: string | null
          hemlane_lead_id?: string | null
          housing_authority?: string | null
          human_control_reason?: string | null
          human_controlled_at?: string | null
          human_controlled_by?: string | null
          id?: string
          identity_verified?: boolean | null
          interested_property_id?: string | null
          interested_zip_codes?: string[] | null
          is_demo?: boolean | null
          is_human_controlled?: boolean | null
          is_priority?: boolean | null
          last_contact_at?: string | null
          last_name?: string | null
          lead_score?: number | null
          lost_reason?: string | null
          move_in_date?: string | null
          next_follow_up_at?: string | null
          organization_id: string
          persona_verification_id?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          preferred_language?: string | null
          priority_reason?: string | null
          sms_consent?: boolean | null
          sms_consent_at?: string | null
          source: string
          source_detail?: string | null
          stage?: string
          status?: string
          updated_at?: string | null
          verification_completed_at?: string | null
          verification_provider?: string | null
          verification_started_at?: string | null
          verification_status?: string | null
          voucher_amount?: number | null
          voucher_status?: string | null
          whatsapp_consent?: boolean | null
          whatsapp_consent_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          ai_brief?: string | null
          ai_brief_generated_at?: string | null
          ai_brief_generated_by?: string | null
          assigned_leasing_agent_id?: string | null
          budget_max?: number | null
          budget_min?: number | null
          call_consent?: boolean | null
          call_consent_at?: string | null
          contact_preference?: string | null
          created_at?: string | null
          do_not_contact?: boolean | null
          doorloop_prospect_id?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          has_voucher?: boolean | null
          hemlane_email_id?: string | null
          hemlane_lead_id?: string | null
          housing_authority?: string | null
          human_control_reason?: string | null
          human_controlled_at?: string | null
          human_controlled_by?: string | null
          id?: string
          identity_verified?: boolean | null
          interested_property_id?: string | null
          interested_zip_codes?: string[] | null
          is_demo?: boolean | null
          is_human_controlled?: boolean | null
          is_priority?: boolean | null
          last_contact_at?: string | null
          last_name?: string | null
          lead_score?: number | null
          lost_reason?: string | null
          move_in_date?: string | null
          next_follow_up_at?: string | null
          organization_id?: string
          persona_verification_id?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          preferred_language?: string | null
          priority_reason?: string | null
          sms_consent?: boolean | null
          sms_consent_at?: string | null
          source?: string
          source_detail?: string | null
          stage?: string
          status?: string
          updated_at?: string | null
          verification_completed_at?: string | null
          verification_provider?: string | null
          verification_started_at?: string | null
          verification_status?: string | null
          voucher_amount?: number | null
          voucher_status?: string | null
          whatsapp_consent?: boolean | null
          whatsapp_consent_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_ai_brief_generated_by_fkey"
            columns: ["ai_brief_generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_leasing_agent_id_fkey"
            columns: ["assigned_leasing_agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_human_controlled_by_fkey"
            columns: ["human_controlled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_interested_property_id_fkey"
            columns: ["interested_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_interested_property_id_fkey"
            columns: ["interested_property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          balance_due: number
          created_at: string | null
          end_date: string
          id: string
          monthly_rent: number
          property_id: string
          security_deposit: number
          start_date: string
          status: string
          tenant_id: string
          unit_number: string | null
        }
        Insert: {
          balance_due?: number
          created_at?: string | null
          end_date: string
          id?: string
          monthly_rent?: number
          property_id: string
          security_deposit?: number
          start_date: string
          status?: string
          tenant_id: string
          unit_number?: string | null
        }
        Update: {
          balance_due?: number
          created_at?: string | null
          end_date?: string
          id?: string
          monthly_rent?: number
          property_id?: string
          security_deposit?: number
          start_date?: string
          status?: string
          tenant_id?: string
          unit_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string | null
          created_at: string | null
          email_sent: boolean | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          organization_id: string
          read_at: string | null
          related_lead_id: string | null
          related_property_id: string | null
          related_showing_id: string | null
          sms_sent: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          organization_id: string
          read_at?: string | null
          related_lead_id?: string | null
          related_property_id?: string | null
          related_showing_id?: string | null
          sms_sent?: boolean | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          organization_id?: string
          read_at?: string | null
          related_lead_id?: string | null
          related_property_id?: string | null
          related_showing_id?: string | null
          sms_sent?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_property_id_fkey"
            columns: ["related_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_property_id_fkey"
            columns: ["related_property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "notifications_related_showing_id_fkey"
            columns: ["related_showing_id"]
            isOneToOne: false
            referencedRelation: "showings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_credentials: {
        Row: {
          bland_api_key: string | null
          created_at: string | null
          doorloop_api_key: string | null
          id: string
          maxmind_account_id: string | null
          maxmind_license_key: string | null
          openai_api_key: string | null
          organization_id: string
          persona_api_key: string | null
          resend_api_key: string | null
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          twilio_account_sid: string | null
          twilio_auth_token: string | null
          twilio_phone_number: string | null
          twilio_whatsapp_number: string | null
          updated_at: string | null
        }
        Insert: {
          bland_api_key?: string | null
          created_at?: string | null
          doorloop_api_key?: string | null
          id?: string
          maxmind_account_id?: string | null
          maxmind_license_key?: string | null
          openai_api_key?: string | null
          organization_id: string
          persona_api_key?: string | null
          resend_api_key?: string | null
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_phone_number?: string | null
          twilio_whatsapp_number?: string | null
          updated_at?: string | null
        }
        Update: {
          bland_api_key?: string | null
          created_at?: string | null
          doorloop_api_key?: string | null
          id?: string
          maxmind_account_id?: string | null
          maxmind_license_key?: string | null
          openai_api_key?: string | null
          organization_id?: string
          persona_api_key?: string | null
          resend_api_key?: string | null
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_phone_number?: string | null
          twilio_whatsapp_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          category: string
          description: string | null
          id: string
          key: string
          organization_id: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          category: string
          description?: string | null
          id?: string
          key: string
          organization_id: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          category?: string
          description?: string | null
          id?: string
          key?: string
          organization_id?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_color: string | null
          address: string | null
          billing_email: string | null
          city: string | null
          created_at: string | null
          default_language: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          max_calls_per_month: number | null
          max_properties: number | null
          max_users: number | null
          name: string
          owner_email: string
          phone: string | null
          plan: string
          primary_color: string | null
          slug: string
          state: string | null
          stripe_customer_id: string | null
          subscription_status: string
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          billing_email?: string | null
          city?: string | null
          created_at?: string | null
          default_language?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          max_calls_per_month?: number | null
          max_properties?: number | null
          max_users?: number | null
          name: string
          owner_email: string
          phone?: string | null
          plan?: string
          primary_color?: string | null
          slug: string
          state?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          billing_email?: string | null
          city?: string | null
          created_at?: string | null
          default_language?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          max_calls_per_month?: number | null
          max_properties?: number | null
          max_users?: number | null
          name?: string
          owner_email?: string
          phone?: string | null
          plan?: string
          primary_color?: string | null
          slug?: string
          state?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      owner_leads: {
        Row: {
          created_at: string | null
          doors: string
          email: string
          full_name: string
          id: string
          message: string | null
          notes: string | null
          phone: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          doors?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          notes?: string | null
          phone: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          doors?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          notes?: string | null
          phone?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          role: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string
          id: string
          phone?: string | null
          role?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          alternative_property_ids: string[] | null
          amenities: Json | null
          application_fee: number | null
          bathrooms: number
          bedrooms: number
          city: string
          coming_soon_date: string | null
          created_at: string | null
          deposit_amount: number | null
          description: string | null
          doorloop_property_id: string | null
          hud_inspection_ready: boolean | null
          id: string
          investor_id: string | null
          is_demo: boolean | null
          listed_date: string | null
          managed_by: string | null
          organization_id: string
          owner_id: string | null
          pet_policy: string | null
          photos: Json | null
          property_group_id: string | null
          property_type: string | null
          published_on: string[] | null
          rent_price: number
          section_8_accepted: boolean | null
          special_notes: string | null
          square_feet: number | null
          state: string
          status: string
          unit_number: string | null
          updated_at: string | null
          video_tour_url: string | null
          virtual_tour_url: string | null
          zip_code: string
        }
        Insert: {
          address: string
          alternative_property_ids?: string[] | null
          amenities?: Json | null
          application_fee?: number | null
          bathrooms: number
          bedrooms: number
          city?: string
          coming_soon_date?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          description?: string | null
          doorloop_property_id?: string | null
          hud_inspection_ready?: boolean | null
          id?: string
          investor_id?: string | null
          is_demo?: boolean | null
          listed_date?: string | null
          managed_by?: string | null
          organization_id: string
          owner_id?: string | null
          pet_policy?: string | null
          photos?: Json | null
          property_group_id?: string | null
          property_type?: string | null
          published_on?: string[] | null
          rent_price: number
          section_8_accepted?: boolean | null
          special_notes?: string | null
          square_feet?: number | null
          state?: string
          status?: string
          unit_number?: string | null
          updated_at?: string | null
          video_tour_url?: string | null
          virtual_tour_url?: string | null
          zip_code: string
        }
        Update: {
          address?: string
          alternative_property_ids?: string[] | null
          amenities?: Json | null
          application_fee?: number | null
          bathrooms?: number
          bedrooms?: number
          city?: string
          coming_soon_date?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          description?: string | null
          doorloop_property_id?: string | null
          hud_inspection_ready?: boolean | null
          id?: string
          investor_id?: string | null
          is_demo?: boolean | null
          listed_date?: string | null
          managed_by?: string | null
          organization_id?: string
          owner_id?: string | null
          pet_policy?: string | null
          photos?: Json | null
          property_group_id?: string | null
          property_type?: string | null
          published_on?: string[] | null
          rent_price?: number
          section_8_accepted?: boolean | null
          special_notes?: string | null
          square_feet?: number | null
          state?: string
          status?: string
          unit_number?: string | null
          updated_at?: string | null
          video_tour_url?: string | null
          virtual_tour_url?: string | null
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_property_group_id_fkey"
            columns: ["property_group_id"]
            isOneToOne: false
            referencedRelation: "property_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      property_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          organization_id: string
          property_id: string
          read_at: string | null
          read_by: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          organization_id: string
          property_id: string
          read_at?: string | null
          read_by?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          organization_id?: string
          property_id?: string
          read_at?: string | null
          read_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_alerts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_alerts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "property_alerts_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      property_groups: {
        Row: {
          address: string
          city: string
          cover_photo: string | null
          created_at: string | null
          description: string | null
          hud_inspection_ready: boolean | null
          id: string
          investor_id: string | null
          neighborhood_info: Json | null
          organization_id: string
          pet_policy: string | null
          property_type: string | null
          section_8_accepted: boolean | null
          state: string
          updated_at: string | null
          zip_code: string
        }
        Insert: {
          address: string
          city?: string
          cover_photo?: string | null
          created_at?: string | null
          description?: string | null
          hud_inspection_ready?: boolean | null
          id?: string
          investor_id?: string | null
          neighborhood_info?: Json | null
          organization_id: string
          pet_policy?: string | null
          property_type?: string | null
          section_8_accepted?: boolean | null
          state?: string
          updated_at?: string | null
          zip_code: string
        }
        Update: {
          address?: string
          city?: string
          cover_photo?: string | null
          created_at?: string | null
          description?: string | null
          hud_inspection_ready?: boolean | null
          id?: string
          investor_id?: string | null
          neighborhood_info?: Json | null
          organization_id?: string
          pet_policy?: string | null
          property_type?: string | null
          section_8_accepted?: boolean | null
          state?: string
          updated_at?: string | null
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_groups_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          referral_channel: string | null
          referral_code: string
          referral_message_sent_at: string | null
          referred_email: string | null
          referred_lead_id: string | null
          referred_name: string | null
          referred_phone: string
          referrer_lead_id: string
          referrer_name: string | null
          referrer_phone: string | null
          reward_amount: number | null
          reward_paid_at: string | null
          reward_type: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          referral_channel?: string | null
          referral_code: string
          referral_message_sent_at?: string | null
          referred_email?: string | null
          referred_lead_id?: string | null
          referred_name?: string | null
          referred_phone: string
          referrer_lead_id: string
          referrer_name?: string | null
          referrer_phone?: string | null
          reward_amount?: number | null
          reward_paid_at?: string | null
          reward_type?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          referral_channel?: string | null
          referral_code?: string
          referral_message_sent_at?: string | null
          referred_email?: string | null
          referred_lead_id?: string | null
          referred_name?: string | null
          referred_phone?: string
          referrer_lead_id?: string
          referrer_name?: string | null
          referrer_phone?: string | null
          reward_amount?: number | null
          reward_paid_at?: string | null
          reward_type?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_lead_id_fkey"
            columns: ["referred_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_lead_id_fkey"
            columns: ["referrer_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_benchmarks: {
        Row: {
          ai_model: string | null
          ai_summary: string | null
          analyzed_at: string | null
          created_at: string | null
          id: string
          market_avg_rent: number | null
          market_high: number | null
          market_low: number | null
          organization_id: string
          our_rent: number | null
          property_id: string
          radius_miles: number | null
          sample_size: number | null
        }
        Insert: {
          ai_model?: string | null
          ai_summary?: string | null
          analyzed_at?: string | null
          created_at?: string | null
          id?: string
          market_avg_rent?: number | null
          market_high?: number | null
          market_low?: number | null
          organization_id: string
          our_rent?: number | null
          property_id: string
          radius_miles?: number | null
          sample_size?: number | null
        }
        Update: {
          ai_model?: string | null
          ai_summary?: string | null
          analyzed_at?: string | null
          created_at?: string | null
          id?: string
          market_avg_rent?: number | null
          market_high?: number | null
          market_low?: number | null
          organization_id?: string
          our_rent?: number | null
          property_id?: string
          radius_miles?: number | null
          sample_size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rent_benchmarks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_benchmarks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_benchmarks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      rental_registrations: {
        Row: {
          created_at: string | null
          document_url: string | null
          expiration_date: string | null
          fee_amount: number | null
          id: string
          jurisdiction: string
          notes: string | null
          property_id: string
          registration_date: string | null
          registration_number: string | null
          renewal_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          document_url?: string | null
          expiration_date?: string | null
          fee_amount?: number | null
          id?: string
          jurisdiction?: string
          notes?: string | null
          property_id: string
          registration_date?: string | null
          registration_number?: string | null
          renewal_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          document_url?: string | null
          expiration_date?: string | null
          fee_amount?: number | null
          id?: string
          jurisdiction?: string
          notes?: string | null
          property_id?: string
          registration_date?: string | null
          registration_number?: string | null
          renewal_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_registrations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_registrations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      report_favorites: {
        Row: {
          created_at: string | null
          id: string
          report_key: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          report_key: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          report_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      section8_requests: {
        Row: {
          agency: string
          bedrooms: number
          created_at: string | null
          email: string
          full_name: string
          id: string
          notes: string | null
          phone: string
          status: string
        }
        Insert: {
          agency: string
          bedrooms: number
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          notes?: string | null
          phone: string
          status?: string
        }
        Update: {
          agency?: string
          bedrooms?: number
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string
          status?: string
        }
        Relationships: []
      }
      showing_available_slots: {
        Row: {
          booked_at: string | null
          booked_showing_id: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number
          id: string
          is_booked: boolean
          is_enabled: boolean
          organization_id: string
          property_id: string
          slot_date: string
          slot_time: string
          updated_at: string | null
        }
        Insert: {
          booked_at?: string | null
          booked_showing_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number
          id?: string
          is_booked?: boolean
          is_enabled?: boolean
          organization_id: string
          property_id: string
          slot_date: string
          slot_time: string
          updated_at?: string | null
        }
        Update: {
          booked_at?: string | null
          booked_showing_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number
          id?: string
          is_booked?: boolean
          is_enabled?: boolean
          organization_id?: string
          property_id?: string
          slot_date?: string
          slot_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "showing_available_slots_booked_showing_id_fkey"
            columns: ["booked_showing_id"]
            isOneToOne: false
            referencedRelation: "showings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showing_available_slots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showing_available_slots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showing_available_slots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      showings: {
        Row: {
          agent_report: string | null
          agent_report_photo_url: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmation_attempts: number | null
          confirmed_at: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          is_demo: boolean | null
          last_confirmation_attempt_at: string | null
          lead_id: string
          leasing_agent_id: string | null
          organization_id: string
          property_id: string
          prospect_interest_level: string | null
          rescheduled_to_id: string | null
          scheduled_at: string
          status: string
          updated_at: string | null
        }
        Insert: {
          agent_report?: string | null
          agent_report_photo_url?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmation_attempts?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_demo?: boolean | null
          last_confirmation_attempt_at?: string | null
          lead_id: string
          leasing_agent_id?: string | null
          organization_id: string
          property_id: string
          prospect_interest_level?: string | null
          rescheduled_to_id?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          agent_report?: string | null
          agent_report_photo_url?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmation_attempts?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_demo?: boolean | null
          last_confirmation_attempt_at?: string | null
          lead_id?: string
          leasing_agent_id?: string | null
          organization_id?: string
          property_id?: string
          prospect_interest_level?: string | null
          rescheduled_to_id?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "showings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showings_leasing_agent_id_fkey"
            columns: ["leasing_agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "showings_rescheduled_to_id_fkey"
            columns: ["rescheduled_to_id"]
            isOneToOne: false
            referencedRelation: "showings"
            referencedColumns: ["id"]
          },
        ]
      }
      statements: {
        Row: {
          comments: string | null
          created_at: string | null
          file_url: string
          id: string
          period: string
          property_id: string
          status: string | null
          uploaded_by: string | null
        }
        Insert: {
          comments?: string | null
          created_at?: string | null
          file_url: string
          id?: string
          period: string
          property_id: string
          status?: string | null
          uploaded_by?: string | null
        }
        Update: {
          comments?: string | null
          created_at?: string | null
          file_url?: string
          id?: string
          period?: string
          property_id?: string
          status?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "statements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          category: string
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          is_resolved: boolean | null
          level: string
          message: string
          notification_sent: boolean | null
          notification_sent_at: string | null
          organization_id: string | null
          related_call_id: string | null
          related_lead_id: string | null
          related_showing_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          is_resolved?: boolean | null
          level: string
          message: string
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          organization_id?: string | null
          related_call_id?: string | null
          related_lead_id?: string | null
          related_showing_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          is_resolved?: boolean | null
          level?: string
          message?: string
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          organization_id?: string | null
          related_call_id?: string | null
          related_lead_id?: string | null
          related_showing_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_related_call_id_fkey"
            columns: ["related_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_related_showing_id_fkey"
            columns: ["related_showing_id"]
            isOneToOne: false
            referencedRelation: "showings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          organization_id: string | null
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          organization_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          organization_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_permissions: {
        Row: {
          areas: string[]
          can_write: boolean
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          areas?: string[]
          can_write?: boolean
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          areas?: string[]
          can_write?: boolean
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          move_in_date: string | null
          move_out_date: string | null
          phone: string | null
          property_id: string
          status: string
          unit_number: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          move_in_date?: string | null
          move_out_date?: string | null
          phone?: string | null
          property_id: string
          status?: string
          unit_number?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          move_in_date?: string | null
          move_out_date?: string | null
          phone?: string | null
          property_id?: string
          status?: string
          unit_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string
          description: string
          id: string
          priority: string
          property_id: string | null
          status: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by: string
          description?: string
          id?: string
          priority?: string
          property_id?: string | null
          status?: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string
          description?: string
          id?: string
          priority?: string
          property_id?: string | null
          status?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string | null
          date: string
          description: string | null
          id: string
          lease_id: string | null
          property_id: string
          tenant_id: string | null
          type: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by?: string | null
          date: string
          description?: string | null
          id?: string
          lease_id?: string | null
          property_id: string
          tenant_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          lease_id?: string | null
          property_id?: string
          tenant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_analyses: {
        Row: {
          call_id: string
          competitor_mentions: Json | null
          created_at: string | null
          feature_requests: Json | null
          id: string
          lead_id: string | null
          location_feedback: Json | null
          loss_risk_level: string | null
          loss_risk_reasons: Json | null
          mentioned_timeline: string | null
          model_used: string | null
          objections: Json | null
          organization_id: string
          pricing_feedback: Json | null
          property_id: string | null
          raw_analysis: Json | null
          tokens_used: number | null
          wants_application: boolean | null
          wants_callback: boolean | null
          wants_showing: boolean | null
        }
        Insert: {
          call_id: string
          competitor_mentions?: Json | null
          created_at?: string | null
          feature_requests?: Json | null
          id?: string
          lead_id?: string | null
          location_feedback?: Json | null
          loss_risk_level?: string | null
          loss_risk_reasons?: Json | null
          mentioned_timeline?: string | null
          model_used?: string | null
          objections?: Json | null
          organization_id: string
          pricing_feedback?: Json | null
          property_id?: string | null
          raw_analysis?: Json | null
          tokens_used?: number | null
          wants_application?: boolean | null
          wants_callback?: boolean | null
          wants_showing?: boolean | null
        }
        Update: {
          call_id?: string
          competitor_mentions?: Json | null
          created_at?: string | null
          feature_requests?: Json | null
          id?: string
          lead_id?: string | null
          location_feedback?: Json | null
          loss_risk_level?: string | null
          loss_risk_reasons?: Json | null
          mentioned_timeline?: string | null
          model_used?: string | null
          objections?: Json | null
          organization_id?: string
          pricing_feedback?: Json | null
          property_id?: string | null
          raw_analysis?: Json | null
          tokens_used?: number | null
          wants_application?: boolean | null
          wants_callback?: boolean | null
          wants_showing?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "transcript_analyses_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_analyses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_analyses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_analyses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_analyses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      user_activity_log: {
        Row: {
          action: string
          category: string
          created_at: string | null
          description: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          organization_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          organization_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feature_toggles: {
        Row: {
          created_at: string | null
          feature_key: string
          id: string
          is_enabled: boolean
          organization_id: string
          reason: string | null
          toggled_at: string | null
          toggled_by: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean
          organization_id: string
          reason?: string | null
          toggled_at?: string | null
          toggled_by?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean
          organization_id?: string
          reason?: string | null
          toggled_at?: string | null
          toggled_by?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feature_toggles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feature_toggles_toggled_by_fkey"
            columns: ["toggled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feature_toggles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications_custom: {
        Row: {
          created_at: string | null
          delivery_method: string[]
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          is_read: boolean | null
          message: string
          organization_id: string
          priority: string
          read_at: string | null
          recipient_user_id: string
          sent_by: string
          sms_sent: boolean | null
          sms_sent_at: string | null
          subject: string
        }
        Insert: {
          created_at?: string | null
          delivery_method?: string[]
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          organization_id: string
          priority?: string
          read_at?: string | null
          recipient_user_id: string
          sent_by: string
          sms_sent?: boolean | null
          sms_sent_at?: string | null
          subject: string
        }
        Update: {
          created_at?: string | null
          delivery_method?: string[]
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          organization_id?: string
          priority?: string
          read_at?: string | null
          recipient_user_id?: string
          sent_by?: string
          sms_sent?: boolean | null
          sms_sent_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_custom_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_custom_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_custom_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string | null
          auth_user_id: string | null
          avatar_url: string | null
          commission_rate: number | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          invite_accepted_at: string | null
          invited_at: string | null
          invited_by: string | null
          is_active: boolean | null
          last_login_at: string | null
          organization_id: string | null
          password_changed_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
        }
        Insert: {
          auth_id?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          invite_accepted_at?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          last_login_at?: string | null
          organization_id?: string | null
          password_changed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Update: {
          auth_id?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          invite_accepted_at?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          last_login_at?: string | null
          organization_id?: string | null
          password_changed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      utilities: {
        Row: {
          account_holder: string
          account_number: string | null
          created_at: string | null
          id: string
          last_verified_at: string | null
          monthly_estimate: number | null
          notes: string | null
          property_id: string
          provider: string | null
          status: string
          updated_at: string | null
          utility_type: string
        }
        Insert: {
          account_holder?: string
          account_number?: string | null
          created_at?: string | null
          id?: string
          last_verified_at?: string | null
          monthly_estimate?: number | null
          notes?: string | null
          property_id: string
          provider?: string | null
          status?: string
          updated_at?: string | null
          utility_type: string
        }
        Update: {
          account_holder?: string
          account_number?: string | null
          created_at?: string | null
          id?: string
          last_verified_at?: string | null
          monthly_estimate?: number | null
          notes?: string | null
          property_id?: string
          provider?: string | null
          status?: string
          updated_at?: string | null
          utility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "utilities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utilities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
      work_order_files: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          uploaded_by: string | null
          work_order_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          uploaded_by?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_files_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string
          evidence_uploaded_at: string | null
          id: string
          priority: string
          property_id: string
          resolution_notes: string | null
          status: string
          title: string
          vendor_name: string | null
          vendor_phone: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string
          evidence_uploaded_at?: string | null
          id?: string
          priority?: string
          property_id: string
          resolution_notes?: string | null
          status?: string
          title: string
          vendor_name?: string | null
          vendor_phone?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string
          evidence_uploaded_at?: string | null
          id?: string
          priority?: string
          property_id?: string
          resolution_notes?: string | null
          status?: string
          title?: string
          vendor_name?: string | null
          vendor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_performance"
            referencedColumns: ["property_id"]
          },
        ]
      }
    }
    Views: {
      property_performance: {
        Row: {
          active_leads: number | null
          address: string | null
          avg_lead_score: number | null
          city: string | null
          days_on_market: number | null
          investor_id: string | null
          lead_to_showing_rate: number | null
          listed_date: string | null
          organization_id: string | null
          photos: Json | null
          property_id: string | null
          rent_price: number | null
          showing_completion_rate: number | null
          showings_completed: number | null
          showings_no_show: number | null
          showings_scheduled: number | null
          status: string | null
          total_leads: number | null
          unit_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      build_campaign_audience: {
        Args: { p_criteria: Json; p_organization_id: string }
        Returns: {
          email: string
          lead_id: string
          lead_name: string
          lead_score: number
          phone: string
        }[]
      }
      can_manage_property_photos: {
        Args: { _auth_user_id: string }
        Returns: boolean
      }
      check_coming_soon_expiring: { Args: never; Returns: number }
      claim_pending_tasks: {
        Args: { p_batch_size?: number; p_organization_id: string }
        Returns: {
          action_type: string
          agent_type: string
          attempt_number: number | null
          completed_at: string | null
          context: Json | null
          created_at: string | null
          executed_at: string | null
          id: string
          lead_id: string
          max_attempts: number | null
          organization_id: string
          pause_reason: string | null
          paused_at: string | null
          paused_by: string | null
          result_call_id: string | null
          result_communication_id: string | null
          scheduled_for: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_queued_emails: {
        Args: { p_batch_size?: number; p_organization_id: string }
        Returns: {
          communication_id: string | null
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          lead_id: string | null
          organization_id: string | null
          recipient_email: string | null
          resend_email_id: string | null
          subject: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      count_complete_leads_today: {
        Args: { p_organization_id: string }
        Returns: number
      }
      count_leads_today: {
        Args: { p_organization_id: string }
        Returns: number
      }
      create_default_feature_toggles: {
        Args: {
          p_created_by: string
          p_organization_id: string
          p_role: string
          p_user_id: string
        }
        Returns: undefined
      }
      execute_agent_task_now: {
        Args: { p_executed_by: string; p_task_id: string }
        Returns: Json
      }
      format_lead_for_sheets: { Args: { p_lead_id: string }; Returns: Json }
      get_cron_jobs: {
        Args: never
        Returns: {
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_lead_full_context: { Args: { p_lead_id: string }; Returns: Json }
      get_lead_funnel: {
        Args: { _date_from?: string; _date_to?: string }
        Returns: Json
      }
      get_org_setting: {
        Args: { p_default?: Json; p_key: string; p_organization_id: string }
        Returns: Json
      }
      get_property_performance: {
        Args: {
          p_end_date: string
          p_organization_id: string
          p_property_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_source_performance: { Args: { _days?: number }; Returns: Json }
      get_user_id: { Args: { _auth_user_id: string }; Returns: string }
      get_user_internal_id: { Args: never; Returns: string }
      get_user_org_id: { Args: never; Returns: string }
      get_user_organization_id: {
        Args: { _auth_user_id: string }
        Returns: string
      }
      get_user_role:
        | { Args: never; Returns: Database["public"]["Enums"]["app_role"] }
        | {
            Args: { _auth_user_id: string }
            Returns: Database["public"]["Enums"]["app_role"]
          }
      get_zip_code_analytics: { Args: { _days?: number }; Returns: Json }
      habakkuk_check_alerts: { Args: never; Returns: Json }
      handle_sms_opt_out: {
        Args: { p_keyword: string; p_organization_id: string; p_phone: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _auth_user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_editor_or_above: { Args: never; Returns: boolean }
      is_super_admin: { Args: { _auth_user_id: string }; Returns: boolean }
      joseph_compliance_check: {
        Args: {
          p_action_type: string
          p_agent_key?: string
          p_lead_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      log_agent_activity: {
        Args: {
          p_action: string
          p_agent_key: string
          p_call_id?: string
          p_cost?: number
          p_details?: Json
          p_execution_ms?: number
          p_lead_id?: string
          p_message: string
          p_organization_id: string
          p_property_id?: string
          p_showing_id?: string
          p_status: string
          p_task_id?: string
        }
        Returns: string
      }
      log_agent_execution: {
        Args: {
          p_agent_key: string
          p_execution_ms?: number
          p_organization_id: string
          p_success: boolean
        }
        Returns: undefined
      }
      log_score_change: {
        Args: {
          _change_amount: number
          _changed_by_agent?: string
          _changed_by_user_id?: string
          _lead_id: string
          _reason_code: string
          _reason_text: string
          _related_call_id?: string
          _related_showing_id?: string
          _triggered_by: string
        }
        Returns: number
      }
      log_user_activity: {
        Args: {
          p_action: string
          p_category: string
          p_description?: string
          p_ip_address?: string
          p_metadata?: Json
          p_user_id: string
        }
        Returns: string
      }
      map_doorloop_status: {
        Args: { doorloop_status: string }
        Returns: string
      }
      merge_leads: {
        Args: {
          p_field_overrides?: Json
          p_loser_id: string
          p_merged_by_user_id?: string
          p_winner_id: string
        }
        Returns: Json
      }
      pause_lead_agent_tasks: {
        Args: { _lead_id: string; _reason: string; _user_id: string }
        Returns: number
      }
      rebekah_find_alternatives: {
        Args: {
          p_lead_id?: string
          p_limit?: number
          p_organization_id: string
          p_property_id: string
        }
        Returns: Json
      }
      rebekah_match_properties: {
        Args: {
          p_exclude_property_id?: string
          p_lead_id?: string
          p_limit?: number
          p_max_rent?: number
          p_min_bedrooms?: number
          p_min_rent?: number
          p_organization_id: string
          p_property_type?: string
          p_section_8?: boolean
          p_zip_codes?: string[]
        }
        Returns: Json
      }
      recalculate_lead_scores: {
        Args: never
        Returns: {
          leads_checked: number
          leads_updated: number
        }[]
      }
      reset_agent_daily_counters: { Args: never; Returns: undefined }
      schedule_conversion_predictions: { Args: never; Returns: number }
      schedule_next_recapture: {
        Args: {
          p_current_attempt: number
          p_lead_id: string
          p_organization_id: string
          p_task_id?: string
        }
        Returns: string
      }
      schedule_showing_confirmations: { Args: never; Returns: number }
      schedule_stale_leads_for_recapture: { Args: never; Returns: number }
      seed_agents_for_organization: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      sync_cost_data: { Args: never; Returns: Json }
      unstick_processing_emails: { Args: never; Returns: undefined }
      user_has_property_access: {
        Args: { _auth_user_id: string; _property_id: string }
        Returns: boolean
      }
      zacchaeus_record_cost: {
        Args: {
          p_call_id?: string
          p_communication_id?: string
          p_lead_id?: string
          p_organization_id: string
          p_service: string
          p_total_cost: number
          p_unit_cost: number
          p_usage_quantity: number
          p_usage_unit: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "editor" | "viewer" | "leasing_agent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "editor", "viewer", "leasing_agent"],
    },
  },
} as const
