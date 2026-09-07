package model

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// ScalerParams holds StandardScaler mean and scale (1/std) arrays.
type ScalerParams struct {
	Mean  []float64 `json:"mean"`
	Scale []float64 `json:"scale"`
}

// PreprocessConfig holds feature layout and sequence params from training.
type PreprocessConfig struct {
	SequenceLength      int                       `json:"sequence_length"`
	NumHandLandmarks    int                       `json:"num_hand_landmarks"`
	Fingertips          []int                     `json:"fingertips"`
	WristIndex          int                       `json:"wrist_index"`
	MiddleFingerMCPIdx  int                       `json:"middle_finger_mcp_index"`
	PoseIndices         []int                     `json:"pose_indices"`
	FeaturesPerFrame    int                       `json:"features_per_frame"`
	FeatureLayout       map[string]FeatureRange   `json:"feature_layout"`
}

// FeatureRange represents start/end indices for a feature group.
type FeatureRange struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

// LabelMap holds the label list and index mapping from training.
type LabelMap struct {
	Labels       []string          `json:"labels"`
	LabelToIndex map[string]int    `json:"label_to_index"`
}

// ModelBundle holds all loaded artifacts for a single model (SIBI or BISINDO).
type ModelBundle struct {
	Name            string
	Scaler          *ScalerParams
	PreprocessCfg   *PreprocessConfig
	Labels          *LabelMap
	Weights         *ModelWeights
}

// Registry holds all loaded model bundles keyed by name.
type Registry struct {
	mu      sync.RWMutex
	bundles map[string]*ModelBundle
}

// NewRegistry creates an empty model registry.
func NewRegistry() *Registry {
	return &Registry{bundles: make(map[string]*ModelBundle)}
}

// Get retrieves a model bundle by name. Returns nil if not found.
func (r *Registry) Get(name string) *ModelBundle {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.bundles[name]
}

// Names returns all loaded model names.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.bundles))
	for k := range r.bundles {
		names = append(names, k)
	}
	return names
}

// LoadAll scans the modelsDir for subdirectories and loads each as a ModelBundle.
func (r *Registry) LoadAll(modelsDir string) error {
	entries, err := os.ReadDir(modelsDir)
	if err != nil {
		return fmt.Errorf("read models dir %q: %w", modelsDir, err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		dir := filepath.Join(modelsDir, name)

		bundle, err := loadBundle(name, dir)
		if err != nil {
			return fmt.Errorf("load model %q: %w", name, err)
		}

		r.mu.Lock()
		r.bundles[name] = bundle
		r.mu.Unlock()
		fmt.Printf("✅ Model %q loaded — %d labels, %d features/frame, seq_len=%d\n",
			name, len(bundle.Labels.Labels), bundle.PreprocessCfg.FeaturesPerFrame, bundle.PreprocessCfg.SequenceLength)
	}
	return nil
}

func loadBundle(name, dir string) (*ModelBundle, error) {
	scaler, err := loadJSON[ScalerParams](filepath.Join(dir, "scaler_params.json"))
	if err != nil {
		return nil, fmt.Errorf("scaler_params.json: %w", err)
	}

	cfg, err := loadJSON[PreprocessConfig](filepath.Join(dir, "preprocess_config.json"))
	if err != nil {
		return nil, fmt.Errorf("preprocess_config.json: %w", err)
	}

	labels, err := loadJSON[LabelMap](filepath.Join(dir, "label_map.json"))
	if err != nil {
		return nil, fmt.Errorf("label_map.json: %w", err)
	}

	weights, err := LoadModelWeights(filepath.Join(dir, "model.json"), dir)
	if err != nil {
		return nil, fmt.Errorf("model weights: %w", err)
	}

	return &ModelBundle{
		Name:          name,
		Scaler:        scaler,
		PreprocessCfg: cfg,
		Labels:        labels,
		Weights:       weights,
	}, nil
}

func loadJSON[T any](path string) (*T, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, fmt.Errorf("parse %s: %w", filepath.Base(path), err)
	}
	return &v, nil
}
