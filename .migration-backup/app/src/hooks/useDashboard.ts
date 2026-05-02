import { useState } from 'react';
import type { UIConcept } from '@/lib/constants/dashboard';

type DashboardView = 'payment' | 'home' | 'preview' | 'brief' | null;

export function useDashboard(initialDemoMode: boolean) {
  const [isDemoMode, setIsDemoMode] = useState(initialDemoMode);
  const [currentView, setCurrentView] = useState<DashboardView>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<UIConcept | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('growth');
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [conceptsUsed, setConceptsUsed] = useState(1);
  const [selectedDemoProfile, setSelectedDemoProfile] = useState<string>('cafe');
  const [bottomBarHovered, setBottomBarHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  return {
    isDemoMode,
    setIsDemoMode,
    currentView,
    setCurrentView,
    showProfileMenu,
    setShowProfileMenu,
    selectedConcept,
    setSelectedConcept,
    selectedPlan,
    setSelectedPlan,
    profileExpanded,
    setProfileExpanded,
    conceptsUsed,
    setConceptsUsed,
    selectedDemoProfile,
    setSelectedDemoProfile,
    bottomBarHovered,
    setBottomBarHovered,
    isMobile,
    setIsMobile,
  };
}
