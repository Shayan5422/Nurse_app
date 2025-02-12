import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class VoiceRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private baseUrl = 'http://127.0.0.1:8001';
  private token: string | null = null;
  private sessionId: string;
  private chunkNumber = 0;
  private chunkDuration = 10000; // 10 seconds in milliseconds
  private processingChunks = true;
  private selectedModel = 'openai/whisper-large-v3-turbo';

  transcriptionComplete = new Subject<string>();
  transcriptionUpdate = new Subject<string>();
  recordingLevel = new Subject<number>();

  constructor(private http: HttpClient) {
    this.sessionId = Date.now().toString();
  }

  async login() {
    try {
      const formData = new URLSearchParams();
      formData.append('username', 'admin');
      formData.append('password', '1234');

      const response = await fetch(`${this.baseUrl}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.token = data.access_token;
      console.log('Login successful, token:', this.token);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async startRecording() {
    try {
      if (!this.token) {
        await this.login();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      
      this.audioChunks = [];
      this.isRecording = true;
      this.processingChunks = true;
      this.chunkNumber = 0;
      this.sessionId = Date.now().toString();

      let chunkStartTime = Date.now();
      let currentChunk: Blob[] = [];

      // Handle audio data as it becomes available
      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          currentChunk.push(event.data);
          
          // Calculate audio level
          const audioData = await event.data.arrayBuffer();
          const audioBuffer = await new AudioContext().decodeAudioData(audioData);
          const channelData = audioBuffer.getChannelData(0);
          const level = Math.max(...channelData.map(Math.abs));
          this.recordingLevel.next(level);

          // Check if it's time to process the chunk
          if (Date.now() - chunkStartTime >= this.chunkDuration) {
            const chunkBlob = new Blob(currentChunk, { type: 'audio/webm' });
            await this.processChunk(chunkBlob, false);
            currentChunk = [];
            chunkStartTime = Date.now();
          }
        }
      };

      // Handle recording stop
      this.mediaRecorder.onstop = async () => {
        // Process final chunk if any
        if (currentChunk.length > 0) {
          const finalChunk = new Blob(currentChunk, { type: 'audio/webm' });
          await this.processChunk(finalChunk, true);
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        this.processingChunks = false;
      };

      // Start recording with small timeslices for more frequent updates
      this.mediaRecorder.start(100); // Get data every 100ms
    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  private async processChunk(audioBlob: Blob, isFinal: boolean) {
    try {
      if (!this.token) {
        await this.login();
      }

      console.log(`Processing ${isFinal ? 'final' : 'interim'} chunk #${this.chunkNumber}`);
      
      const formData = new FormData();
      formData.append('file', audioBlob, 'chunk.webm');
      formData.append('chunk_number', this.chunkNumber.toString());
      formData.append('session_id', this.sessionId);
      formData.append('is_final', isFinal.toString());
      formData.append('model', this.selectedModel);

      console.log('Sending chunk to server...');
      const response = await fetch(`${this.baseUrl}/process-chunk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        body: formData
      });

      if (!response.ok) {
        console.error('Server response not OK:', response.status, response.statusText);
        if (response.status === 401) {
          console.log('Token expired, attempting to refresh...');
          // Token expired, try to login again
          await this.login();
          // Retry the request
          console.log('Retrying request with new token...');
          const retryResponse = await fetch(`${this.baseUrl}/process-chunk`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.token}`
            },
            body: formData
          });
          
          if (!retryResponse.ok) {
            throw new Error('Transcription failed after token refresh');
          }
          
          const result = await retryResponse.json();
          console.log('Retry response:', result);
          if (isFinal) {
            this.transcriptionComplete.next(result.transcription || '');
          } else {
            this.transcriptionUpdate.next(result.chunk_transcription || '');
          }
          return;
        }
        throw new Error('Transcription failed');
      }

      const result = await response.json();
      console.log('Server response:', result);
      if (isFinal) {
        this.transcriptionComplete.next(result.transcription || '');
      } else {
        this.transcriptionUpdate.next(result.chunk_transcription || '');
      }
      
      this.chunkNumber++;
    } catch (error) {
      console.error('Error during transcription:', error);
      if (isFinal) {
        this.transcriptionComplete.next('');
      }
    }
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  setModel(model: string) {
    this.selectedModel = model;
  }
} 