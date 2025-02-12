// src/app/llm.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class LlmService {
  private apiUrl = 'http://127.0.0.1:8000/api';

  constructor(private http: HttpClient) { }

  initialiserChat(userId: string, patientInfo: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/chat/init`, {
      userId,
      patientInfo
    }).pipe(
      catchError(this.gererErreur)
    );
  }

  chat(userId: string, message: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/chat`, {
      userId,
      message
    }).pipe(
      catchError(this.gererErreur)
    );
  }

  obtenirHistorique(userId: string): Observable<any> {
    const params = new HttpParams().set('userId', userId);
    return this.http.get<any>(`${this.apiUrl}/chat/history`, { params }).pipe(
      catchError(this.gererErreur)
    );
  }

  effacerHistorique(userId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/chat/clear`, {
      userId
    }).pipe(
      catchError(this.gererErreur)
    );
  }

  private gererErreur(erreur: HttpErrorResponse) {
    let messageErreur = 'Une erreur est survenue lors de la communication avec le serveur.';
    
    if (erreur.error instanceof ErrorEvent) {
      // Erreur côté client
      messageErreur = `Erreur: ${erreur.error.message}`;
    } else {
      // Erreur côté serveur
      messageErreur = `Code d'erreur ${erreur.status}: ${erreur.error.message || erreur.statusText}`;
    }
    
    console.error(messageErreur);
    return throwError(() => messageErreur);
  }
}
