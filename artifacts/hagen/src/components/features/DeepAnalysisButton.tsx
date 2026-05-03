'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface DeepAnalysisButtonProps {
  videoId: string;
  onComplete?: (analysis: any) => void;
}

export function DeepAnalysisButton({ videoId, onComplete }: DeepAnalysisButtonProps) {
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  const checkConfiguration = async () => {
    try {
      const response = await fetch('/api/videos/analyze/deep');
      const data = await response.json();
      setConfigured(data.available);
      
      if (!data.available) {
        setError(`Setup required: ${data.recommendations.join(', ')}`);
      }
    } catch (err) {
      setConfigured(false);
      setError('Failed to check configuration');
    }
  };

  const runDeepAnalysis = async () => {
    setLoading(true);
    setError(null);
    setProgress('Starting analysis...');

    try {
      setProgress('📥 Downloading video...');
      
      const response = await fetch('/api/videos/analyze/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          detailLevel: 'comprehensive',
          cleanupAfter: true
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Analysis failed');
      }

      const result = await response.json();
      setProgress('Analysis complete!');
      
      if (onComplete) {
        onComplete(result.analysis);
      }

      setTimeout(() => setProgress(''), 3000);

    } catch (err) {
      console.error('Deep analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  // Check configuration on mount
  if (configured === null) {
    checkConfiguration();
  }

  if (configured === false) {
    return (
      <Card className="p-4 bg-yellow-50 border-yellow-200">
        <div className="flex items-start gap-3">
          <span className="text-2xl">...</span>
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-1">
              Deep Analysis Not Configured
            </h3>
            <p className="text-sm text-yellow-800 mb-2">{error}</p>
            <a
              href="/DEEP_ANALYSIS_SETUP.md"
              target="_blank"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              View Setup Guide →
            </a>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={runDeepAnalysis}
        disabled={loading}
        variant="secondary"
        className="w-full"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <LoadingSpinner size="sm" />
            Analyzing with Gemini...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span>🤖</span>
            Run Deep Video Analysis
          </span>
        )}
      </Button>

      {progress && (
        <p className="text-sm text-gray-600 text-center">
          {progress}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 text-center">
          {error}
        </p>
      )}

      <p className="text-xs text-gray-500 text-center">
        Downloads video, analyzes with Gemini AI (~20-30 seconds)
      </p>
    </div>
  );
}
