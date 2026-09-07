package handler

import (
	"encoding/json"
	"net/http"
)

// Health returns a simple health check response.
func Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":  "ok",
		"service": "vero-backend",
		"version": "1.0.0",
	})
}
