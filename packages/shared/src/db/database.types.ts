
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "diary_entries": {
                  Row: {
                    "attended_on": string,"created_at": string,"discipline": string | null,"event_id": string,"event_slug": string,"event_title": string,"id": string,"occurrence_id": string | null,"rating": number | null,"review": string | null,"updated_at": string,"user_id": string,"venue_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attended_on": string,"created_at"?: string,"discipline"?: string | null,"event_id": string,"event_slug": string,"event_title": string,"id"?: string,"occurrence_id"?: string | null,"rating"?: number | null,"review"?: string | null,"updated_at"?: string,"user_id": string,"venue_name"?: string | null
                  }
                  Update: {
                    "attended_on"?: string,"created_at"?: string,"discipline"?: string | null,"event_id"?: string,"event_slug"?: string,"event_title"?: string,"id"?: string,"occurrence_id"?: string | null,"rating"?: number | null,"review"?: string | null,"updated_at"?: string,"user_id"?: string,"venue_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "diary_entries_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "diary_entries_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "diary_entries_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "diary_entries_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "v_occurrences_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "diary_entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"disciplines": {
                  Row: {
                    "fallback_image_key": string,"label_es": string,"selectable": boolean,"short_label_es": string,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "fallback_image_key": string,"label_es": string,"selectable"?: boolean,"short_label_es": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "fallback_image_key"?: string,"label_es"?: string,"selectable"?: boolean,"short_label_es"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"event_changes": {
                  Row: {
                    "detected_at": string,"event_id": string,"field": string | null,"id": number,"new_value": Json | null,"occurrence_id": string | null,"old_value": Json | null,"run_id": string | null,"severity": Database["public"]['Enums']["change_severity"],"type": Database["public"]['Enums']["change_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "detected_at"?: string,"event_id": string,"field"?: string | null,"id"?: never,"new_value"?: Json | null,"occurrence_id"?: string | null,"old_value"?: Json | null,"run_id"?: string | null,"severity": Database["public"]['Enums']["change_severity"],"type": Database["public"]['Enums']["change_type"]
                  }
                  Update: {
                    "detected_at"?: string,"event_id"?: string,"field"?: string | null,"id"?: never,"new_value"?: Json | null,"occurrence_id"?: string | null,"old_value"?: Json | null,"run_id"?: string | null,"severity"?: Database["public"]['Enums']["change_severity"],"type"?: Database["public"]['Enums']["change_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_changes_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_changes_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_changes_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_changes_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "v_occurrences_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_changes_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "ingestion_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"event_disciplines": {
                  Row: {
                    "discipline": string,"event_id": string,"is_primary": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "discipline": string,"event_id": string,"is_primary"?: boolean
                  }
                  Update: {
                    "discipline"?: string,"event_id"?: string,"is_primary"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_disciplines_discipline_fkey"
      columns: ["discipline"]
isOneToOne: false
      referencedRelation: "disciplines"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "event_disciplines_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_disciplines_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    }
                  ]
                },"event_duplicates": {
                  Row: {
                    "candidate_event_id": string,"created_at": string,"event_id": string,"resolved_at": string | null,"score": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_event_id": string,"created_at"?: string,"event_id": string,"resolved_at"?: string | null,"score": number,"status"?: string
                  }
                  Update: {
                    "candidate_event_id"?: string,"created_at"?: string,"event_id"?: string,"resolved_at"?: string | null,"score"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_duplicates_candidate_event_id_fkey"
      columns: ["candidate_event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_duplicates_candidate_event_id_fkey"
      columns: ["candidate_event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_duplicates_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_duplicates_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    }
                  ]
                },"event_stats": {
                  Row: {
                    "attending_count": number,"event_id": string,"recommend_count": number,"save_count": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attending_count"?: number,"event_id": string,"recommend_count"?: number,"save_count"?: number,"updated_at"?: string
                  }
                  Update: {
                    "attending_count"?: number,"event_id"?: string,"recommend_count"?: number,"save_count"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_stats_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_stats_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "age_rating": string | null,"ai_summary": string | null,"ai_summary_generated_at": string | null,"ai_summary_model": string | null,"ai_summary_source_hash": string | null,"candidate_reasons": (string)[],"created_at": string,"dedup_key": string,"default_venue_id": string | null,"description": string | null,"description_attribution": string | null,"description_html": string | null,"duration_minutes": number | null,"first_published_at": string | null,"id": string,"image_credit": string | null,"image_source": Database["public"]['Enums']["image_source"],"image_url": string | null,"institution_id": string,"is_free": boolean | null,"language": string | null,"last_verified_at": string | null,"merged_into_event_id": string | null,"official_url": string | null,"price_text": string | null,"price_verified": boolean,"primary_discipline": string | null,"primary_source_id": string | null,"review_notes": string | null,"search_tsv": unknown,"slug": string,"status": Database["public"]['Enums']["event_status"],"subtitle": string | null,"tags": (string)[],"tickets_url": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "age_rating"?: string | null,"ai_summary"?: string | null,"ai_summary_generated_at"?: string | null,"ai_summary_model"?: string | null,"ai_summary_source_hash"?: string | null,"candidate_reasons"?: (string)[],"created_at"?: string,"dedup_key": string,"default_venue_id"?: string | null,"description"?: string | null,"description_attribution"?: string | null,"description_html"?: string | null,"duration_minutes"?: number | null,"first_published_at"?: string | null,"id"?: string,"image_credit"?: string | null,"image_source"?: Database["public"]['Enums']["image_source"],"image_url"?: string | null,"institution_id": string,"is_free"?: boolean | null,"language"?: string | null,"last_verified_at"?: string | null,"merged_into_event_id"?: string | null,"official_url"?: string | null,"price_text"?: string | null,"price_verified"?: boolean,"primary_discipline"?: string | null,"primary_source_id"?: string | null,"review_notes"?: string | null,"search_tsv"?: never,"slug": string,"status"?: Database["public"]['Enums']["event_status"],"subtitle"?: string | null,"tags"?: (string)[],"tickets_url"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "age_rating"?: string | null,"ai_summary"?: string | null,"ai_summary_generated_at"?: string | null,"ai_summary_model"?: string | null,"ai_summary_source_hash"?: string | null,"candidate_reasons"?: (string)[],"created_at"?: string,"dedup_key"?: string,"default_venue_id"?: string | null,"description"?: string | null,"description_attribution"?: string | null,"description_html"?: string | null,"duration_minutes"?: number | null,"first_published_at"?: string | null,"id"?: string,"image_credit"?: string | null,"image_source"?: Database["public"]['Enums']["image_source"],"image_url"?: string | null,"institution_id"?: string,"is_free"?: boolean | null,"language"?: string | null,"last_verified_at"?: string | null,"merged_into_event_id"?: string | null,"official_url"?: string | null,"price_text"?: string | null,"price_verified"?: boolean,"primary_discipline"?: string | null,"primary_source_id"?: string | null,"review_notes"?: string | null,"search_tsv"?: never,"slug"?: string,"status"?: Database["public"]['Enums']["event_status"],"subtitle"?: string | null,"tags"?: (string)[],"tickets_url"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_default_venue_id_fkey"
      columns: ["default_venue_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["venue_id"]
    },{
      foreignKeyName: "events_default_venue_id_fkey"
      columns: ["default_venue_id"]
isOneToOne: false
      referencedRelation: "v_occurrences_public"
      referencedColumns: ["venue_id"]
    },{
      foreignKeyName: "events_default_venue_id_fkey"
      columns: ["default_venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "institutions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["institution_id"]
    },{
      foreignKeyName: "events_merged_into_event_id_fkey"
      columns: ["merged_into_event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_merged_into_event_id_fkey"
      columns: ["merged_into_event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_primary_discipline_fkey"
      columns: ["primary_discipline"]
isOneToOne: false
      referencedRelation: "disciplines"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "events_primary_source_id_fkey"
      columns: ["primary_source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"ingestion_runs": {
                  Row: {
                    "error_message": string | null,"finished_at": string | null,"fixture_set": string | null,"git_sha": string | null,"id": string,"source_id": string,"started_at": string,"stats": NonNullable<Json>,"status": Database["public"]['Enums']["run_status"],"trigger": Database["public"]['Enums']["run_trigger"],"warnings": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "error_message"?: string | null,"finished_at"?: string | null,"fixture_set"?: string | null,"git_sha"?: string | null,"id"?: string,"source_id": string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["run_status"],"trigger": Database["public"]['Enums']["run_trigger"],"warnings"?: (string)[]
                  }
                  Update: {
                    "error_message"?: string | null,"finished_at"?: string | null,"fixture_set"?: string | null,"git_sha"?: string | null,"id"?: string,"source_id"?: string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["run_status"],"trigger"?: Database["public"]['Enums']["run_trigger"],"warnings"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingestion_runs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"institutions": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"slug": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"slug": string,"website_url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "change_id": number | null,"created_at": string,"dedupe_key": string,"error": string | null,"event_id": string | null,"expo_receipt": Json | null,"expo_ticket_id": string | null,"id": string,"kind": Database["public"]['Enums']["notification_kind"],"occurrence_id": string | null,"payload": NonNullable<Json>,"scheduled_for": string,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "change_id"?: number | null,"created_at"?: string,"dedupe_key": string,"error"?: string | null,"event_id"?: string | null,"expo_receipt"?: Json | null,"expo_ticket_id"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["notification_kind"],"occurrence_id"?: string | null,"payload"?: NonNullable<Json>,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"user_id": string
                  }
                  Update: {
                    "change_id"?: number | null,"created_at"?: string,"dedupe_key"?: string,"error"?: string | null,"event_id"?: string | null,"expo_receipt"?: Json | null,"expo_ticket_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["notification_kind"],"occurrence_id"?: string | null,"payload"?: NonNullable<Json>,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_change_id_fkey"
      columns: ["change_id"]
isOneToOne: false
      referencedRelation: "event_changes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "v_occurrences_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"occurrences": {
                  Row: {
                    "consecutive_misses": number,"created_at": string,"end_date": string,"ends_at": string | null,"event_id": string,"external_id": string | null,"first_seen_at": string,"id": string,"is_all_day": boolean,"is_free": boolean | null,"kind": Database["public"]['Enums']["occurrence_kind"],"last_seen_at": string,"missing_since": string | null,"previous_starts_at": string | null,"price_max": number | null,"price_min": number | null,"price_text": string | null,"price_verified": boolean,"recurrence_rule": string | null,"room": string | null,"schedule_text": string | null,"source_id": string | null,"source_record_id": string | null,"start_date": string,"starts_at": string,"status": Database["public"]['Enums']["occurrence_status"],"status_reason": string | null,"tickets_url": string | null,"updated_at": string,"venue_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consecutive_misses"?: number,"created_at"?: string,"end_date": string,"ends_at"?: string | null,"event_id": string,"external_id"?: string | null,"first_seen_at"?: string,"id"?: string,"is_all_day"?: boolean,"is_free"?: boolean | null,"kind": Database["public"]['Enums']["occurrence_kind"],"last_seen_at"?: string,"missing_since"?: string | null,"previous_starts_at"?: string | null,"price_max"?: number | null,"price_min"?: number | null,"price_text"?: string | null,"price_verified"?: boolean,"recurrence_rule"?: string | null,"room"?: string | null,"schedule_text"?: string | null,"source_id"?: string | null,"source_record_id"?: string | null,"start_date": string,"starts_at": string,"status"?: Database["public"]['Enums']["occurrence_status"],"status_reason"?: string | null,"tickets_url"?: string | null,"updated_at"?: string,"venue_id"?: string | null
                  }
                  Update: {
                    "consecutive_misses"?: number,"created_at"?: string,"end_date"?: string,"ends_at"?: string | null,"event_id"?: string,"external_id"?: string | null,"first_seen_at"?: string,"id"?: string,"is_all_day"?: boolean,"is_free"?: boolean | null,"kind"?: Database["public"]['Enums']["occurrence_kind"],"last_seen_at"?: string,"missing_since"?: string | null,"previous_starts_at"?: string | null,"price_max"?: number | null,"price_min"?: number | null,"price_text"?: string | null,"price_verified"?: boolean,"recurrence_rule"?: string | null,"room"?: string | null,"schedule_text"?: string | null,"source_id"?: string | null,"source_record_id"?: string | null,"start_date"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["occurrence_status"],"status_reason"?: string | null,"tickets_url"?: string | null,"updated_at"?: string,"venue_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "occurrences_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "occurrences_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "occurrences_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "occurrences_source_record_id_fkey"
      columns: ["source_record_id"]
isOneToOne: false
      referencedRelation: "source_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "occurrences_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["venue_id"]
    },{
      foreignKeyName: "occurrences_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "v_occurrences_public"
      referencedColumns: ["venue_id"]
    },{
      foreignKeyName: "occurrences_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"is_anonymous": boolean,"locale": string,"onboarding_completed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string,"is_anonymous"?: boolean,"locale"?: string,"onboarding_completed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"is_anonymous"?: boolean,"locale"?: string,"onboarding_completed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reminders": {
                  Row: {
                    "created_at": string,"notification_id": string | null,"occurrence_id": string,"remind_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"notification_id"?: string | null,"occurrence_id": string,"remind_at": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"notification_id"?: string | null,"occurrence_id"?: string,"remind_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminders_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminders_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "v_occurrences_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminders_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"source_records": {
                  Row: {
                    "captured_at": string,"consecutive_misses": number,"content_hash": string | null,"created_at": string,"event_id": string | null,"external_id": string,"first_seen_at": string,"id": string,"last_changed_at": string | null,"last_run_id": string | null,"last_seen_at": string,"missing_fields": (string)[],"missing_since": string | null,"normalized": Json | null,"parse_status": Database["public"]['Enums']["parse_status"],"raw_payload": Json | null,"source_id": string,"updated_at": string,"url": string,"validation_errors": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "captured_at": string,"consecutive_misses"?: number,"content_hash"?: string | null,"created_at"?: string,"event_id"?: string | null,"external_id": string,"first_seen_at"?: string,"id"?: string,"last_changed_at"?: string | null,"last_run_id"?: string | null,"last_seen_at"?: string,"missing_fields"?: (string)[],"missing_since"?: string | null,"normalized"?: Json | null,"parse_status": Database["public"]['Enums']["parse_status"],"raw_payload"?: Json | null,"source_id": string,"updated_at"?: string,"url": string,"validation_errors"?: Json | null
                  }
                  Update: {
                    "captured_at"?: string,"consecutive_misses"?: number,"content_hash"?: string | null,"created_at"?: string,"event_id"?: string | null,"external_id"?: string,"first_seen_at"?: string,"id"?: string,"last_changed_at"?: string | null,"last_run_id"?: string | null,"last_seen_at"?: string,"missing_fields"?: (string)[],"missing_since"?: string | null,"normalized"?: Json | null,"parse_status"?: Database["public"]['Enums']["parse_status"],"raw_payload"?: Json | null,"source_id"?: string,"updated_at"?: string,"url"?: string,"validation_errors"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_records_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_records_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_records_last_run_id_fkey"
      columns: ["last_run_id"]
isOneToOne: false
      referencedRelation: "ingestion_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_records_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "base_url": string,"config": NonNullable<Json>,"created_at": string,"enabled": boolean,"id": string,"institution_id": string | null,"kind": Database["public"]['Enums']["source_kind"],"name": string,"priority": number,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_url": string,"config"?: NonNullable<Json>,"created_at"?: string,"enabled"?: boolean,"id"?: string,"institution_id"?: string | null,"kind": Database["public"]['Enums']["source_kind"],"name": string,"priority"?: number,"slug": string
                  }
                  Update: {
                    "base_url"?: string,"config"?: NonNullable<Json>,"created_at"?: string,"enabled"?: boolean,"id"?: string,"institution_id"?: string | null,"kind"?: Database["public"]['Enums']["source_kind"],"name"?: string,"priority"?: number,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sources_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "institutions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sources_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["institution_id"]
    }
                  ]
                },"user_devices": {
                  Row: {
                    "app_version": string | null,"created_at": string,"expo_push_token": string,"id": string,"last_seen_at": string,"notifications_enabled": boolean,"platform": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"created_at"?: string,"expo_push_token": string,"id"?: string,"last_seen_at"?: string,"notifications_enabled"?: boolean,"platform": string,"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"created_at"?: string,"expo_push_token"?: string,"id"?: string,"last_seen_at"?: string,"notifications_enabled"?: boolean,"platform"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_devices_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_event_actions": {
                  Row: {
                    "action": Database["public"]['Enums']["user_action"],"created_at": string,"event_id": string,"id": string,"occurrence_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["user_action"],"created_at"?: string,"event_id": string,"id"?: string,"occurrence_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["user_action"],"created_at"?: string,"event_id"?: string,"id"?: string,"occurrence_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_event_actions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_event_actions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_event_actions_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_event_actions_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "v_occurrences_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_event_actions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_interests": {
                  Row: {
                    "created_at": string,"discipline": string,"user_id": string,"weight": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"discipline": string,"user_id": string,"weight"?: number
                  }
                  Update: {
                    "created_at"?: string,"discipline"?: string,"user_id"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_interests_discipline_fkey"
      columns: ["discipline"]
isOneToOne: false
      referencedRelation: "disciplines"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "user_interests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_notification_prefs": {
                  Row: {
                    "digest_enabled": boolean,"digest_hour_local": number,"instant_changes": boolean,"muted_disciplines": (string)[],"reminders_enabled": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "digest_enabled"?: boolean,"digest_hour_local"?: number,"instant_changes"?: boolean,"muted_disciplines"?: (string)[],"reminders_enabled"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "digest_enabled"?: boolean,"digest_hour_local"?: number,"instant_changes"?: boolean,"muted_disciplines"?: (string)[],"reminders_enabled"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "address": string | null,"address_source_url": string | null,"address_verified_at": string | null,"city": string,"created_at": string,"id": string,"institution_id": string | null,"lat": number | null,"lng": number | null,"name": string,"neighborhood": string | null,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"address_source_url"?: string | null,"address_verified_at"?: string | null,"city"?: string,"created_at"?: string,"id"?: string,"institution_id"?: string | null,"lat"?: number | null,"lng"?: number | null,"name": string,"neighborhood"?: string | null,"slug": string
                  }
                  Update: {
                    "address"?: string | null,"address_source_url"?: string | null,"address_verified_at"?: string | null,"city"?: string,"created_at"?: string,"id"?: string,"institution_id"?: string | null,"lat"?: number | null,"lng"?: number | null,"name"?: string,"neighborhood"?: string | null,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venues_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "institutions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venues_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["institution_id"]
    }
                  ]
                }
          }
          Views: {
            "v_event_sources_public": {
                  Row: {
                    "event_id": string | null,"last_seen_at": string | null,"source_name": string | null,"source_slug": string | null,"source_url": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "source_records_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_records_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    }
                  ]
                },"v_events_public": {
                  Row: {
                    "age_rating": string | null,"ai_summary": string | null,"attending_count": number | null,"description": string | null,"description_attribution": string | null,"disciplines": (string)[] | null,"duration_minutes": number | null,"first_published_at": string | null,"id": string | null,"image_credit": string | null,"image_source": Database["public"]['Enums']["image_source"] | null,"image_url": string | null,"institution_id": string | null,"institution_name": string | null,"institution_slug": string | null,"is_free": boolean | null,"is_ongoing": boolean | null,"language": string | null,"last_ends_at": string | null,"last_verified_at": string | null,"next_ends_at": string | null,"next_kind": Database["public"]['Enums']["occurrence_kind"] | null,"next_starts_at": string | null,"official_url": string | null,"price_text": string | null,"price_verified": boolean | null,"primary_discipline": string | null,"recommend_count": number | null,"save_count": number | null,"search_tsv": unknown,"slug": string | null,"subtitle": string | null,"tags": (string)[] | null,"tickets_url": string | null,"title": string | null,"upcoming_count": number | null,"updated_at": string | null,"venue_address": string | null,"venue_id": string | null,"venue_lat": number | null,"venue_lng": number | null,"venue_name": string | null,"venue_neighborhood": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "events_primary_discipline_fkey"
      columns: ["primary_discipline"]
isOneToOne: false
      referencedRelation: "disciplines"
      referencedColumns: ["slug"]
    }
                  ]
                },"v_occurrences_public": {
                  Row: {
                    "disciplines": (string)[] | null,"end_date": string | null,"ends_at": string | null,"event_id": string | null,"event_slug": string | null,"event_title": string | null,"id": string | null,"image_source": Database["public"]['Enums']["image_source"] | null,"image_url": string | null,"institution_name": string | null,"is_all_day": boolean | null,"is_free": boolean | null,"kind": Database["public"]['Enums']["occurrence_kind"] | null,"previous_starts_at": string | null,"price_text": string | null,"price_verified": boolean | null,"primary_discipline": string | null,"room": string | null,"schedule_text": string | null,"start_date": string | null,"starts_at": string | null,"status": Database["public"]['Enums']["occurrence_status"] | null,"status_reason": string | null,"tickets_url": string | null,"venue_address": string | null,"venue_id": string | null,"venue_lat": number | null,"venue_lng": number | null,"venue_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "events_primary_discipline_fkey"
      columns: ["primary_discipline"]
isOneToOne: false
      referencedRelation: "disciplines"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "occurrences_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "occurrences_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_events_public"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "bump_event_stat":
{ Args: { "p_action": Database["public"]['Enums']["user_action"],"p_delta": number,"p_event_id": string }; Returns: undefined
                           },
"immutable_unaccent":
{ Args: { "": string }; Returns: string
                           }
          }
          Enums: {
            "change_severity": "major"|"minor","change_type": "event_created"|"event_published"|"event_suspended"|"event_reappeared"|"field_changed"|"occurrence_added"|"occurrence_rescheduled"|"occurrence_cancelled"|"occurrence_status_changed"|"occurrence_venue_changed"|"occurrence_missing"|"occurrence_reappeared","event_status": "candidate"|"published"|"suspended"|"archived"|"rejected","image_source": "source"|"fallback","notification_kind": "digest"|"new_match"|"event_changed"|"reminder","notification_status": "queued"|"sent"|"failed"|"skipped","occurrence_kind": "timed"|"all_day"|"range","occurrence_status": "scheduled"|"rescheduled"|"cancelled"|"postponed"|"sold_out"|"missing","parse_status": "ok"|"incomplete"|"invalid","run_status": "running"|"succeeded"|"partial"|"failed","run_trigger": "manual"|"cron"|"fixture","source_kind": "html"|"json_api"|"jsonld"|"rss"|"browser","user_action": "attending"|"recommend"|"save"
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
            "change_severity": ["major", "minor"],"change_type": ["event_created", "event_published", "event_suspended", "event_reappeared", "field_changed", "occurrence_added", "occurrence_rescheduled", "occurrence_cancelled", "occurrence_status_changed", "occurrence_venue_changed", "occurrence_missing", "occurrence_reappeared"],"event_status": ["candidate", "published", "suspended", "archived", "rejected"],"image_source": ["source", "fallback"],"notification_kind": ["digest", "new_match", "event_changed", "reminder"],"notification_status": ["queued", "sent", "failed", "skipped"],"occurrence_kind": ["timed", "all_day", "range"],"occurrence_status": ["scheduled", "rescheduled", "cancelled", "postponed", "sold_out", "missing"],"parse_status": ["ok", "incomplete", "invalid"],"run_status": ["running", "succeeded", "partial", "failed"],"run_trigger": ["manual", "cron", "fixture"],"source_kind": ["html", "json_api", "jsonld", "rss", "browser"],"user_action": ["attending", "recommend", "save"]
          }
        }
} as const
