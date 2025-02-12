// src/app/app.component.ts
import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import de CommonModule
import { FormsModule } from '@angular/forms'; // Import de FormsModule
// Retirer l'importation de HttpClientModule
// import { HttpClientModule } from '@angular/common/http'; // Retiré
import { LlmService } from './llm.service'; // Import du service
import { FormatTextPipe } from './format-text.pipe';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface PatientInfo {
  nom: string;
  age: string;
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

  titre = 'Assistant IA Médical';
  userId = 'user_' + Math.random().toString(36).substr(2, 9);
  currentMessage = '';
  chatHistory: ChatMessage[] = [];
  isLoading = false;
  activeTab = 'medical'; // Default to medical form
  chatInitialized = false;

  patientInfo: PatientInfo = {
    nom: '',
    age: '',
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

  constructor(private llmService: LlmService) {}

  ngOnInit() {
    this.chargerHistorique();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      this.chatMessages.nativeElement.scrollTop = this.chatMessages.nativeElement.scrollHeight;
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
}