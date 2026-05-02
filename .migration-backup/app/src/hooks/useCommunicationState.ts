import { useState } from 'react';
import { DEFAULT_WEEKLY_SUMMARY_PREFERENCES } from '@/lib/email/helpers';
import type { WeeklySummaryPreferences } from '@/lib/email/types';
import type { EmailJobEntry } from '@/types/studio-v2';
import type { EmailScheduleRecord } from '@/components/studio/customer-detail/shared';
import type { InlineFeedback } from '@/components/studio/customer-detail/feedTypes';

type PendingEmailPrompt = {
  title: string;
  description: string;
  emailType: string;
  conceptIds?: string[];
  actionLabel: string;
};

export function useCommunicationState() {
  const [emailType, setEmailType] = useState('new_concept');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailIntro, setEmailIntro] = useState('');
  const [emailOutro, setEmailOutro] = useState('');
  const [selectedConceptIds, setSelectedConceptIds] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [previewingEmail, setPreviewingEmail] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{ subject: string; html: string } | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [emailJobs, setEmailJobs] = useState<EmailJobEntry[]>([]);
  const [retryingEmailJobId, setRetryingEmailJobId] = useState<string | null>(null);
  const [communicationFeedback, setCommunicationFeedback] = useState<InlineFeedback | null>(null);
  const [weeklySchedule, setWeeklySchedule] = useState<EmailScheduleRecord | null>(null);
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(1);
  const [scheduleSendTime, setScheduleSendTime] = useState('09:00');
  const [scheduleSubject, setScheduleSubject] = useState('Veckouppdatering - LeTrend');
  const [scheduleIntro, setScheduleIntro] = useState('Hej! Har ar veckans sammanfattning:');
  const [scheduleOutro, setScheduleOutro] = useState('Med vanliga halsningar,\nLeTrend');
  const [scheduleActive, setScheduleActive] = useState(true);
  const [scheduleRules, setScheduleRules] = useState<WeeklySummaryPreferences>(DEFAULT_WEEKLY_SUMMARY_PREFERENCES);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [previewingSchedule, setPreviewingSchedule] = useState(false);
  const [schedulePreview, setSchedulePreview] = useState<{ subject: string; html: string } | null>(null);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [scheduleFeedback, setScheduleFeedback] = useState<InlineFeedback | null>(null);
  const [pendingEmailPrompt, setPendingEmailPrompt] = useState<PendingEmailPrompt | null>(null);

  const openEmailComposer = (nextEmailType: string, conceptIds: string[] = []) => {
    setEmailType(nextEmailType);
    setSelectedConceptIds(Array.from(new Set(conceptIds)));
    setEmailPreview(null);
    setShowEmailPreview(false);
    setPendingEmailPrompt(null);
  };

  return {
    emailType,
    setEmailType,
    emailSubject,
    setEmailSubject,
    emailIntro,
    setEmailIntro,
    emailOutro,
    setEmailOutro,
    selectedConceptIds,
    setSelectedConceptIds,
    sendingEmail,
    setSendingEmail,
    previewingEmail,
    setPreviewingEmail,
    emailPreview,
    setEmailPreview,
    showEmailPreview,
    setShowEmailPreview,
    emailJobs,
    setEmailJobs,
    retryingEmailJobId,
    setRetryingEmailJobId,
    communicationFeedback,
    setCommunicationFeedback,
    weeklySchedule,
    setWeeklySchedule,
    scheduleDayOfWeek,
    setScheduleDayOfWeek,
    scheduleSendTime,
    setScheduleSendTime,
    scheduleSubject,
    setScheduleSubject,
    scheduleIntro,
    setScheduleIntro,
    scheduleOutro,
    setScheduleOutro,
    scheduleActive,
    setScheduleActive,
    scheduleRules,
    setScheduleRules,
    savingSchedule,
    setSavingSchedule,
    deletingSchedule,
    setDeletingSchedule,
    previewingSchedule,
    setPreviewingSchedule,
    schedulePreview,
    setSchedulePreview,
    showSchedulePreview,
    setShowSchedulePreview,
    scheduleFeedback,
    setScheduleFeedback,
    pendingEmailPrompt,
    setPendingEmailPrompt,
    openEmailComposer,
  };
}
