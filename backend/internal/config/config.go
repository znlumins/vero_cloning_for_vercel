package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port       int
	ModelsDir  string
	CORSOrigin string
	DevMode    bool
}

func Load() *Config {
	port := 8080
	if p, err := strconv.Atoi(os.Getenv("VERO_GO_PORT")); err == nil {
		port = p
	}

	modelsDir := os.Getenv("VERO_MODELS_DIR")
	if modelsDir == "" {
		modelsDir = "models"
	}

	corsOrigin := os.Getenv("VERO_CORS_ORIGIN")
	if corsOrigin == "" {
		corsOrigin = "http://localhost:3000"
	}

	devMode := os.Getenv("VERO_DEV_MODE") == "true" || os.Getenv("VERO_DEV_MODE") == "1"

	return &Config{
		Port:       port,
		ModelsDir:  modelsDir,
		CORSOrigin: corsOrigin,
		DevMode:    devMode,
	}
}
