from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import tensorflow as tf
import os
import string

app = FastAPI(title="VERO AI Microservice", version="1.0.0")

# Abjad labels (0-25 map to A-Z)
LABELS = list(string.ascii_uppercase)

class PredictRequest(BaseModel):
    frames: list[list[float]] # Expected shape [30, 212]

# Load models at startup to avoid reloading per request
models = {}

@app.on_event("startup")
async def load_models():
    base_dir = r"C:\laragon\www\vero_learning_management_system\dataset"
    bisindo_path = os.path.join(base_dir, "BISINDO", "BISINDO-Abjad", "bisindo_abjad_final.keras")
    sibi_path = os.path.join(base_dir, "SIBI", "SIBI-Abjad", "sibi_model_final.keras")
    
    try:
        models["bisindo"] = tf.keras.models.load_model(bisindo_path)
        print("BISINDO model loaded successfully.")
    except Exception as e:
        print(f"Failed to load BISINDO model: {e}")
        
    try:
        models["sibi"] = tf.keras.models.load_model(sibi_path)
        print("SIBI model loaded successfully.")
    except Exception as e:
        print(f"Failed to load SIBI model: {e}")

@app.post("/predict/{tipe_isyarat}")
async def predict(tipe_isyarat: str, request: PredictRequest):
    if tipe_isyarat not in ["sibi", "bisindo"]:
        raise HTTPException(status_code=400, detail="tipe_isyarat must be 'sibi' or 'bisindo'")
        
    if tipe_isyarat not in models:
        raise HTTPException(status_code=500, detail=f"Model {tipe_isyarat} is not loaded on the server")
        
    model = models[tipe_isyarat]
    
    # Convert input to numpy array
    try:
        frames_arr = np.array(request.frames, dtype=np.float32)
        # Expected shape: (30, 212)
        if frames_arr.shape != (30, 212):
            raise ValueError(f"Expected shape (30, 212), got {frames_arr.shape}")
            
        # Add batch dimension: (1, 30, 212)
        input_data = np.expand_dims(frames_arr, axis=0)
        
        # Predict
        predictions = model.predict(input_data, verbose=0)
        
        # Get highest probability
        predicted_idx = np.argmax(predictions[0])
        confidence = float(predictions[0][predicted_idx])
        
        # Map to label
        huruf = LABELS[predicted_idx] if predicted_idx < len(LABELS) else "?"
        
        return {
            "huruf": huruf,
            "confidence": confidence
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "ok", "loaded_models": list(models.keys())}
