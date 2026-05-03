'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface WisprFlowOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  language?: string[];
  context?: {
    app?: { name: string; type: 'email' | 'ai' | 'other' };
    dictionary_context?: string[];
    user_first_name?: string;
  };
}

interface WisprFlowState {
  isRecording: boolean;
  isConnecting: boolean;
  isProcessing: boolean;
  transcript: string;
  error: string | null;
}

const WISPR_API_KEY = process.env.NEXT_PUBLIC_WISPR_API_KEY || '';
const WISPR_WS_URL = `wss://platform-api.wisprflow.ai/api/v1/dash/ws?api_key=Bearer%20${WISPR_API_KEY}`;
const TARGET_SAMPLE_RATE = 16000;
// Fixed chunk size: 1600 samples at 16kHz = exactly 0.1 seconds (100ms)
const CHUNK_SAMPLES = 1600;
const CHUNK_DURATION = CHUNK_SAMPLES / TARGET_SAMPLE_RATE; // 0.1
const BUFFER_SIZE = 4096; // ScriptProcessor buffer (must be power of 2)

export function useWisprFlow(options: WisprFlowOptions = {}) {
  const [state, setState] = useState<WisprFlowState>({
    isRecording: false,
    isConnecting: false,
    isProcessing: false,
    transcript: '',
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const packetPositionRef = useRef<number>(0);
  // Buffer for RESAMPLED 16kHz audio samples
  const resampledBufferRef = useRef<number[]>([]);
  const optionsRef = useRef(options);
  // Track latest transcript for use in stopRecording
  const latestTranscriptRef = useRef<string>('');
  
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Resample using OfflineAudioContext
  const resampleAudio = useCallback(async (
    inputData: Float32Array, 
    inputSampleRate: number, 
    outputSampleRate: number
  ): Promise<Float32Array> => {
    if (inputSampleRate === outputSampleRate) {
      return inputData;
    }
    
    const offlineCtx = new OfflineAudioContext(
      1, 
      Math.ceil(inputData.length * (outputSampleRate / inputSampleRate)), 
      outputSampleRate
    );
    
    const audioBuffer = offlineCtx.createBuffer(1, inputData.length, inputSampleRate);
    audioBuffer.copyToChannel(new Float32Array(inputData), 0);
    
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    
    const buffer = await offlineCtx.startRendering();
    return buffer.getChannelData(0);
  }, []);

  // Convert Float32 to Int16
  const convertToInt16 = useCallback((floatData: Float32Array): Int16Array => {
    const intData = new Int16Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
      const s = Math.max(-1, Math.min(1, floatData[i]));
      intData[i] = s < 0 ? Math.floor(s * 32768) : Math.floor(s * 32767);
    }
    return intData;
  }, []);

  // Calculate volume (RMS)
  const calculateVolume = useCallback((data: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }, []);

  // Send audio packet to Wispr - MUST be exactly CHUNK_SAMPLES for consistent duration
  const sendAudioPacket = useCallback((int16Data: Int16Array, volume: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (int16Data.length !== CHUNK_SAMPLES) {
      console.warn(`Skipping packet with wrong size: ${int16Data.length} != ${CHUNK_SAMPLES}`);
      return; // Only send complete chunks
    }
    
    const audioBytes = new Uint8Array(int16Data.buffer);
    let binary = '';
    for (let i = 0; i < audioBytes.length; i++) {
      binary += String.fromCharCode(audioBytes[i]);
    }
    const base64Audio = btoa(binary);
    
    wsRef.current.send(JSON.stringify({
      type: 'append',
      position: packetPositionRef.current,
      audio_packets: {
        packets: [base64Audio],
        volumes: [volume],
        packet_duration: CHUNK_DURATION, // Always 0.1 (1600 samples / 16000 Hz)
        audio_encoding: 'wav',
        byte_encoding: 'base64'
      }
    }));
    packetPositionRef.current++;
  }, []);

  // Cleanup resources
  const cleanup = useCallback(async () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
      } catch (e) {
        console.warn('Error closing audio context:', e);
      }
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    if (state.isRecording || state.isConnecting) return;

    if (!WISPR_API_KEY) {
      setState(s => ({ ...s, error: 'Wispr API key not configured' }));
      optionsRef.current.onError?.('Wispr API key not configured');
      return;
    }

    setState(s => ({ ...s, isConnecting: true, error: null, transcript: '' }));
    packetPositionRef.current = 0;
    resampledBufferRef.current = [];
    latestTranscriptRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const inputSampleRate = audioContext.sampleRate;
      console.log('Audio context sample rate:', inputSampleRate);

      const ws = new WebSocket(WISPR_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Wispr Flow WebSocket connected');
        
        ws.send(JSON.stringify({
          type: 'auth',
          access_token: WISPR_API_KEY,
          context: {
            app: optionsRef.current.context?.app || { name: 'Video Rating App', type: 'ai' },
            dictionary_context: optionsRef.current.context?.dictionary_context || [
              'replicability', 'hook', 'payoff', 'pacing', 'originality', 
              'rewatchable', 'skit', 'TikTok', 'subversion', 'absurdist'
            ],
            user_first_name: optionsRef.current.context?.user_first_name || '',
            textbox_contents: { before_text: '', selected_text: '', after_text: '' },
            screenshot: null,
            content_text: null,
            content_html: null,
            conversation: null,
          },
          language: optionsRef.current.language || ['en'],
        }));

        setState(s => ({ ...s, isRecording: true, isConnecting: false }));

        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          
          const inputData = e.inputBuffer.getChannelData(0);
          const floatData = new Float32Array(inputData);
          
          // Resample this chunk and buffer the 16kHz samples
          resampleAudio(floatData, inputSampleRate, TARGET_SAMPLE_RATE)
            .then(resampled => {
              // Add to buffer
              for (let i = 0; i < resampled.length; i++) {
                resampledBufferRef.current.push(resampled[i]);
              }
              
              // Send fixed-size chunks (CHUNK_SAMPLES = 1600 samples = 100ms at 16kHz)
              while (resampledBufferRef.current.length >= CHUNK_SAMPLES) {
                const chunk = new Float32Array(resampledBufferRef.current.slice(0, CHUNK_SAMPLES));
                resampledBufferRef.current = resampledBufferRef.current.slice(CHUNK_SAMPLES);
                
                const intData = convertToInt16(chunk);
                const volume = calculateVolume(chunk);
                sendAudioPacket(intData, volume);
              }
            })
            .catch(err => console.error('Resample error:', err));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Wispr response:', message);

          if (message.status === 'auth') {
            console.log('Wispr authenticated');
          } else if (message.status === 'info') {
            console.log('Wispr info:', message.message);
          } else if (message.status === 'text') {
            const text = message.body?.text || '';
            if (text) {
              latestTranscriptRef.current = text;
              setState(s => ({ ...s, transcript: text }));
              optionsRef.current.onTranscript?.(text, false);
            }
          } else if (message.error) {
            console.error('Wispr error:', message.error);
            setState(s => ({ ...s, error: message.error }));
            optionsRef.current.onError?.(message.error);
          }
        } catch (err) {
          console.error('Failed to parse Wispr response:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('Wispr WebSocket error:', error);
        setState(s => ({ ...s, error: 'Connection failed', isConnecting: false, isRecording: false }));
        optionsRef.current.onError?.('Connection failed');
        cleanup();
      };

      ws.onclose = (event) => {
        console.log('Wispr WebSocket closed:', event.code, event.reason);
        setState(s => ({ ...s, isRecording: false, isProcessing: false }));
      };

    } catch (err) {
      console.error('Failed to start recording:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to access microphone';
      setState(s => ({ ...s, error: errorMsg, isConnecting: false }));
      optionsRef.current.onError?.(errorMsg);
      cleanup();
    }
  }, [state.isRecording, state.isConnecting, resampleAudio, convertToInt16, calculateVolume, sendAudioPacket, cleanup]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (!state.isRecording) return;

    setState(s => ({ ...s, isRecording: false, isProcessing: true }));

    // Discard any remaining buffered audio that's less than a full chunk
    // (sending partial chunks causes packet duration mismatch errors)
    resampledBufferRef.current = [];

    // Send commit
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('Sending commit with', packetPositionRef.current, 'packets');
      wsRef.current.send(JSON.stringify({
        type: 'commit',
        total_packets: packetPositionRef.current,
      }));
    }

    // Clean up audio
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
      } catch (e) {
        console.warn('Error closing audio context:', e);
      }
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Wait for final response
    setTimeout(() => {
      const finalTranscript = latestTranscriptRef.current;
      if (finalTranscript) {
        optionsRef.current.onTranscript?.(finalTranscript, true);
      }
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setState(s => ({ ...s, isProcessing: false }));
      latestTranscriptRef.current = '';
    }, 2000);
  }, [state.isRecording]);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [state.isRecording, startRecording, stopRecording]);

  // Clear error
  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    ...state,
    startRecording,
    stopRecording,
    toggleRecording,
    clearError,
  };
}
