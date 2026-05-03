'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useWisprFlow } from '@/lib/hooks/useWisprFlow';

interface VoiceInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
}

export function VoiceInput({
  value,
  onChange,
  placeholder = 'Type or dictate...',
  className = '',
  rows = 3,
  disabled = false,
}: VoiceInputProps) {
  // Track streaming transcript - this shows what Wispr is sending in real-time
  const [streamingText, setStreamingText] = useState('');
  // Track if we're showing combined text (value + streaming)
  const [showCombined, setShowCombined] = useState(false);
  // Remember value when we started recording
  const startValueRef = useRef('');
  
  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    console.log('[VoiceInput] Transcript:', { text, isFinal });
    
    if (isFinal && text) {
      // Final transcript - commit to parent
      const separator = startValueRef.current && !startValueRef.current.endsWith(' ') ? ' ' : '';
      const newValue = startValueRef.current + separator + text;
      console.log('[VoiceInput] Committing final value:', newValue);
      onChange(newValue);
      // Keep showing combined until parent updates
      setStreamingText(text);
    } else if (text) {
      // Streaming update
      setStreamingText(text);
    }
  }, [onChange]);
  
  const {
    isRecording,
    isConnecting,
    isProcessing,
    error,
    toggleRecording,
    clearError,
  } = useWisprFlow({
    onTranscript: handleTranscript,
    context: {
      app: { name: 'Video Rating Tool', type: 'other' },
      dictionary_context: [
        'replicability', 'hook', 'payoff', 'pacing', 'originality',
        'rewatchable', 'skit', 'TikTok', 'subversion', 'absurdist',
        'premise', 'execution', 'timing', 'editing', 'thumbnail',
        'CTA', 'call to action', 'engagement', 'viral', 'trend'
      ],
    },
  });

  // Track recording state changes
  useEffect(() => {
    if (isRecording || isConnecting) {
      setShowCombined(true);
    }
  }, [isRecording, isConnecting]);

  // When value updates and matches what we expect, clear streaming state
  useEffect(() => {
    if (streamingText && !isRecording && !isProcessing) {
      const expectedValue = startValueRef.current + 
        (startValueRef.current && !startValueRef.current.endsWith(' ') ? ' ' : '') + 
        streamingText;
      
      // If parent value contains the streaming text, we can clear it
      if (value.includes(streamingText) || value === expectedValue) {
        console.log('[VoiceInput] Parent updated, clearing streaming state');
        setStreamingText('');
        setShowCombined(false);
      }
    }
  }, [value, streamingText, isRecording, isProcessing]);

  // Handle starting recording
  const handleMicClick = useCallback(() => {
    if (!isRecording && !isConnecting) {
      // Starting a new recording
      startValueRef.current = value;
      setStreamingText('');
      clearError();
    }
    toggleRecording();
  }, [isRecording, isConnecting, value, toggleRecording, clearError]);

  // Compute display value
  const displayValue = showCombined && streamingText
    ? startValueRef.current + (startValueRef.current && !startValueRef.current.endsWith(' ') ? ' ' : '') + streamingText
    : value;

  // Handle manual text input
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isRecording && !isProcessing) {
      onChange(e.target.value);
    }
  };

  return (
    <div className="relative">
      <textarea
        value={displayValue}
        onChange={handleTextChange}
        placeholder={placeholder}
        className={`${className} ${isRecording ? 'pr-14 bg-red-50/50' : 'pr-14'} ${error ? 'border-red-300' : ''}`}
        rows={rows}
        disabled={disabled || isRecording || isProcessing}
      />
      
      {/* Microphone button */}
      <button
        type="button"
        onClick={handleMicClick}
        disabled={disabled || isConnecting}
        className={`
          absolute right-2 top-2 p-2 rounded-full transition-all duration-200
          ${isRecording 
            ? 'bg-red-500 text-white animate-pulse hover:bg-red-600' 
            : isConnecting
              ? 'bg-gray-300 text-gray-500 cursor-wait'
              : isProcessing
                ? 'bg-yellow-400 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          focus:outline-none focus:ring-2 focus:ring-blue-400
        `}
        title={
          isRecording 
            ? 'Click to stop recording' 
            : isConnecting 
              ? 'Connecting...' 
              : isProcessing
                ? 'Processing speech...'
                : 'Click to start voice input'
        }
      >
        {isConnecting || isProcessing ? (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : isRecording ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
      </button>

      {/* Recording indicator with live waveform hint */}
      {isRecording && (
        <div className="absolute left-2 bottom-2 flex items-center gap-2 text-xs text-red-600 bg-white/80 px-2 py-1 rounded">
          <span className="flex gap-0.5">
            <span className="w-1 h-3 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-4 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          </span>
          Listening... click ■ to stop
        </div>
      )}
      
      {isProcessing && (
        <div className="absolute left-2 bottom-2 flex items-center gap-1 text-xs text-yellow-700 bg-white/80 px-2 py-1 rounded">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Finalizing...
        </div>
      )}

      {/* Error display - clickable to dismiss */}
      {error && (
        <button
          onClick={clearError}
          className="absolute left-0 right-12 -bottom-7 text-xs text-red-600 bg-red-50 px-2 py-1 rounded hover:bg-red-100 text-left truncate"
          title="Click to dismiss"
        >
          ! {error}
        </button>
      )}
    </div>
  );
}
