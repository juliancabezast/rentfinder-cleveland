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
          delivered: boolean | null
          html_content: string
          id: string
          insights: Json | null
          investor_id: string
          metrics: Json
          narrative_summary: string | null
          opened: boolean | null
          organization_id: string
          period_month: number
          period_year: number
          property_ids: string[]
          resend_email_id: string | null
          sent_at: string | null
          status: string | null
          subject: string
        }
        Insert: {
          created_at?: string | null
          delivered?: boolean | null
          html_content: string
          id?: string
          insights?: Json | null
          investor_id: string
          metrics?: Json
          narrative_summary?: string | null
          opened?: boolean | null
          organization_id: string
          period_month: number
          period_year: number
          property_ids: string[]
          resend_email_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          created_at?: string | null
          delivered?: boolean | null
          html_content?: string
          id?: string
          insights?: Json | null
          investor_id?: string
          metrics?: Json
          narrative_summary?: string | null
          opened?: boolean | null
          organization_id?: string
          period_month?: number
          period_year?: number
          property_ids?: string[]
          resend_email_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
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
          phone: string
          phone_verified: boolean | null
          preferred_language: string | null
          priority_reason: string | null
          sms_consent: boolean | null
          sms_consent_at: string | null
          source: string
          source_detail: string | null
          status: string
          updated_at: string | null
          voucher_amount: number | null
          voucher_status: string | null
          whatsapp_consent: boolean | null
          whatsapp_consent_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
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
          phone: string
          phone_verified?: boolean | null
          preferred_language?: string | null
          priority_reason?: string | null
          sms_consent?: boolean | null
          sms_consent_at?: string | null
          source: string
          source_detail?: string | null
          status?: string
          updated_at?: string | null
          voucher_amount?: number | null
          voucher_status?: string | null
          whatsapp_consent?: boolean | null
          whatsapp_consent_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
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
          phone?: string
          phone_verified?: boolean | null
          preferred_language?: string | null
          priority_reason?: string | null
          sms_consent?: boolean | null
          sms_consent_at?: string | null
          source?: string
          source_detail?: string | null
          status?: string
          updated_at?: string | null
          voucher_amount?: number | null
          voucher_status?: string | null
          whatsapp_consent?: boolean | null
          whatsapp_consent_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
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
      organization_credentials: {
        Row: {
          bland_api_key: string | null
          created_at: string | null
          doorloop_api_key: string | null
          id: string
          openai_api_key: string | null
          organization_id: string
          persona_api_key: string | null
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
          openai_api_key?: string | null
          organization_id: string
          persona_api_key?: string | null
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
          openai_api_key?: string | null
          organization_id?: string
          persona_api_key?: string | null
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
          pet_policy: string | null
          photos: Json | null
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
          pet_policy?: string | null
          photos?: Json | null
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
          pet_policy?: string | null
          photos?: Json | null
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
      users: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          commission_rate: number | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
      can_manage_property_photos: {
        Args: { _auth_user_id: string }
        Returns: boolean
      }
      check_coming_soon_expiring: { Args: never; Returns: number }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_lead_funnel: {
        Args: { _date_from?: string; _date_to?: string }
        Returns: Json
      }
      get_source_performance: { Args: { _days?: number }; Returns: Json }
      get_user_id: { Args: { _auth_user_id: string }; Returns: string }
      get_user_organization_id: {
        Args: { _auth_user_id: string }
        Returns: string
      }
      get_user_role: {
        Args: { _auth_user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_zip_code_analytics: { Args: { _days?: number }; Returns: Json }
      has_role: {
        Args: {
          _auth_user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
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
      pause_lead_agent_tasks: {
        Args: { _lead_id: string; _reason: string; _user_id: string }
        Returns: number
      }
      reset_agent_daily_counters: { Args: never; Returns: undefined }
      seed_agents_for_organization: {
        Args: { p_org_id: string }
        Returns: undefined
      }
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
