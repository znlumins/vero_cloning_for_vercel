package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// PredictWSRequest is the JSON payload received from Next.js over WebSocket
type PredictWSRequest struct {
	Type     string      `json:"type"`     // Should be "predict"
	Model    string      `json:"model"`    // "sibi" or "bisindo"
	Sequence [][]float64 `json:"sequence"` // Array of shape [30, 212]
}

// PredictWSResponse is the JSON payload sent back to Next.js
type PredictWSResponse struct {
	Type       string  `json:"type"`       // "result"
	Huruf      string  `json:"huruf"`      // "A", "B", etc.
	Confidence float64 `json:"confidence"` // Probability
	Error      string  `json:"error,omitempty"`
}

// PythonPredictRequest is the structure sent to the Python FastAPI microservice
type PythonPredictRequest struct {
	Frames [][]float64 `json:"frames"`
}

// PythonPredictResponse is the structure received from the Python FastAPI microservice
type PythonPredictResponse struct {
	Huruf      string  `json:"huruf"`
	Confidence float64 `json:"confidence"`
	Detail     string  `json:"detail,omitempty"` // For FastAPI validation errors
}

// GatewayHandler upgrades HTTP to WebSocket and streams data to Python FastAPI
func GatewayHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer conn.Close()
	
	log.Println("✅ WebSocket client connected for prediction")

	for {
		var req PredictWSRequest
		err := conn.ReadJSON(&req)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS Error: %v", err)
			}
			break // Client disconnected or error
		}

		if req.Type != "predict" {
			continue // Ignore unknown message types
		}

		// Forward to Python AI Microservice
		go handlePrediction(conn, req)
	}
	
	log.Println("❌ WebSocket client disconnected")
}

func handlePrediction(conn *websocket.Conn, req PredictWSRequest) {
	modelType := req.Model
	if modelType == "" {
		modelType = "bisindo"
	}

	pyReq := PythonPredictRequest{
		Frames: req.Sequence,
	}

	jsonData, err := json.Marshal(pyReq)
	if err != nil {
		sendWSError(conn, "Failed to encode prediction request")
		return
	}

	// Python FastAPI URL
	apiURL := fmt.Sprintf("http://127.0.0.1:8000/predict/%s", modelType)
	
	// Create HTTP client with a larger timeout to prevent context deadline exceeded
	client := &http.Client{Timeout: 30 * time.Second}
	
	resp, err := client.Post(apiURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Println("FastAPI connection error:", err)
		sendWSError(conn, "AI Service is unavailable")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("FastAPI returned error (%d): %s", resp.StatusCode, string(body))
		sendWSError(conn, "AI Service returned an error")
		return
	}

	var pyResp PythonPredictResponse
	if err := json.NewDecoder(resp.Body).Decode(&pyResp); err != nil {
		log.Println("Failed to decode FastAPI response:", err)
		sendWSError(conn, "Invalid AI response format")
		return
	}

	// Send back to Next.js
	wsResp := PredictWSResponse{
		Type:       "result",
		Huruf:      pyResp.Huruf,
		Confidence: pyResp.Confidence,
	}

	if err := conn.WriteJSON(wsResp); err != nil {
		log.Println("Failed to send WebSocket response:", err)
	}
}

func sendWSError(conn *websocket.Conn, errMsg string) {
	resp := PredictWSResponse{
		Type:  "error",
		Error: errMsg,
	}
	conn.WriteJSON(resp)
}
