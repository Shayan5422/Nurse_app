// src/app/app.component.ts
import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import de CommonModule
import { FormsModule } from '@angular/forms'; // Import de FormsModule
// Retirer l'importation de HttpClientModule
// import { HttpClientModule } from '@angular/common/http'; // Retiré
import { LlmService } from './llm.service'; // Import du service
import { FormatTextPipe } from './format-text.pipe';
import { VoiceRecorderService } from './voice-recorder.service';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface PatientInfo {
  nom: string;
  age: string;
  genre: string;
  profession: string;
  motif: string;
  histoire: string;
  antecedents: string;
  examen: string;
  biologie: string;
}

interface ResultatsAnalyse {
  gemini: string;
  message: string;
  erreur: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, FormatTextPipe], // Ajouter le pipe ici
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatMessages') private chatMessages!: ElementRef;
  @ViewChild('level_bar') private level_bar!: ElementRef;

  titre = 'Assistant IA Médical';
  userId = 'user_' + Math.random().toString(36).substr(2, 9);
  currentMessage = '';
  chatHistory: ChatMessage[] = [];
  isLoading = false;
  activeTab = 'medical'; // Default to medical form
  chatInitialized = false;
  activeRecordingField: string | null = null;

  patientInfo: PatientInfo = {
    nom: '',
    age: '',
    genre: '',
    profession: '',
    motif: '',
    histoire: '',
    antecedents: '',
    examen: '',
    biologie: ''
  };

  resultats: ResultatsAnalyse = {
    gemini: '',
    message: '',
    erreur: ''
  };

  constructor(
    private llmService: LlmService,
    private voiceRecorder: VoiceRecorderService,
    private ngZone: NgZone
  ) {
    // Handle final transcription
    this.voiceRecorder.transcriptionComplete.subscribe(text => {
      this.ngZone.run(() => {
        console.log('Final transcription received:', text);
        console.log('Active recording field:', this.activeRecordingField);
        if (text && this.activeRecordingField) {
          if (this.activeRecordingField === 'chat') {
            console.log('Setting currentMessage to:', text);
            this.currentMessage = text;
          } else {
            console.log('Setting patientInfo field', this.activeRecordingField, 'to:', text);
            this.patientInfo[this.activeRecordingField as keyof PatientInfo] = text;
          }
          this.activeRecordingField = null;
        } else {
          console.log('No active recording field or empty text');
        }
      });
    });

    // Handle real-time transcription updates
    this.voiceRecorder.transcriptionUpdate.subscribe(text => {
      this.ngZone.run(() => {
        console.log('Real-time transcription update:', text);
        console.log('Active recording field:', this.activeRecordingField);
        if (text && this.activeRecordingField) {
          if (this.activeRecordingField === 'chat') {
            console.log('Setting currentMessage to:', text);
            this.currentMessage = text;
          } else {
            console.log('Setting patientInfo field', this.activeRecordingField, 'to:', text);
            this.patientInfo[this.activeRecordingField as keyof PatientInfo] = text;
          }
        } else {
          console.log('No active recording field or empty text');
        }
      });
    });

    // Handle recording level updates
    this.voiceRecorder.recordingLevel.subscribe(level => {
      console.log('Recording level:', level);
      if (this.activeRecordingField && this.level_bar) {
        this.level_bar.nativeElement.value = Math.floor(level * 100);
      }
    });
  }

  ngOnInit() {
    this.chargerHistorique();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.chatMessages && this.chatMessages.nativeElement) {
        this.chatMessages.nativeElement.scrollTop = this.chatMessages.nativeElement.scrollHeight;
      }
    } catch(err) {
      console.error('Erreur lors du scroll:', err);
    }
  }

  async chargerHistorique() {
    try {
      const reponse = await this.llmService.obtenirHistorique(this.userId).toPromise();
      if (reponse && reponse.success) {
        this.chatHistory = reponse.history;
        this.chatInitialized = this.chatHistory.length > 0;
      }
    } catch (erreur) {
      console.error('Erreur lors du chargement de l\'historique:', erreur);
    }
  }

  async envoyerMessage() {
    if (!this.currentMessage.trim()) return;

    this.isLoading = true;
    try {
      const reponse = await this.llmService.chat(this.userId, this.currentMessage).toPromise();
      if (reponse && reponse.success) {
        this.chatHistory = reponse.history;
        this.currentMessage = '';
      }
    } catch (erreur) {
      console.error('Erreur lors de l\'envoi du message:', erreur);
    } finally {
      this.isLoading = false;
    }
  }

  async effacerHistorique() {
    try {
      const reponse = await this.llmService.effacerHistorique(this.userId).toPromise();
      if (reponse && reponse.success) {
        this.chatHistory = [];
        this.chatInitialized = false;
        this.activeTab = 'medical';
      }
    } catch (erreur) {
      console.error('Erreur lors de l\'effacement de l\'historique:', erreur);
    }
  }

  async initialiserChat() {
    this.isLoading = true;
    try {
      const reponse = await this.llmService.initialiserChat(this.userId, this.patientInfo).toPromise();
      if (reponse && reponse.success) {
        this.chatHistory = reponse.history;
        this.chatInitialized = true;
        this.activeTab = 'chat';
      }
    } catch (erreur) {
      console.error('Erreur lors de l\'initialisation du chat:', erreur);
    } finally {
      this.isLoading = false;
    }
  }

  reinitialiser() {
    this.patientInfo = {
      nom: '',
      age: '',
      genre: '',
      profession: '',
      motif: '',
      histoire: '',
      antecedents: '',
      examen: '',
      biologie: ''
    };
    this.resultats = {
      gemini: '',
      message: '',
      erreur: ''
    };
  }

  startRecording(field: string) {
    console.log('Starting recording for field:', field);
    
    if (this.voiceRecorder.isCurrentlyRecording()) {
      console.log('Already recording, stopping first');
      this.stopRecording();
      return;
    }

    this.activeRecordingField = field;
    console.log('Set activeRecordingField to:', this.activeRecordingField);
    
    this.voiceRecorder.startRecording().catch(error => {
      console.error('Failed to start recording:', error);
      this.activeRecordingField = null;
    });
  }

  stopRecording() {
    console.log('Stopping recording. Current field:', this.activeRecordingField);
    this.voiceRecorder.stopRecording();
    // Don't set activeRecordingField to null here, let the transcription complete handler do it
  }

  isRecording(field: string): boolean {
    return this.activeRecordingField === field && this.voiceRecorder.isCurrentlyRecording();
  }
}