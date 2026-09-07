package handler

import (
	"encoding/json"
	"net/http"

	"vero-backend/internal/model"
)

// ModelsHandler returns the list of available models and their metadata.
type ModelsHandler struct {
	Registry *model.Registry
}

func (h *ModelsHandler) ListModels(w http.ResponseWriter, r *http.Request) {
	names := h.Registry.Names()

	type modelInfo struct {
		Name            string `json:"name"`
		NumLabels       int    `json:"num_labels"`
		FeaturesPerFrame int   `json:"features_per_frame"`
		SequenceLength  int    `json:"sequence_length"`
	}

	models := make([]modelInfo, 0, len(names))
	for _, name := range names {
		b := h.Registry.Get(name)
		if b == nil {
			continue
		}
		models = append(models, modelInfo{
			Name:             name,
			NumLabels:        len(b.Labels.Labels),
			FeaturesPerFrame: b.PreprocessCfg.FeaturesPerFrame,
			SequenceLength:   b.PreprocessCfg.SequenceLength,
		})
	}

	// Metadata is static once models are loaded → let browsers/CDN cache it
	// (caching strategy without the operational cost of Redis at this scale).
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"models": models,
	})
}

func (h *ModelsHandler) GetLabels(w http.ResponseWriter, r *http.Request) {
	modelType := r.PathValue("type")
	if modelType == "" {
		http.Error(w, `{"error":"model type required"}`, http.StatusBadRequest)
		return
	}

	bundle := h.Registry.Get(modelType)
	if bundle == nil {
		http.Error(w, `{"error":"model not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bundle.Labels)
}

func (h *ModelsHandler) GetPreprocessConfig(w http.ResponseWriter, r *http.Request) {
	modelType := r.PathValue("type")
	if modelType == "" {
		http.Error(w, `{"error":"model type required"}`, http.StatusBadRequest)
		return
	}

	bundle := h.Registry.Get(modelType)
	if bundle == nil {
		http.Error(w, `{"error":"model not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bundle.PreprocessCfg)
}
