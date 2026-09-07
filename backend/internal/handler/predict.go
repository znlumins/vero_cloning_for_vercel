package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"vero-backend/internal/model"
)

// PredictHandler handles sign language gesture prediction requests.
type PredictHandler struct {
	Registry *model.Registry
}

// PredictRequest is the JSON body from the frontend.
type PredictRequest struct {
	ModelType string      `json:"model_type"` // "sibi" or "bisindo"
	Frames    [][]float64 `json:"frames"`     // [sequence_length][features_per_frame]
}

// PredictResponse is the JSON response to the frontend.
type PredictResponse struct {
	Label      string             `json:"label"`
	Confidence float64            `json:"confidence"`
	TopK       []model.LabelScore `json:"top_k,omitempty"`
	ModelType  string             `json:"model_type"`
}

func (h *PredictHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req PredictRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid JSON: %s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	if req.ModelType == "" {
		req.ModelType = "bisindo"
	}

	bundle := h.Registry.Get(req.ModelType)
	if bundle == nil {
		http.Error(w, fmt.Sprintf(`{"error":"model %q not found"}`, req.ModelType), http.StatusNotFound)
		return
	}

	if len(req.Frames) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(PredictResponse{
			Label:      "--",
			Confidence: 0,
			ModelType:  req.ModelType,
		})
		return
	}

	// Validate feature dimension
	expectedFeats := bundle.PreprocessCfg.FeaturesPerFrame
	for i, frame := range req.Frames {
		if len(frame) != expectedFeats {
			http.Error(w, fmt.Sprintf(`{"error":"frame %d has %d features, expected %d"}`,
				i, len(frame), expectedFeats), http.StatusBadRequest)
			return
		}
	}

	result, err := model.Predict(bundle, req.Frames)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"prediction failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(PredictResponse{
		Label:      result.Label,
		Confidence: result.Confidence,
		TopK:       result.TopK,
		ModelType:  req.ModelType,
	})
}
