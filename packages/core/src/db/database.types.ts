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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          id: string
          object_id: string | null
          object_type: string
          verb: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          object_id?: string | null
          object_type: string
          verb: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          object_id?: string | null
          object_type?: string
          verb?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_account_tokens: {
        Row: {
          access_token_enc: string
          ad_account_id: string
          key_version: number
          refresh_token_enc: string | null
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          ad_account_id: string
          key_version?: number
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          ad_account_id?: string
          key_version?: number
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_account_tokens_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: true
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_accounts: {
        Row: {
          connected_by: string | null
          created_at: string
          currency: string | null
          external_id: string
          id: string
          meta: Json
          name: string | null
          platform: string
          status: string
          status_detail: string | null
          timezone: string | null
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          connected_by?: string | null
          created_at?: string
          currency?: string | null
          external_id: string
          id?: string
          meta?: Json
          name?: string | null
          platform: string
          status?: string
          status_detail?: string | null
          timezone?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          connected_by?: string | null
          created_at?: string
          currency?: string | null
          external_id?: string
          id?: string
          meta?: Json
          name?: string | null
          platform?: string
          status?: string
          status_detail?: string | null
          timezone?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_blueprints: {
        Row: {
          analysis: Json
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          inspiration_ad_id: string | null
          job_id: string | null
          name: string
          product_id: string | null
          reference_asset_id: string | null
          script_id: string | null
          status: string
          structure: Json
          timeline_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          inspiration_ad_id?: string | null
          job_id?: string | null
          name: string
          product_id?: string | null
          reference_asset_id?: string | null
          script_id?: string | null
          status?: string
          structure?: Json
          timeline_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          inspiration_ad_id?: string | null
          job_id?: string | null
          name?: string
          product_id?: string | null
          reference_asset_id?: string | null
          script_id?: string | null
          status?: string
          structure?: Json
          timeline_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_blueprints_inspiration_ad_id_fkey"
            columns: ["inspiration_ad_id"]
            isOneToOne: false
            referencedRelation: "inspiration_ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_blueprints_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_blueprints_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_blueprints_reference_asset_id_fkey"
            columns: ["reference_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_blueprints_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_blueprints_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_blueprints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          ad_account_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          daily_budget: number
          error: string | null
          external_adset_id: string | null
          external_campaign_id: string | null
          id: string
          launched_at: string | null
          name: string
          objective: string
          status: string
          targeting: Json
          updated_at: string
          variant_batch_id: string | null
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          daily_budget: number
          error?: string | null
          external_adset_id?: string | null
          external_campaign_id?: string | null
          id?: string
          launched_at?: string | null
          name: string
          objective: string
          status?: string
          targeting?: Json
          updated_at?: string
          variant_batch_id?: string | null
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          daily_budget?: number
          error?: string | null
          external_adset_id?: string | null
          external_campaign_id?: string | null
          id?: string
          launched_at?: string | null
          name?: string
          objective?: string
          status?: string
          targeting?: Json
          updated_at?: string
          variant_batch_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_variant_batch_id_fkey"
            columns: ["variant_batch_id"]
            isOneToOne: false
            referencedRelation: "variant_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_metrics: {
        Row: {
          ad_id: string
          captured_at: string
          clicks: number | null
          conversions: number | null
          cpa: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          date_start: string | null
          id: string
          impressions: number | null
          raw: Json
          roas: number | null
          spend: number | null
          thruplays: number | null
          video_views: number | null
          workspace_id: string
        }
        Insert: {
          ad_id: string
          captured_at?: string
          clicks?: number | null
          conversions?: number | null
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          date_start?: string | null
          id?: string
          impressions?: number | null
          raw?: Json
          roas?: number | null
          spend?: number | null
          thruplays?: number | null
          video_views?: number | null
          workspace_id: string
        }
        Update: {
          ad_id?: string
          captured_at?: string
          clicks?: number | null
          conversions?: number | null
          cpa?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          date_start?: string | null
          id?: string
          impressions?: number | null
          raw?: Json
          roas?: number | null
          spend?: number | null
          thruplays?: number | null
          video_views?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_metrics_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          asset_id: string | null
          campaign_id: string
          created_at: string
          cta: string | null
          error: string | null
          external_ad_id: string | null
          external_creative_id: string | null
          external_video_id: string | null
          headline: string | null
          id: string
          is_winner: boolean
          landing_url: string | null
          metrics: Json
          metrics_updated_at: string | null
          primary_text: string | null
          review_status: string | null
          status: string
          updated_at: string
          variant_label: string | null
          workspace_id: string
        }
        Insert: {
          asset_id?: string | null
          campaign_id: string
          created_at?: string
          cta?: string | null
          error?: string | null
          external_ad_id?: string | null
          external_creative_id?: string | null
          external_video_id?: string | null
          headline?: string | null
          id?: string
          is_winner?: boolean
          landing_url?: string | null
          metrics?: Json
          metrics_updated_at?: string | null
          primary_text?: string | null
          review_status?: string | null
          status?: string
          updated_at?: string
          variant_label?: string | null
          workspace_id: string
        }
        Update: {
          asset_id?: string | null
          campaign_id?: string
          created_at?: string
          cta?: string | null
          error?: string | null
          external_ad_id?: string | null
          external_creative_id?: string | null
          external_video_id?: string | null
          headline?: string | null
          id?: string
          is_winner?: boolean
          landing_url?: string | null
          metrics?: Json
          metrics_updated_at?: string | null
          primary_text?: string | null
          review_status?: string | null
          status?: string
          updated_at?: string
          variant_label?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          auto_approve_under_usd: number
          budget_usd: number | null
          created_at: string
          created_by: string | null
          current_step: string
          error: string | null
          goal: string
          id: string
          job_id: string | null
          product_id: string | null
          product_url: string | null
          status: string
          steps: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_approve_under_usd?: number
          budget_usd?: number | null
          created_at?: string
          created_by?: string | null
          current_step?: string
          error?: string | null
          goal: string
          id?: string
          job_id?: string | null
          product_id?: string | null
          product_url?: string | null
          status?: string
          steps?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_approve_under_usd?: number
          budget_usd?: number | null
          created_at?: string
          created_by?: string | null
          current_step?: string
          error?: string | null
          goal?: string
          id?: string
          job_id?: string | null
          product_id?: string | null
          product_url?: string | null
          status?: string
          steps?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_embeddings: {
        Row: {
          asset_id: string
          content: string
          embedding: string
          model: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asset_id: string
          content: string
          embedding: string
          model: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asset_id?: string
          content?: string
          embedding?: string
          model?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_embeddings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_embeddings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_versions: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          id: string
          meta: Json
          mime_type: string | null
          note: string | null
          size_bytes: number
          storage_key: string
          version: number
          workspace_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          meta?: Json
          mime_type?: string | null
          note?: string | null
          size_bytes?: number
          storage_key: string
          version: number
          workspace_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          meta?: Json
          mime_type?: string | null
          note?: string | null
          size_bytes?: number
          storage_key?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_versions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          ai_caption: string | null
          ai_tags: string[]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          derived_bytes: number
          description: string | null
          duration_s: number | null
          folder_id: string | null
          fps: number | null
          generation_id: string | null
          height: number | null
          hls_key: string | null
          id: string
          is_ai_generated: boolean
          is_favorite: boolean
          license_id: string | null
          meta: Json
          mime_type: string
          name: string
          parent_asset_id: string | null
          playback: Json
          preview_key: string | null
          processing_error: string | null
          project_id: string | null
          proxy_key: string | null
          search_vector: unknown
          size_bytes: number
          source: string
          status: string
          storage_driver: string
          storage_key: string
          tags: string[]
          thumbnail_key: string | null
          transcript: string | null
          transcript_language: string | null
          transcript_segments: Json | null
          type: string
          updated_at: string
          upload_state: Json
          version: number
          waveform_key: string | null
          width: number | null
          workspace_id: string
        }
        Insert: {
          ai_caption?: string | null
          ai_tags?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          derived_bytes?: number
          description?: string | null
          duration_s?: number | null
          folder_id?: string | null
          fps?: number | null
          generation_id?: string | null
          height?: number | null
          hls_key?: string | null
          id?: string
          is_ai_generated?: boolean
          is_favorite?: boolean
          license_id?: string | null
          meta?: Json
          mime_type: string
          name: string
          parent_asset_id?: string | null
          playback?: Json
          preview_key?: string | null
          processing_error?: string | null
          project_id?: string | null
          proxy_key?: string | null
          search_vector?: unknown
          size_bytes?: number
          source?: string
          status?: string
          storage_driver?: string
          storage_key: string
          tags?: string[]
          thumbnail_key?: string | null
          transcript?: string | null
          transcript_language?: string | null
          transcript_segments?: Json | null
          type: string
          updated_at?: string
          upload_state?: Json
          version?: number
          waveform_key?: string | null
          width?: number | null
          workspace_id: string
        }
        Update: {
          ai_caption?: string | null
          ai_tags?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          derived_bytes?: number
          description?: string | null
          duration_s?: number | null
          folder_id?: string | null
          fps?: number | null
          generation_id?: string | null
          height?: number | null
          hls_key?: string | null
          id?: string
          is_ai_generated?: boolean
          is_favorite?: boolean
          license_id?: string | null
          meta?: Json
          mime_type?: string
          name?: string
          parent_asset_id?: string | null
          playback?: Json
          preview_key?: string | null
          processing_error?: string | null
          project_id?: string | null
          proxy_key?: string | null
          search_vector?: unknown
          size_bytes?: number
          source?: string
          status?: string
          storage_driver?: string
          storage_key?: string
          tags?: string[]
          thumbnail_key?: string | null
          transcript?: string | null
          transcript_language?: string | null
          transcript_segments?: Json | null
          type?: string
          updated_at?: string
          upload_state?: Json
          version?: number
          waveform_key?: string | null
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_tracks: {
        Row: {
          asset_id: string
          beats: Json | null
          bpm: number | null
          created_at: string
          id: string
          kind: string
          license_id: string | null
          line_id: string | null
          loudness_lufs: number | null
          musical_key: string | null
          script_id: string | null
          stem: string | null
          updated_at: string
          voice_id: string | null
          workspace_id: string
        }
        Insert: {
          asset_id: string
          beats?: Json | null
          bpm?: number | null
          created_at?: string
          id?: string
          kind: string
          license_id?: string | null
          line_id?: string | null
          loudness_lufs?: number | null
          musical_key?: string | null
          script_id?: string | null
          stem?: string | null
          updated_at?: string
          voice_id?: string | null
          workspace_id: string
        }
        Update: {
          asset_id?: string
          beats?: Json | null
          bpm?: number | null
          created_at?: string
          id?: string
          kind?: string
          license_id?: string | null
          line_id?: string | null
          loudness_lufs?: number | null
          musical_key?: string | null
          script_id?: string | null
          stem?: string | null
          updated_at?: string
          voice_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_tracks_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_tracks_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_tracks_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_tracks_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_tracks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_kits: {
        Row: {
          caption_style: Json
          colors: Json
          created_at: string
          fonts: Json
          id: string
          intro_asset_id: string | null
          is_default: boolean
          logo_asset_id: string | null
          name: string
          outro_asset_id: string | null
          tone: string | null
          updated_at: string
          watermark: Json
          watermark_asset_id: string | null
          workspace_id: string
        }
        Insert: {
          caption_style?: Json
          colors?: Json
          created_at?: string
          fonts?: Json
          id?: string
          intro_asset_id?: string | null
          is_default?: boolean
          logo_asset_id?: string | null
          name?: string
          outro_asset_id?: string | null
          tone?: string | null
          updated_at?: string
          watermark?: Json
          watermark_asset_id?: string | null
          workspace_id: string
        }
        Update: {
          caption_style?: Json
          colors?: Json
          created_at?: string
          fonts?: Json
          id?: string
          intro_asset_id?: string | null
          is_default?: boolean
          logo_asset_id?: string | null
          name?: string
          outro_asset_id?: string | null
          tone?: string | null
          updated_at?: string
          watermark?: Json
          watermark_asset_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_kits_intro_asset_id_fkey"
            columns: ["intro_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_kits_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_kits_outro_asset_id_fkey"
            columns: ["outro_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_kits_watermark_asset_id_fkey"
            columns: ["watermark_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_kits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          avatar_asset_id: string | null
          color: string | null
          created_at: string
          default_emotion: string
          default_pace: number
          description: string | null
          id: string
          name: string
          updated_at: string
          voice_id: string | null
          workspace_id: string
        }
        Insert: {
          avatar_asset_id?: string | null
          color?: string | null
          created_at?: string
          default_emotion?: string
          default_pace?: number
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          voice_id?: string | null
          workspace_id: string
        }
        Update: {
          avatar_asset_id?: string | null
          color?: string | null
          created_at?: string
          default_emotion?: string
          default_pace?: number
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          voice_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_avatar_asset_id_fkey"
            columns: ["avatar_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          active_ad_count: number
          ad_count: number
          countries: string[]
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_synced_at: string | null
          meta_page_id: string | null
          name: string
          notes: string | null
          tiktok_handle: string | null
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          active_ad_count?: number
          ad_count?: number
          countries?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          meta_page_id?: string | null
          name: string
          notes?: string | null
          tiktok_handle?: string | null
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          active_ad_count?: number
          ad_count?: number
          countries?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          meta_page_id?: string | null
          name?: string
          notes?: string | null
          tiktok_handle?: string | null
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          accepted_at: string
          accepted_by: string | null
          created_at: string
          evidence_asset_id: string | null
          id: string
          ip_address: unknown
          is_self: boolean
          kind: string
          revoked_at: string | null
          statement: string
          subject_name: string
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_by?: string | null
          created_at?: string
          evidence_asset_id?: string | null
          id?: string
          ip_address?: unknown
          is_self?: boolean
          kind: string
          revoked_at?: string | null
          statement: string
          subject_name: string
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string | null
          created_at?: string
          evidence_asset_id?: string | null
          id?: string
          ip_address?: unknown
          is_self?: boolean
          kind?: string
          revoked_at?: string | null
          statement?: string
          subject_name?: string
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_evidence_asset_id_fkey"
            columns: ["evidence_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          accounts_removed: number
          code: string
          completed_at: string | null
          created_at: string
          id: string
          source: string
          status: string
        }
        Insert: {
          accounts_removed?: number
          code: string
          completed_at?: string | null
          created_at?: string
          id?: string
          source: string
          status?: string
        }
        Update: {
          accounts_removed?: number
          code?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          source?: string
          status?: string
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          project_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          project_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          capability: string
          completed_at: string | null
          cost_actual_usd: number | null
          cost_estimate_usd: number | null
          created_at: string
          created_by: string | null
          error: string | null
          eta_seconds: number | null
          id: string
          input_asset_ids: string[]
          job_id: string | null
          model: string
          negative_prompt: string | null
          output: Json
          output_asset_ids: string[]
          params: Json
          progress: number
          project_id: string | null
          prompt: string | null
          provider: string
          provider_request_id: string | null
          seed: number | null
          source_ref: Json
          started_at: string | null
          status: string
          updated_at: string
          variant_group: string | null
          variant_index: number
          workspace_id: string
        }
        Insert: {
          capability: string
          completed_at?: string | null
          cost_actual_usd?: number | null
          cost_estimate_usd?: number | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          eta_seconds?: number | null
          id?: string
          input_asset_ids?: string[]
          job_id?: string | null
          model: string
          negative_prompt?: string | null
          output?: Json
          output_asset_ids?: string[]
          params?: Json
          progress?: number
          project_id?: string | null
          prompt?: string | null
          provider: string
          provider_request_id?: string | null
          seed?: number | null
          source_ref?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
          variant_group?: string | null
          variant_index?: number
          workspace_id: string
        }
        Update: {
          capability?: string
          completed_at?: string | null
          cost_actual_usd?: number | null
          cost_estimate_usd?: number | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          eta_seconds?: number | null
          id?: string
          input_asset_ids?: string[]
          job_id?: string | null
          model?: string
          negative_prompt?: string | null
          output?: Json
          output_asset_ids?: string[]
          params?: Json
          progress?: number
          project_id?: string | null
          prompt?: string | null
          provider?: string
          provider_request_id?: string | null
          seed?: number | null
          source_ref?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
          variant_group?: string | null
          variant_index?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inspiration_ads: {
        Row: {
          analysis: Json | null
          asset_id: string | null
          body: string | null
          brand: string
          competitor_id: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          external_id: string | null
          first_seen_at: string
          headline: string | null
          id: string
          is_favorite: boolean
          last_checked_at: string | null
          last_seen_at: string
          metrics: Json
          notes: string | null
          platform: string
          source_url: string | null
          started_at: string | null
          status: string
          stopped_at: string | null
          tags: string[]
          thumbnail_url: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis?: Json | null
          asset_id?: string | null
          body?: string | null
          brand: string
          competitor_id?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          external_id?: string | null
          first_seen_at?: string
          headline?: string | null
          id?: string
          is_favorite?: boolean
          last_checked_at?: string | null
          last_seen_at?: string
          metrics?: Json
          notes?: string | null
          platform: string
          source_url?: string | null
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          tags?: string[]
          thumbnail_url?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis?: Json | null
          asset_id?: string | null
          body?: string | null
          brand?: string
          competitor_id?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          external_id?: string | null
          first_seen_at?: string
          headline?: string | null
          id?: string
          is_favorite?: boolean
          last_checked_at?: string | null
          last_seen_at?: string
          metrics?: Json
          notes?: string | null
          platform?: string
          source_url?: string | null
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          tags?: string[]
          thumbnail_url?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspiration_ads_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspiration_ads_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspiration_ads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          parent_job_id: string | null
          payload: Json
          priority: number
          progress: number
          progress_message: string | null
          result: Json | null
          run_at: string
          started_at: string | null
          status: string
          type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          parent_job_id?: string | null
          payload?: Json
          priority?: number
          progress?: number
          progress_message?: string | null
          result?: Json | null
          run_at?: string
          started_at?: string | null
          status?: string
          type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          parent_job_id?: string | null
          payload?: Json
          priority?: number
          progress?: number
          progress_message?: string | null
          result?: Json | null
          run_at?: string
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          commercial_use: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          notes: string | null
          proof_asset_id: string | null
          provider: string | null
          source: string | null
          terms_url: string | null
          territories: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          commercial_use?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          notes?: string | null
          proof_asset_id?: string | null
          provider?: string | null
          source?: string | null
          terms_url?: string | null
          territories?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          commercial_use?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          proof_asset_id?: string | null
          provider?: string | null
          source?: string | null
          terms_url?: string | null
          territories?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_proof_asset_id_fkey"
            columns: ["proof_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      music: {
        Row: {
          asset_id: string | null
          bpm: number | null
          created_at: string
          created_by: string | null
          duration_s: number | null
          generation_id: string | null
          genre: string | null
          id: string
          instrumental: boolean
          is_audio_logo: boolean
          license_id: string | null
          lyrics: string | null
          mood: string | null
          musical_key: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asset_id?: string | null
          bpm?: number | null
          created_at?: string
          created_by?: string | null
          duration_s?: number | null
          generation_id?: string | null
          genre?: string | null
          id?: string
          instrumental?: boolean
          is_audio_logo?: boolean
          license_id?: string | null
          lyrics?: string | null
          mood?: string | null
          musical_key?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asset_id?: string | null
          bpm?: number | null
          created_at?: string
          created_by?: string | null
          duration_s?: number | null
          generation_id?: string | null
          genre?: string | null
          id?: string
          instrumental?: boolean
          is_audio_logo?: boolean
          license_id?: string | null
          lyrics?: string | null
          mood?: string | null
          musical_key?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "music_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          expires_at: string
          platform: string
          redirect_to: string | null
          state: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          platform: string
          redirect_to?: string | null
          state: string
          user_id: string
          workspace_id: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          platform?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics: {
        Row: {
          captured_at: string
          clicks: number | null
          comments: number | null
          ctr: number | null
          id: string
          impressions: number | null
          likes: number | null
          post_target_id: string
          raw: Json
          saves: number | null
          shares: number | null
          views: number | null
          watch_time_s: number | null
          workspace_id: string
        }
        Insert: {
          captured_at?: string
          clicks?: number | null
          comments?: number | null
          ctr?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          post_target_id: string
          raw?: Json
          saves?: number | null
          shares?: number | null
          views?: number | null
          watch_time_s?: number | null
          workspace_id: string
        }
        Update: {
          captured_at?: string
          clicks?: number | null
          comments?: number | null
          ctr?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          post_target_id?: string
          raw?: Json
          saves?: number | null
          shares?: number | null
          views?: number | null
          watch_time_s?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_post_target_id_fkey"
            columns: ["post_target_id"]
            isOneToOne: false
            referencedRelation: "post_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_targets: {
        Row: {
          attempts: number
          caption_override: string | null
          created_at: string
          error: string | null
          external_id: string | null
          external_url: string | null
          hashtags_override: string[] | null
          id: string
          job_id: string | null
          metrics: Json
          metrics_updated_at: string | null
          options: Json
          platform: string
          post_id: string
          published_at: string | null
          social_account_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          caption_override?: string | null
          created_at?: string
          error?: string | null
          external_id?: string | null
          external_url?: string | null
          hashtags_override?: string[] | null
          id?: string
          job_id?: string | null
          metrics?: Json
          metrics_updated_at?: string | null
          options?: Json
          platform: string
          post_id: string
          published_at?: string | null
          social_account_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          caption_override?: string | null
          created_at?: string
          error?: string | null
          external_id?: string | null
          external_url?: string | null
          hashtags_override?: string[] | null
          id?: string
          job_id?: string | null
          metrics?: Json
          metrics_updated_at?: string | null
          options?: Json
          platform?: string
          post_id?: string
          published_at?: string | null
          social_account_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_targets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_targets_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_targets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ab_group: string | null
          ab_variant: string | null
          ai_generated_label: boolean
          asset_id: string | null
          caption: string
          created_at: string
          created_by: string | null
          hashtags: string[]
          id: string
          project_id: string | null
          published_at: string | null
          render_id: string | null
          rights_acknowledged: boolean
          scheduled_at: string | null
          status: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ab_group?: string | null
          ab_variant?: string | null
          ai_generated_label?: boolean
          asset_id?: string | null
          caption?: string
          created_at?: string
          created_by?: string | null
          hashtags?: string[]
          id?: string
          project_id?: string | null
          published_at?: string | null
          render_id?: string | null
          rights_acknowledged?: boolean
          scheduled_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ab_group?: string | null
          ab_variant?: string | null
          ai_generated_label?: boolean
          asset_id?: string | null
          caption?: string
          created_at?: string
          created_by?: string | null
          hashtags?: string[]
          id?: string
          project_id?: string | null
          published_at?: string | null
          render_id?: string | null
          rights_acknowledged?: boolean
          scheduled_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_render_id_fkey"
            columns: ["render_id"]
            isOneToOne: false
            referencedRelation: "renders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_name: string | null
          colors: Json
          copy: Json
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          error: string | null
          id: string
          image_asset_ids: string[]
          job_id: string | null
          logo_asset_id: string | null
          price: number | null
          raw: Json
          source_url: string
          status: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brand_name?: string | null
          colors?: Json
          copy?: Json
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          error?: string | null
          id?: string
          image_asset_ids?: string[]
          job_id?: string | null
          logo_asset_id?: string | null
          price?: number | null
          raw?: Json
          source_url: string
          status?: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand_name?: string | null
          colors?: Json
          copy?: Json
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          error?: string | null
          id?: string
          image_asset_ids?: string[]
          job_id?: string | null
          logo_asset_id?: string | null
          price?: number | null
          raw?: Json
          source_url?: string
          status?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_workspace_id: string | null
          full_name: string | null
          id: string
          preferences: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_workspace_id?: string | null
          full_name?: string | null
          id: string
          preferences?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_workspace_id?: string | null
          full_name?: string | null
          id?: string
          preferences?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          idea: string
          is_saved: boolean
          mode: string
          model: string | null
          negative_prompt: string | null
          parent_id: string | null
          platform: string | null
          prompt: string
          provider: string | null
          structured: Json
          tags: string[]
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          idea: string
          is_saved?: boolean
          mode?: string
          model?: string | null
          negative_prompt?: string | null
          parent_id?: string | null
          platform?: string | null
          prompt: string
          provider?: string | null
          structured?: Json
          tags?: string[]
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          idea?: string
          is_saved?: boolean
          mode?: string
          model?: string | null
          negative_prompt?: string | null
          parent_id?: string | null
          platform?: string | null
          prompt?: string
          provider?: string | null
          structured?: Json
          tags?: string[]
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hint: string | null
          label: string | null
          provider: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hint?: string | null
          label?: string | null
          provider: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hint?: string | null
          label?: string | null
          provider?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_secrets: {
        Row: {
          credential_id: string
          key_version: number
          secret_enc: string
          updated_at: string
        }
        Insert: {
          credential_id: string
          key_version?: number
          secret_enc: string
          updated_at?: string
        }
        Update: {
          credential_id?: string
          key_version?: number
          secret_enc?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_secrets_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: true
            referencedRelation: "provider_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      renders: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          format: string
          fps: number
          height: number
          id: string
          job_id: string | null
          output_asset_id: string | null
          preset: string
          progress: number
          status: string
          timeline_id: string | null
          timeline_version: number | null
          updated_at: string
          width: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          format: string
          fps: number
          height: number
          id?: string
          job_id?: string | null
          output_asset_id?: string | null
          preset: string
          progress?: number
          status?: string
          timeline_id?: string | null
          timeline_version?: number | null
          updated_at?: string
          width: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          format?: string
          fps?: number
          height?: number
          id?: string
          job_id?: string | null
          output_asset_id?: string | null
          preset?: string
          progress?: number
          status?: string
          timeline_id?: string | null
          timeline_version?: number | null
          updated_at?: string
          width?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renders_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renders_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          brief: Json
          captions: string | null
          created_at: string
          created_by: string | null
          error: string | null
          format: string
          hashtags: string[]
          id: string
          job_id: string | null
          language: string
          lines: Json
          project_id: string | null
          status: string
          storyboard: Json
          timeline_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brief?: Json
          captions?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          format?: string
          hashtags?: string[]
          id?: string
          job_id?: string | null
          language?: string
          lines?: Json
          project_id?: string | null
          status?: string
          storyboard?: Json
          timeline_id?: string | null
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brief?: Json
          captions?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          format?: string
          hashtags?: string[]
          id?: string
          job_id?: string | null
          language?: string
          lines?: Json
          project_id?: string | null
          status?: string
          storyboard?: Json
          timeline_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sfx: {
        Row: {
          asset_id: string | null
          builtin_path: string | null
          category: string
          created_at: string
          duration_s: number | null
          generation_id: string | null
          id: string
          license_id: string | null
          name: string
          tags: string[]
          workspace_id: string | null
        }
        Insert: {
          asset_id?: string | null
          builtin_path?: string | null
          category: string
          created_at?: string
          duration_s?: number | null
          generation_id?: string | null
          id?: string
          license_id?: string | null
          name: string
          tags?: string[]
          workspace_id?: string | null
        }
        Update: {
          asset_id?: string | null
          builtin_path?: string | null
          category?: string
          created_at?: string
          duration_s?: number | null
          generation_id?: string | null
          id?: string
          license_id?: string | null
          name?: string
          tags?: string[]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sfx_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sfx_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sfx_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sfx_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          allow_download: boolean
          asset_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          password_hash: string | null
          project_id: string | null
          revoked_at: string | null
          token: string
          view_count: number
          workspace_id: string
        }
        Insert: {
          allow_download?: boolean
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          password_hash?: string | null
          project_id?: string | null
          revoked_at?: string | null
          token: string
          view_count?: number
          workspace_id: string
        }
        Update: {
          allow_download?: boolean
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          password_hash?: string | null
          project_id?: string | null
          revoked_at?: string | null
          token?: string
          view_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_account_tokens: {
        Row: {
          access_token_enc: string
          key_version: number
          refresh_token_enc: string | null
          social_account_id: string
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          key_version?: number
          refresh_token_enc?: string | null
          social_account_id: string
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          key_version?: number
          refresh_token_enc?: string | null
          social_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_account_tokens_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          avatar_url: string | null
          connected_by: string | null
          created_at: string
          display_name: string | null
          external_id: string
          handle: string | null
          id: string
          meta: Json
          platform: string
          provider: string
          scopes: string[]
          status: string
          status_detail: string | null
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          external_id: string
          handle?: string | null
          id?: string
          meta?: Json
          platform: string
          provider?: string
          scopes?: string[]
          status?: string
          status_detail?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          external_id?: string
          handle?: string | null
          id?: string
          meta?: Json
          platform?: string
          provider?: string
          scopes?: string[]
          status?: string
          status_detail?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          aspect: string | null
          category: string | null
          created_at: string
          created_by: string | null
          data: Json
          description: string | null
          id: string
          is_builtin: boolean
          kind: string
          name: string
          thumbnail_url: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          aspect?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          is_builtin?: boolean
          kind: string
          name: string
          thumbnail_url?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          aspect?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          is_builtin?: boolean
          kind?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          label: string | null
          timeline_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: Json
          id?: string
          label?: string | null
          timeline_id: string
          version: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          label?: string | null
          timeline_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_snapshots_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      timelines: {
        Row: {
          aspect: string
          created_at: string
          created_by: string | null
          data: Json
          deleted_at: string | null
          duration_s: number
          fps: number
          height: number
          id: string
          name: string
          project_id: string | null
          template_id: string | null
          thumbnail_asset_id: string | null
          updated_at: string
          version: number
          width: number
          workspace_id: string
        }
        Insert: {
          aspect?: string
          created_at?: string
          created_by?: string | null
          data: Json
          deleted_at?: string | null
          duration_s?: number
          fps?: number
          height?: number
          id?: string
          name?: string
          project_id?: string | null
          template_id?: string | null
          thumbnail_asset_id?: string | null
          updated_at?: string
          version?: number
          width?: number
          workspace_id: string
        }
        Update: {
          aspect?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          deleted_at?: string | null
          duration_s?: number
          fps?: number
          height?: number
          id?: string
          name?: string
          project_id?: string | null
          template_id?: string | null
          thumbnail_asset_id?: string | null
          updated_at?: string
          version?: number
          width?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timelines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timelines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timelines_thumbnail_asset_id_fkey"
            columns: ["thumbnail_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timelines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          cost_usd: number
          created_at: string
          generation_id: string | null
          id: string
          is_estimate: boolean
          job_id: string | null
          kind: string
          meta: Json
          model: string | null
          provider: string
          unit: string
          units: number
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          generation_id?: string | null
          id?: string
          is_estimate?: boolean
          job_id?: string | null
          kind: string
          meta?: Json
          model?: string | null
          provider: string
          unit?: string
          units?: number
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          generation_id?: string | null
          id?: string
          is_estimate?: boolean
          job_id?: string | null
          kind?: string
          meta?: Json
          model?: string | null
          provider?: string
          unit?: string
          units?: number
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_batches: {
        Row: {
          ab_group: string
          cost_estimate_usd: number | null
          count: number
          created_at: string
          created_by: string | null
          dimensions: string[]
          error: string | null
          id: string
          job_id: string | null
          name: string
          source_timeline_id: string | null
          status: string
          updated_at: string
          variants: Json
          workspace_id: string
        }
        Insert: {
          ab_group?: string
          cost_estimate_usd?: number | null
          count: number
          created_at?: string
          created_by?: string | null
          dimensions?: string[]
          error?: string | null
          id?: string
          job_id?: string | null
          name: string
          source_timeline_id?: string | null
          status?: string
          updated_at?: string
          variants?: Json
          workspace_id: string
        }
        Update: {
          ab_group?: string
          cost_estimate_usd?: number | null
          count?: number
          created_at?: string
          created_by?: string | null
          dimensions?: string[]
          error?: string | null
          id?: string
          job_id?: string | null
          name?: string
          source_timeline_id?: string | null
          status?: string
          updated_at?: string
          variants?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_batches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_batches_source_timeline_id_fkey"
            columns: ["source_timeline_id"]
            isOneToOne: false
            referencedRelation: "timelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      voices: {
        Row: {
          consent_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_cloned: boolean
          labels: Json
          name: string
          preview_url: string | null
          provider: string
          provider_voice_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          consent_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_cloned?: boolean
          labels?: Json
          name: string
          preview_url?: string | null
          provider: string
          provider_voice_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          consent_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_cloned?: boolean
          labels?: Json
          name?: string
          preview_url?: string | null
          provider?: string
          provider_voice_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voices_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          event_id: string
          event_type: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
        }
        Insert: {
          error?: string | null
          event_id: string
          event_type?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          error?: string | null
          event_id?: string
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          ai_label_default: boolean
          budget_hard_stop: boolean
          created_at: string
          id: string
          monthly_budget_usd: number
          name: string
          owner_id: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          ai_label_default?: boolean
          budget_hard_stop?: boolean
          created_at?: string
          id?: string
          monthly_budget_usd?: number
          name: string
          owner_id: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          ai_label_default?: boolean
          budget_hard_stop?: boolean
          created_at?: string
          id?: string
          monthly_budget_usd?: number
          name?: string
          owner_id?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ad_daily_metrics: {
        Args: { campaign?: string; since: string; ws: string }
        Returns: {
          clicks: number
          conversions: number
          day: string
          impressions: number
          spend: number
          video_views: number
        }[]
      }
      claim_jobs: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_types?: string[]
          p_worker: string
        }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          parent_job_id: string | null
          payload: Json
          priority: number
          progress: number
          progress_message: string | null
          result: Json | null
          run_at: string
          started_at: string | null
          status: string
          type: string
          updated_at: string
          workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      hit_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      post_daily_metrics: {
        Args: { since: string; ws: string }
        Returns: {
          clicks: number
          comments: number
          day: string
          impressions: number
          likes: number
          saves: number
          shares: number
          views: number
        }[]
      }
      search_assets: {
        Args: {
          p_embedding?: string
          p_include_deleted?: boolean
          p_limit?: number
          p_query?: string
          p_types?: string[]
          p_workspace: string
        }
        Returns: {
          asset_id: string
          matched: string[]
          score: number
        }[]
      }
      try_uuid: { Args: { value: string }; Returns: string }
      workspace_month_spend: { Args: { ws: string }; Returns: number }
      workspace_stats: { Args: { ws: string }; Returns: Json }
      workspace_tags: {
        Args: { ws: string }
        Returns: {
          tag: string
          uses: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
