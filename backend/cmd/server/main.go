package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"vero-backend/internal/config"
	"vero-backend/internal/handler"
	"vero-backend/internal/middleware"
	"vero-backend/internal/model"
	"vero-backend/internal/signaling"
)

func main() {
	cfg := config.Load()

	// Load all AI models
	registry := model.NewRegistry()
	if err := registry.LoadAll(cfg.ModelsDir); err != nil {
		log.Fatalf("❌ Failed to load models: %v", err)
	}

	// Create handlers
	predictHandler := &handler.PredictHandler{Registry: registry}
	modelsHandler := &handler.ModelsHandler{Registry: registry}
	signalingHub := signaling.NewHub()

	// Setup routes
	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("GET /health", handler.Health)

	// AI Prediction
	mux.Handle("POST /api/v1/predict", predictHandler)

	// Model metadata
	mux.HandleFunc("GET /api/v1/models", modelsHandler.ListModels)
	mux.HandleFunc("GET /api/v1/labels/{type}", modelsHandler.GetLabels)
	mux.HandleFunc("GET /api/v1/preprocess/{type}", modelsHandler.GetPreprocessConfig)

	// WebRTC Signaling
	mux.Handle("/ws/signal", signalingHub.Handler())

	// AI Prediction via WebSocket Gateway
	mux.HandleFunc("/ws/predict", handler.GatewayHandler)

	// Per-IP token-bucket limiter: 20 req/s sustained, burst 40. Shields the
	// predict/signaling endpoints from spam & scripted floods (DDoS-lite).
	rl := middleware.NewRateLimiter(20, 40)

	// Apply middleware. Order (outer → inner): Logger → RateLimit → CORS → Gzip.
	// Gzip is innermost so it only wraps real responses (WS upgrades bypass it).
	var h http.Handler = mux
	h = middleware.Gzip(h)
	h = middleware.CORS(cfg.CORSOrigin)(h)
	h = rl.Middleware(h)
	h = middleware.Logger(h)

	addr := fmt.Sprintf(":%d", cfg.Port)

	// Explicit timeouts = resource management: caps slow-client (Slowloris)
	// attacks and stops idle sockets from piling up. WriteTimeout stays 0 so
	// long-lived WebSocket streams (signaling / predict gateway) aren't cut off.
	srv := &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MB
	}

	fmt.Printf(`
╔══════════════════════════════════════════╗
║       VERO Backend — Go Server           ║
║                                          ║
║  🚀 Listening on %s                  ║
║  📊 Models loaded: %d                    ║
║  🔗 CORS origin: %s   ║
║                                          ║
║  Endpoints:                              ║
║  GET  /health                            ║
║  POST /api/v1/predict                    ║
║  GET  /api/v1/models                     ║
║  GET  /api/v1/labels/{type}              ║
║  WS   /ws/signal                         ║
╚══════════════════════════════════════════╝
`, addr, len(registry.Names()), cfg.CORSOrigin)

	// Run the server in the background so main can wait for a shutdown signal.
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ server error: %v", err)
		}
	}()

	// Graceful shutdown: on SIGINT/SIGTERM (e.g. `pm2 restart`), stop accepting
	// new connections and let in-flight requests finish before exiting.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("🛑 Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("⚠️  forced shutdown: %v", err)
	}
	log.Println("✅ Server stopped cleanly")
}
