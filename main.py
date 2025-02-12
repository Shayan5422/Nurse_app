from flask import Flask, request, jsonify
from flask_cors import CORS
import json
from asgiref.wsgi import WsgiToAsgi
import os
import logging
import httpx
from typing import Dict, List
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Convert Flask app to ASGI
asgi_app = WsgiToAsgi(app)

# Configuration
GEMINI_API_KEY = "AIzaSyDmWMrbqJN1K9ACefNKTl5xmWaOLAO0Zt8"
GEMINI_MODEL = "gemini-2.0-flash"

# Set up logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Store chat histories and medical contexts for different users
chat_histories: Dict[str, List[Dict]] = {}
medical_contexts: Dict[str, str] = {}

async def send_prompt_to_gemini(prompt: str, medical_context: str = None) -> str:
    """
    Sends a prompt to Gemini and returns the response.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    headers = {
        'Content-Type': 'application/json'
    }
    
    # Prepare the full prompt with medical context if available
    full_prompt = ""
    if medical_context:
        full_prompt = f"""Contexte médical du patient:
{medical_context}

Question ou commentaire actuel:
{prompt}

En tant que professionnel de santé, veuillez répondre à cette question en tenant compte du contexte médical fourni. 
Si vous avez besoin de clarifications, n'hésitez pas à poser des questions spécifiques."""
    else:
        full_prompt = prompt

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": full_prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "topK": 40,
            "topP": 0.95,
            "maxOutputTokens": 1024,
        },
        "safetySettings": [
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

            if "candidates" in data and len(data["candidates"]) > 0:
                candidate = data["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    return candidate["content"]["parts"][0]["text"]
            
            return "Je n'ai pas pu générer une réponse."

    except httpx.HTTPStatusError as http_err:
        logger.error(f"HTTP error occurred: {http_err} - Response: {http_err.response.text}")
        return "Il y a eu un problème de communication avec le service IA."
    except Exception as e:
        logger.error(f"An error occurred: {e}")
        return "Une erreur inattendue s'est produite."

@app.route('/api/chat/init', methods=['POST'])
async def initialize_chat():
    """
    Initialize chat with medical context
    """
    try:
        data = request.json
        user_id = data.get('userId', 'default')
        patient_info = data.get('patientInfo', {})
        
        # Create medical context
        medical_context = f"""
Patient :
- Nom : {patient_info.get('nom', '')}
- Âge : {patient_info.get('age', '')} ans
- Profession : {patient_info.get('profession', '')}

Consultation :
- Motif : {patient_info.get('motif', '')}
- Histoire de la maladie : {patient_info.get('histoire', '')}
- Antécédents médicaux : {patient_info.get('antecedents', '')}
- Examen clinique : {patient_info.get('examen', '')}
- Biologie sanguine : {patient_info.get('biologie', '')}
"""
        
        # Store medical context
        medical_contexts[user_id] = medical_context
        
        # Initialize chat history
        chat_histories[user_id] = []
        
        # Get initial analysis from Gemini
        initial_prompt = f"""
En tant que professionnel de santé, analysez les informations suivantes et fournissez une évaluation initiale :

{medical_context}

Veuillez fournir :
1. Une analyse des symptômes principaux
2. Les examens complémentaires recommandés
3. Les diagnostics différentiels possibles
4. Les recommandations de traitement immédiates
5. Le plan de suivi suggéré

Terminez en demandant si le patient ou le professionnel de santé a des questions spécifiques sur l'analyse.
"""
        
        initial_response = await send_prompt_to_gemini(initial_prompt)
        
        # Add initial exchange to chat history
        chat_histories[user_id].extend([
            {
                'role': 'system',
                'content': 'Analyse initiale du dossier médical',
                'timestamp': datetime.now().isoformat()
            },
            {
                'role': 'assistant',
                'content': initial_response,
                'timestamp': datetime.now().isoformat()
            }
        ])
        
        return jsonify({
            'success': True,
            'history': chat_histories[user_id],
            'message': 'Chat médical initialisé avec succès'
        })

    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation du chat : {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Une erreur est survenue lors de l\'initialisation du chat.',
            'error': str(e)
        }), 500

@app.route('/api/chat', methods=['POST'])
async def chat():
    """
    Handle ongoing chat conversation
    """
    try:
        data = request.json
        user_id = data.get('userId', 'default')
        message = data.get('message', '')
        
        if not message:
            return jsonify({
                'success': False,
                'message': 'Le message ne peut pas être vide.'
            }), 400

        # Get medical context for this user
        medical_context = medical_contexts.get(user_id)

        # Initialize chat history if needed
        if user_id not in chat_histories:
            chat_histories[user_id] = []

        # Add user message to history
        chat_histories[user_id].append({
            'role': 'user',
            'content': message,
            'timestamp': datetime.now().isoformat()
        })

        # Get response from Gemini with medical context
        response = await send_prompt_to_gemini(message, medical_context)

        # Add assistant response to history
        chat_histories[user_id].append({
            'role': 'assistant',
            'content': response,
            'timestamp': datetime.now().isoformat()
        })

        # Keep only last 20 messages in history
        if len(chat_histories[user_id]) > 20:
            chat_histories[user_id] = chat_histories[user_id][-20:]

        return jsonify({
            'success': True,
            'response': response,
            'history': chat_histories[user_id]
        })

    except Exception as e:
        logger.error(f"Erreur lors du chat : {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Une erreur est survenue lors du traitement du message.',
            'error': str(e)
        }), 500

@app.route('/api/chat/history', methods=['GET'])
async def get_chat_history():
    """
    Get chat history for a user
    """
    user_id = request.args.get('userId', 'default')
    return jsonify({
        'success': True,
        'history': chat_histories.get(user_id, [])
    })

@app.route('/api/chat/clear', methods=['POST'])
async def clear_chat_history():
    """
    Clear chat history for a user
    """
    try:
        data = request.json
        user_id = data.get('userId', 'default')
        
        if user_id in chat_histories:
            chat_histories[user_id] = []
        if user_id in medical_contexts:
            del medical_contexts[user_id]
        
        return jsonify({
            'success': True,
            'message': 'Historique de conversation effacé avec succès.'
        })

    except Exception as e:
        logger.error(f"Erreur lors de l'effacement de l'historique : {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Une erreur est survenue lors de l\'effacement de l\'historique.',
            'error': str(e)
        }), 500

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(asgi_app, host='0.0.0.0', port=8000)