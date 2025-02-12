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
GEMINI_MODEL = "gemini-1.5-flash"

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
    try:
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

        logger.info(f"Preparing request to Gemini API with prompt length: {len(full_prompt)}")

        payload = {
            "contents": [{
                "parts": [{
                    "text": full_prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "topK": 40,
                "topP": 0.95,
                "maxOutputTokens": 1024,
            },
            "safetySettings": [{
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_MEDIUM_AND_ABOVE"
            }]
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            logger.info("Sending request to Gemini API...")
            response = await client.post(url, headers=headers, json=payload)
            
            if response.status_code != 200:
                logger.error(f"Gemini API returned non-200 status code: {response.status_code}")
                logger.error(f"Response content: {response.text}")
                return "Erreur de communication avec le service IA. Veuillez réessayer."

            data = response.json()
            logger.info("Successfully received response from Gemini API")

            if "candidates" in data and len(data["candidates"]) > 0:
                candidate = data["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    return candidate["content"]["parts"][0]["text"]
                else:
                    logger.error(f"Unexpected response structure: {data}")
                    return "Format de réponse inattendu du service IA."
            else:
                logger.error(f"No candidates in response: {data}")
                return "Pas de réponse générée par le service IA."

    except httpx.TimeoutException:
        logger.error("Request to Gemini API timed out")
        return "Le service IA met trop de temps à répondre. Veuillez réessayer."
    except httpx.HTTPStatusError as http_err:
        logger.error(f"HTTP error occurred: {http_err} - Response: {http_err.response.text}")
        return "Il y a eu un problème de communication avec le service IA."
    except json.JSONDecodeError as json_err:
        logger.error(f"Failed to parse JSON response: {json_err}")
        return "Erreur lors de l'analyse de la réponse du service IA."
    except Exception as e:
        logger.error(f"Unexpected error in send_prompt_to_gemini: {str(e)}", exc_info=True)
        return "Une erreur inattendue s'est produite lors de la communication avec le service IA."

@app.route('/api/chat/init', methods=['POST'])
async def initialize_chat():
    """
    Initialize chat with medical context
    """
    try:
        data = request.json
        if not data:
            logger.error("No JSON data received in request")
            return jsonify({
                'success': False,
                'message': 'Données JSON manquantes dans la requête.',
            }), 400

        user_id = data.get('userId')
        if not user_id:
            logger.error("No userId provided in request")
            return jsonify({
                'success': False,
                'message': 'ID utilisateur manquant.',
            }), 400

        patient_info = data.get('patientInfo')
        if not patient_info:
            logger.error("No patientInfo provided in request")
            return jsonify({
                'success': False,
                'message': 'Informations du patient manquantes.',
            }), 400

        logger.info(f"Initializing chat for user {user_id}")
        
        # Create medical context
        medical_context = f"""
Patient :
- Nom : {patient_info.get('nom', '')}
- Âge : {patient_info.get('age', '')} ans
- Genre : {patient_info.get('genre', '')}
- Profession : {patient_info.get('profession', '')}

Consultation :
- Motif : {patient_info.get('motif', '')}
- Histoire de la maladie : {patient_info.get('histoire', '')}
- Antécédents médicaux : {patient_info.get('antecedents', '')}
- Examen clinique : {patient_info.get('examen', '')}
- Biologie sanguine : {patient_info.get('biologie', '')}
"""
        
        logger.info("Medical context created successfully")
        
        # Store medical context
        medical_contexts[user_id] = medical_context
        
        # Initialize chat history
        chat_histories[user_id] = []
        
        # Get initial analysis from Gemini
        initial_prompt = f"""
Je suis infirmier exerçant dans un village en Afrique, où l'accès aux ressources médicales est limité. J'utilise des outils de diagnostic de base tels qu'un électrocardiogramme simplifié (via de petites plaquettes) et un appareil de biologie économique capable d'effectuer 24 examens pour 3 euros à partir d'un petit échantillon de sang.

Je fais face à un cas clinique complexe et j'ai besoin de votre expertise pour établir un diagnostic précis et proposer un plan de traitement adapté.

Présentation du patient :

{medical_context}

Proposez un diagnostic différentiel en tenant compte du contexte local et des outils disponibles.
Suggérez un plan de traitement adapté, en prenant en considération les limitations en ressources et les particularités du patient.
Si des informations supplémentaires sont nécessaires pour affiner l'analyse, merci de m'indiquer précisément lesquelles.
Veuillez ajouter un score de probabilité pour chaque diagnostic, principal et différentielles.
Merci de m'aider à gérer ce cas complexe de manière optimale.
"""
        
        logger.info("Sending initial prompt to Gemini")
        initial_response = await send_prompt_to_gemini(initial_prompt)
        logger.info("Received response from Gemini")
        
        # Add initial exchange to chat history
        current_time = datetime.now().isoformat()
        chat_histories[user_id].extend([
            {
                'role': 'system',
                'content': 'Analyse initiale du dossier médical',
                'timestamp': current_time
            },
            {
                'role': 'assistant',
                'content': initial_response,
                'timestamp': current_time
            }
        ])
        
        logger.info("Chat initialized successfully")
        return jsonify({
            'success': True,
            'history': chat_histories[user_id],
            'message': 'Chat médical initialisé avec succès'
        })

    except Exception as e:
        logger.error(f"Error initializing chat: {str(e)}", exc_info=True)
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