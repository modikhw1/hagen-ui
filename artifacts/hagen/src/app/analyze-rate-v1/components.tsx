'use client';

import { 
  QualityRatingData, 
  ReplicabilityData, 
  EnvironmentData, 
  RiskLevelData, 
  TargetAudienceData,
  QualityTier,
  ActorCount,
  SetupComplexity,
  SkillRequired,
  SettingType,
  SpaceRequirements,
  LightingConditions,
  ContentEdge,
  HumorRisk,
  AgeRange,
  IncomeLevel,
  LifestyleTag,
  VibeAlignment
} from './types';

// =============================================================================
// SHARED UI COMPONENTS
// =============================================================================

interface ButtonGroupProps<T extends string> {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink';
}

export function ButtonGroup<T extends string>({ 
  options, 
  value, 
  onChange,
  color = 'blue'
}: ButtonGroupProps<T>) {
  const colorClasses = {
    blue: 'bg-blue-600 text-white',
    green: 'bg-green-600 text-white',
    purple: 'bg-purple-600 text-white',
    orange: 'bg-orange-600 text-white',
    pink: 'bg-pink-600 text-white'
  };
  
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
            value === opt.value
              ? colorClasses[color]
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface MultiSelectGroupProps<T extends string> {
  options: { value: T; label: string }[];
  values: T[];
  onChange: (v: T[]) => void;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink';
}

export function MultiSelectGroup<T extends string>({
  options,
  values,
  onChange,
  color = 'blue'
}: MultiSelectGroupProps<T>) {
  const colorClasses = {
    blue: 'bg-blue-600 text-white',
    green: 'bg-green-600 text-white',
    purple: 'bg-purple-600 text-white',
    orange: 'bg-orange-600 text-white',
    pink: 'bg-pink-600 text-white'
  };

  const toggle = (value: T) => {
    if (values.includes(value)) {
      onChange(values.filter(v => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => toggle(opt.value)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
            values.includes(opt.value)
              ? colorClasses[color]
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  section: string;
  color: string;
  expanded: boolean;
  onToggle: () => void;
}

export function SectionHeader({ title, section, color, expanded, onToggle }: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2"
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <h3 className="text-md font-semibold text-white">{title}</h3>
      </div>
      <svg 
        className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const normalizedValue = Math.min(value * 10, 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-sm text-gray-400">{label}</span>
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
      <span className="w-12 text-right text-sm font-mono text-white">
        {value}/10
      </span>
    </div>
  );
}

// =============================================================================
// QUALITY RATING SECTION
// =============================================================================

interface QualityRatingSectionProps {
  data: QualityRatingData;
  onChange: (data: QualityRatingData) => void;
}

const tierColors: Record<QualityTier, string> = {
  excellent: 'bg-green-600 hover:bg-green-700',
  good: 'bg-blue-600 hover:bg-blue-700',
  mediocre: 'bg-yellow-600 hover:bg-yellow-700',
  bad: 'bg-red-600 hover:bg-red-700'
};

export function QualityRatingSection({ data, onChange }: QualityRatingSectionProps) {
  return (
    <>
      <div>
        <label className="block text-sm text-gray-400 mb-2">Quality Tier *</label>
        <div className="flex gap-3">
          {(['excellent', 'good', 'mediocre', 'bad'] as QualityTier[]).map((tier) => (
            <button
              key={tier}
              onClick={() => onChange({ ...data, qualityTier: tier })}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                data.qualityTier === tier
                  ? tierColors[tier] + ' ring-2 ring-white'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Your Interpretation</label>
        <textarea
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          placeholder="Why did you rate it this way? What makes it work or not work?"
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={2}
        />
      </div>
    </>
  );
}

// =============================================================================
// REPLICABILITY SECTION
// =============================================================================

interface ReplicabilitySectionProps {
  data: ReplicabilityData;
  onChange: (data: ReplicabilityData) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function ReplicabilitySection({ data, onChange, expanded, onToggle }: ReplicabilitySectionProps) {
  return (
    <div className="border-t border-gray-700 pt-4">
      <SectionHeader 
        title="Replicability Signals" 
        section="replicability" 
        color="bg-blue-500" 
        expanded={expanded}
        onToggle={onToggle}
      />
      
      {expanded && (
        <div className="mt-4 space-y-4 pl-4 border-l-2 border-blue-500/30">
          <div>
            <span className="text-xs text-gray-500 block mb-1">How many people appear?</span>
            <ButtonGroup
              options={[
                { value: 'solo', label: '1 Person' },
                { value: 'duo', label: '2 People' },
                { value: 'small_team', label: '3-5' },
                { value: 'large_team', label: '5+' }
              ]}
              value={data.actorCount}
              onChange={(v) => onChange({ ...data, actorCount: v })}
              color="blue"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Setup Complexity</span>
            <ButtonGroup
              options={[
                { value: 'phone_only', label: 'Phone Only' },
                { value: 'basic_tripod', label: 'Tripod' },
                { value: 'lighting_setup', label: 'Lighting' },
                { value: 'full_studio', label: 'Studio' }
              ]}
              value={data.setupComplexity}
              onChange={(v) => onChange({ ...data, setupComplexity: v })}
              color="blue"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Skill Required to Recreate</span>
            <ButtonGroup
              options={[
                { value: 'anyone', label: 'Anyone' },
                { value: 'basic_editing', label: 'Basic Editing' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'professional', label: 'Professional' }
              ]}
              value={data.skillRequired}
              onChange={(v) => onChange({ ...data, skillRequired: v })}
              color="blue"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Equipment Visible/Required</span>
            <MultiSelectGroup
              options={[
                { value: 'smartphone', label: 'Smartphone' },
                { value: 'tripod', label: 'Tripod' },
                { value: 'ring_light', label: 'Ring Light' },
                { value: 'microphone', label: 'Microphone' },
                { value: 'camera', label: 'Camera' },
                { value: 'gimbal', label: 'Gimbal' }
              ]}
              values={data.equipmentNeeded}
              onChange={(v) => onChange({ ...data, equipmentNeeded: v })}
              color="blue"
            />
          </div>

          <div>
            <textarea
              value={data.notes}
              onChange={(e) => onChange({ ...data, notes: e.target.value })}
              placeholder="Additional replicability notes..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm resize-none"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ENVIRONMENT SECTION
// =============================================================================

interface EnvironmentSectionProps {
  data: EnvironmentData;
  onChange: (data: EnvironmentData) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function EnvironmentSection({ data, onChange, expanded, onToggle }: EnvironmentSectionProps) {
  return (
    <div className="border-t border-gray-700 pt-4">
      <SectionHeader 
        title="Environment Signals" 
        section="environment" 
        color="bg-green-500" 
        expanded={expanded}
        onToggle={onToggle}
      />
      
      {expanded && (
        <div className="mt-4 space-y-4 pl-4 border-l-2 border-green-500/30">
          <div>
            <span className="text-xs text-gray-500 block mb-1">Setting Type</span>
            <ButtonGroup
              options={[
                { value: 'kitchen', label: 'Kitchen' },
                { value: 'dining_room', label: 'Dining Room' },
                { value: 'bar', label: 'Bar' },
                { value: 'storefront', label: 'Storefront' },
                { value: 'outdoor', label: 'Outdoor' },
                { value: 'mixed', label: 'Mixed' }
              ]}
              value={data.settingType}
              onChange={(v) => onChange({ ...data, settingType: v })}
              color="green"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Space Requirements</span>
            <ButtonGroup
              options={[
                { value: 'minimal', label: 'Minimal/Tight' },
                { value: 'moderate', label: 'Moderate' },
                { value: 'spacious', label: 'Spacious' }
              ]}
              value={data.spaceRequirements}
              onChange={(v) => onChange({ ...data, spaceRequirements: v })}
              color="green"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Lighting Conditions</span>
            <ButtonGroup
              options={[
                { value: 'natural', label: 'Natural' },
                { value: 'artificial', label: 'Artificial' },
                { value: 'low_light', label: 'Low Light/Moody' },
                { value: 'flexible', label: 'Flexible' }
              ]}
              value={data.lightingConditions}
              onChange={(v) => onChange({ ...data, lightingConditions: v })}
              color="green"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Customer Visibility</span>
            <ButtonGroup
              options={[
                { value: 'no_customers', label: 'No Customers' },
                { value: 'background', label: 'In Background' },
                { value: 'featured', label: 'Featured' }
              ]}
              value={data.customerVisibility}
              onChange={(v) => onChange({ ...data, customerVisibility: v })}
              color="green"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// RISK LEVEL SECTION
// =============================================================================

interface RiskLevelSectionProps {
  data: RiskLevelData;
  onChange: (data: RiskLevelData) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function RiskLevelSection({ data, onChange, expanded, onToggle }: RiskLevelSectionProps) {
  return (
    <div className="border-t border-gray-700 pt-4">
      <SectionHeader 
        title="Risk Level Signals" 
        section="risk" 
        color="bg-orange-500" 
        expanded={expanded}
        onToggle={onToggle}
      />
      
      {expanded && (
        <div className="mt-4 space-y-4 pl-4 border-l-2 border-orange-500/30">
          <div>
            <span className="text-xs text-gray-500 block mb-1">Content Edge</span>
            <ButtonGroup
              options={[
                { value: 'brand_safe', label: 'Brand Safe' },
                { value: 'mildly_edgy', label: 'Mildly Edgy' },
                { value: 'edgy', label: 'Edgy' },
                { value: 'provocative', label: 'Provocative' }
              ]}
              value={data.contentEdge}
              onChange={(v) => onChange({ ...data, contentEdge: v })}
              color="orange"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Humor Risk</span>
            <ButtonGroup
              options={[
                { value: 'safe_humor', label: 'Safe/Clean' },
                { value: 'playful', label: 'Playful' },
                { value: 'sarcastic', label: 'Sarcastic' },
                { value: 'dark_humor', label: 'Dark Humor' }
              ]}
              value={data.humorRisk}
              onChange={(v) => onChange({ ...data, humorRisk: v })}
              color="orange"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Trend Reliance</span>
            <ButtonGroup
              options={[
                { value: 'evergreen', label: 'Evergreen' },
                { value: 'light_trends', label: 'Light Trends' },
                { value: 'trend_dependent', label: 'Trend Dependent' }
              ]}
              value={data.trendReliance}
              onChange={(v) => onChange({ ...data, trendReliance: v })}
              color="orange"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TARGET AUDIENCE SECTION
// =============================================================================

interface TargetAudienceSectionProps {
  data: TargetAudienceData;
  onChange: (data: TargetAudienceData) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function TargetAudienceSection({ data, onChange, expanded, onToggle }: TargetAudienceSectionProps) {
  return (
    <div className="border-t border-gray-700 pt-4">
      <SectionHeader 
        title="Target Audience Signals" 
        section="audience" 
        color="bg-pink-500" 
        expanded={expanded}
        onToggle={onToggle}
      />
      
      {expanded && (
        <div className="mt-4 space-y-4 pl-4 border-l-2 border-pink-500/30">
          <div>
            <span className="text-xs text-gray-500 block mb-1">Primary Age Groups (select all that apply)</span>
            <MultiSelectGroup
              options={[
                { value: 'gen_z', label: 'Gen Z (18-25)' },
                { value: 'millennial', label: 'Millennial (26-40)' },
                { value: 'gen_x', label: 'Gen X (41-56)' },
                { value: 'boomer', label: 'Boomer (57+)' },
                { value: 'broad', label: 'Broad Appeal' }
              ]}
              values={data.primaryAges}
              onChange={(v) => onChange({ ...data, primaryAges: v })}
              color="pink"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Income Level Appeal</span>
            <ButtonGroup
              options={[
                { value: 'budget', label: 'Budget' },
                { value: 'mid_range', label: 'Mid-Range' },
                { value: 'upscale', label: 'Upscale' },
                { value: 'luxury', label: 'Luxury' },
                { value: 'broad', label: 'Broad' }
              ]}
              value={data.incomeLevel}
              onChange={(v) => onChange({ ...data, incomeLevel: v })}
              color="pink"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Lifestyle Tags (select all that apply)</span>
            <MultiSelectGroup
              options={[
                { value: 'foodies', label: 'Foodies' },
                { value: 'families', label: 'Families' },
                { value: 'date_night', label: 'Date Night' },
                { value: 'business', label: 'Business' },
                { value: 'tourists', label: 'Tourists' },
                { value: 'locals', label: 'Locals' },
                { value: 'health_conscious', label: 'Health Conscious' },
                { value: 'indulgent', label: 'Indulgent' },
                { value: 'social_media_active', label: 'Social Media' },
                { value: 'adventurous', label: 'Adventurous' },
                { value: 'comfort_seeking', label: 'Comfort Seeking' },
                { value: 'trend_followers', label: 'Trend Followers' }
              ]}
              values={data.lifestyleTags}
              onChange={(v) => onChange({ ...data, lifestyleTags: v })}
              color="pink"
            />
          </div>

          <div>
            <span className="text-xs text-gray-500 block mb-1">Vibe Alignment (select all that apply)</span>
            <MultiSelectGroup
              options={[
                { value: 'trendy', label: 'Trendy' },
                { value: 'classic', label: 'Classic' },
                { value: 'family_friendly', label: 'Family Friendly' },
                { value: 'upscale_casual', label: 'Upscale Casual' },
                { value: 'dive_authentic', label: 'Dive/Authentic' },
                { value: 'instagram_worthy', label: 'Instagram Worthy' },
                { value: 'neighborhood_gem', label: 'Neighborhood Gem' },
                { value: 'hidden_gem', label: 'Hidden Gem' }
              ]}
              values={data.vibeAlignments}
              onChange={(v) => onChange({ ...data, vibeAlignments: v })}
              color="pink"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SIGNAL COMPLETION INDICATOR
// =============================================================================

interface SignalCompletionProps {
  replicability: ReplicabilityData;
  environment: EnvironmentData;
  riskLevel: RiskLevelData;
  targetAudience: TargetAudienceData;
}

export function SignalCompletionIndicator({ replicability, environment, riskLevel, targetAudience }: SignalCompletionProps) {
  const replicabilityComplete = replicability.actorCount && replicability.setupComplexity && replicability.skillRequired;
  const environmentComplete = environment.settingType && environment.spaceRequirements;
  const riskComplete = riskLevel.contentEdge && riskLevel.humorRisk;
  const audienceComplete = targetAudience.primaryAges.length > 0 && targetAudience.incomeLevel;

  return (
    <div className="border-t border-gray-700 pt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">Signal Completion</span>
        <div className="flex items-center gap-4">
          <span className={replicabilityComplete ? 'text-blue-400' : 'text-gray-600'}>
            ● Replicability
          </span>
          <span className={environmentComplete ? 'text-green-400' : 'text-gray-600'}>
            ● Environment
          </span>
          <span className={riskComplete ? 'text-orange-400' : 'text-gray-600'}>
            ● Risk
          </span>
          <span className={audienceComplete ? 'text-pink-400' : 'text-gray-600'}>
            ● Audience
          </span>
        </div>
      </div>
    </div>
  );
}
