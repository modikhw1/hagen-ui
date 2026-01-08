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

// Concept Types
export interface Concept {
  id: string;
  headline: string;
  matchPercentage: number; // 0-100
  originCountry: string;
  originFlag: string;
  trendLevel: 1 | 2 | 3 | 4 | 5; // Fire emoji count
  difficulty: "Easy" | "Medium" | "Advanced";
  peopleNeeded: string;
  filmTime: string;
  price: number;
  whyItFits: string[];
  isNew?: boolean;
  remaining?: number; // Scarcity: "X left"
  purchasedBy?: number; // Social proof: "X cafés got this"
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
