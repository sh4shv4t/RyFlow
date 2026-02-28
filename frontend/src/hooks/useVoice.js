// Hook for voice recording and Whisper transcription
import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function useVoice() {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [whisperAvailable, setWhisperAvailable] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Checks if Whisper is available on the backend
  const checkWhisper = useCallback(async () => {
    try {
      const res = await axios.get('/api/voice/status');
      setWhisperAvailable(res.data.available);
      return res.data.available;
    } catch {
      setWhisperAvailable(false);
      return false;
    }
  }, []);

  // Starts recording audio from the microphone
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);

      // Auto-stop after 60 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
        }
      }, 60000);
    } catch (err) {
      toast.error('Could not access microphone');
      console.error('[Voice] Mic error:', err);
    }
  }, []);

  // Stops recording and sends audio to Whisper for transcription
  const stopRecording = useCallback(async (workspaceId = null) => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        setRecording(false);
        setTranscribing(true);

        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('audio', blob, 'recording.wav');
        if (workspaceId) formData.append('workspace_id', workspaceId);

        try {
          const res = await axios.post('/api/voice/transcribe', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });

          if (res.data.fallback) {
            toast('Whisper not available — please type manually', { icon: '🎙️' });
            setTranscript('');
            resolve(null);
          } else {
            setTranscript(res.data.transcript);
            toast.success('Transcription complete!');
            resolve(res.data.transcript);
          }
        } catch (err) {
          toast.error('Transcription failed');
          resolve(null);
        } finally {
          setTranscribing(false);
        }

        // Stop all tracks
        mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  return {
    recording,
    transcribing,
    transcript,
    setTranscript,
    whisperAvailable,
    checkWhisper,
    startRecording,
    stopRecording
  };
}
