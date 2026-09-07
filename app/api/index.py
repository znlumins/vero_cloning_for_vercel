# api/index.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import math
import os

app = Flask(__name__)
CORS(app)

curr_dir = os.path.dirname(os.path.abspath(__file__))

# LOAD MODEL
models = {'bisindo': None, 'sibi': None}

def load_models():
    # Model Bisindo (420 fitur)
    path_bisindo = os.path.join(curr_dir, 'model_bisindo.pkl')
    if os.path.exists(path_bisindo):
        with open(path_bisindo, 'rb') as f:
            models['bisindo'] = pickle.load(f)
            print("✅ Model BISINDO Loaded (420 Features)")

    # Model SIBI (210 fitur) - Pastikan file namanya ini
    path_sibi = os.path.join(curr_dir, 'model_sibi.pkl') 
    if os.path.exists(path_sibi):
        with open(path_sibi, 'rb') as f:
            models['sibi'] = pickle.load(f)
            print("✅ Model SIBI Loaded (210 Features)")

load_models()

def calculate_distances(landmarks):
    # Logika hitung jarak yang sama untuk keduanya
    points = [(lm['x'], lm['y'], lm['z']) for lm in landmarks]
    distances = []
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            p1, p2 = points[i], points[j]
            dist = math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2 + (p1[2]-p2[2])**2)
            distances.append(dist)
    max_dist = max(distances) if distances else 1
    return [d / max_dist for d in distances]

@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.json
    model_type = data.get('model_type', 'bisindo')
    landmarks_list = data.get('landmarks_list', [])
    handedness_list = data.get('handedness_list', [])
    
    if not landmarks_list:
        return jsonify({"label": "--"})

    selected_model = models.get(model_type)
    if selected_model is None:
        return jsonify({"label": "Model Error"}), 500

    try:
        # --- LOGIKA SIBI (1 TANGAN - 210 FITUR) ---
        if model_type == 'sibi':
            # Ambil tangan pertama yang terdeteksi
            features = calculate_distances(landmarks_list[0])
            prediction = selected_model.predict([features])[0]
        
        # --- LOGIKA BISINDO (2 TANGAN - 420 FITUR) ---
        else:
            full_features = [0.0] * 420
            for idx, landmarks in enumerate(landmarks_list):
                if idx >= len(handedness_list): break
                label = handedness_list[idx]['label']
                features = calculate_distances(landmarks)
                if label == 'Left':
                    full_features[0:210] = features
                else:
                    full_features[210:420] = features
            prediction = selected_model.predict([full_features])[0]

        return jsonify({"label": str(prediction)})
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"label": "Error"}), 500

if __name__ == "__main__":
    app.run(host='127.0.0.1', port=5000)