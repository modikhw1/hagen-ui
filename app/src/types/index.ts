// User Profile Types
export interface UserProfile {
  id: string;
  businessName: string;
  businessDescription: string;
  goals: string[];
  constraints: string[];
  industryTags: string[];
  profileCompleteness: number; // 0-100
  socialLinks?: {
    tiktok?: string;
    instagram?: string;
  };
}

// Concept Types - Now uses category keys for display layer
export interface Concept {
  id: string;
  headline: string;
  matchPercentage: number; // 0-100

  // Category keys (use display layer for labels)
  difficulty: string;      // 'easy' | 'medium' | 'advanced'
  filmTime: string;        // '5min' | '10min' | '15min' | etc
  peopleNeeded: string;    // 'solo' | 'duo' | 'small_team' | 'team'
  mechanism: string;       // 'contrast' | 'subversion' | etc
  market: string;          // 'SE' | 'US' | 'UK' | 'global'
  trendLevel: number;      // 1-5
  businessTypes?: string[];
  hasScript?: boolean;
  estimatedBudget?: string; // 'free' | 'low' | 'medium' | 'high'

  // Arrays
  vibeAlignments: string[];
  whyItFits: string[];

  // Metadata
  price: number;
  isNew?: boolean;
  remaining?: number;      // Scarcity: "X left"
  sourceUrl?: string;
  gcsUri?: string;

  // Swedish content fields (from clips.json overrides/defaults)
  headline_sv?: string;
  description_sv?: string;
  whyItWorks_sv?: string;
  script_sv?: string;
  productionNotes_sv?: string[];
  whyItFits_sv?: string[];
}

// Dashboard Row Types
export interface DashboardRowData {
  id: string;
  title: string;
  subtitle?: string;
  concepts: Concept[];
}

// Chat Message Types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}
