// src/app/pipes/format-text.pipe.ts

import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'formatText',
  standalone: true,
})
export class FormatTextPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) return value;

    // Remplacer \n par <br>
    let formattedText = value.replace(/\n/g, '<br>');

    // Remplacer **bold** par <strong>bold</strong>
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Remplacer "text" par <strong>text</strong>
    formattedText = formattedText.replace(/"(.*?)"/g, '<strong>$1</strong>');
    // Remplacer ### par <strong></strong> (si nécessaire)
    formattedText = formattedText.replace(/###/g, '<strong></strong>');

    // Ajouter des styles et une image
    const styles = `
      <style>
        
        .formatted-text {
          position: relative;
          display: inline-block;
          padding: 15px;
          border: 2px solid transparent;
          border-radius: 10px;
          animation: rotateGlow 5s linear infinite;
          background-color: #fff;
        }
        .formatted-text-container {
          display: flex;
          align-items: center;
          margin-top: 5px;
        }
        .formatted-text-container img {
          width: 16px;
          height: 16px;
          margin-right: 5px;
        }
        .formatted-text-container span {
          font-size: 0.8em;
          color: gray;
        }
      </style>
    `;

    formattedText = `
      ${styles}
      <div class="formatted-text">
        ${formattedText}
      </div>
      <div class="formatted-text-container">
        
        <span>Généré par AI</span>
      </div>
    `;

    return this.sanitizer.bypassSecurityTrustHtml(formattedText);
  }
}
