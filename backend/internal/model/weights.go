package model

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
)

// ModelWeights holds the parsed weight tensors from the TFJS model.
type ModelWeights struct {
	// Layer architecture
	NumClasses int

	// Bidirectional LSTM Layer 1
	FwdKernel1    [][]float32 // [input_dim, 4*units]
	FwdRecurrent1 [][]float32 // [units, 4*units]
	FwdBias1      []float32   // [4*units]
	BwdKernel1    [][]float32
	BwdRecurrent1 [][]float32
	BwdBias1      []float32
	Units1        int

	// Bidirectional LSTM Layer 2
	FwdKernel2    [][]float32 // [2*units1, 4*units2]
	FwdRecurrent2 [][]float32 // [units2, 4*units2]
	FwdBias2      []float32   // [4*units2]
	BwdKernel2    [][]float32
	BwdRecurrent2 [][]float32
	BwdBias2      []float32
	Units2        int

	// Dense layers
	DenseKernel1 [][]float32 // [2*units2, 64]
	DenseBias1   []float32   // [64]
	DenseKernel2 [][]float32 // [64, num_classes]
	DenseBias2   []float32   // [num_classes]

	// BatchNorm layers
	BN0Gamma    []float32
	BN0Beta     []float32
	BN0Mean     []float32
	BN0Variance []float32

	BN1Gamma    []float32
	BN1Beta     []float32
	BN1Mean     []float32
	BN1Variance []float32
}

// tfjsModelJSON represents the minimal structure we need from model.json
type tfjsModelJSON struct {
	WeightsManifest []struct {
		Paths   []string `json:"paths"`
		Weights []struct {
			Name  string `json:"name"`
			Shape []int  `json:"shape"`
			Dtype string `json:"dtype"`
		} `json:"weights"`
	} `json:"weightsManifest"`
}

// LoadModelWeights loads weights from TF.js format (model.json + .bin files)
func LoadModelWeights(modelJSONPath string, modelDir string) (*ModelWeights, error) {
	data, err := os.ReadFile(modelJSONPath)
	if err != nil {
		return nil, fmt.Errorf("read model.json: %w", err)
	}

	var manifest tfjsModelJSON
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("parse model.json: %w", err)
	}

	if len(manifest.WeightsManifest) == 0 {
		return nil, fmt.Errorf("no weights manifest found")
	}

	wm := manifest.WeightsManifest[0]

	// Read all binary weight data
	var allBytes []byte
	for _, p := range wm.Paths {
		binPath := filepath.Join(modelDir, p)
		b, err := os.ReadFile(binPath)
		if err != nil {
			return nil, fmt.Errorf("read weights %s: %w", p, err)
		}
		allBytes = append(allBytes, b...)
	}

	// Parse each weight tensor
	weights := &ModelWeights{}
	offset := 0

	for _, w := range wm.Weights {
		size := 1
		for _, d := range w.Shape {
			size *= d
		}

		// All weights are float32 (4 bytes each)
		byteSize := size * 4
		if offset+byteSize > len(allBytes) {
			return nil, fmt.Errorf("weight %s: buffer overflow at offset %d", w.Name, offset)
		}

		vals := make([]float32, size)
		for i := 0; i < size; i++ {
			bits := binary.LittleEndian.Uint32(allBytes[offset+i*4 : offset+i*4+4])
			vals[i] = math.Float32frombits(bits)
		}
		offset += byteSize

		if err := weights.assign(w.Name, vals, w.Shape); err != nil {
			// Non-critical: skip unknown weights
			fmt.Printf("⚠️  Skipping weight %s: %v\n", w.Name, err)
		}
	}

	return weights, nil
}

func (mw *ModelWeights) assign(name string, vals []float32, shape []int) error {
	switch name {
	// BatchNorm 0 (input)
	case "sequential/batch_normalization/gamma":
		mw.BN0Gamma = vals
	case "sequential/batch_normalization/beta":
		mw.BN0Beta = vals
	case "sequential/batch_normalization/moving_mean":
		mw.BN0Mean = vals
	case "sequential/batch_normalization/moving_variance":
		mw.BN0Variance = vals

	// BatchNorm 1 (after dense)
	case "sequential/batch_normalization_1/gamma":
		mw.BN1Gamma = vals
	case "sequential/batch_normalization_1/beta":
		mw.BN1Beta = vals
	case "sequential/batch_normalization_1/moving_mean":
		mw.BN1Mean = vals
	case "sequential/batch_normalization_1/moving_variance":
		mw.BN1Variance = vals

	// Bidirectional LSTM 1
	case "sequential/bidirectional/forward_lstm/lstm_cell/kernel":
		mw.FwdKernel1 = reshape2D(vals, shape[0], shape[1])
		mw.Units1 = shape[1] / 4
	case "sequential/bidirectional/forward_lstm/lstm_cell/recurrent_kernel":
		mw.FwdRecurrent1 = reshape2D(vals, shape[0], shape[1])
	case "sequential/bidirectional/forward_lstm/lstm_cell/bias":
		mw.FwdBias1 = vals
	case "sequential/bidirectional/backward_lstm/lstm_cell/kernel":
		mw.BwdKernel1 = reshape2D(vals, shape[0], shape[1])
	case "sequential/bidirectional/backward_lstm/lstm_cell/recurrent_kernel":
		mw.BwdRecurrent1 = reshape2D(vals, shape[0], shape[1])
	case "sequential/bidirectional/backward_lstm/lstm_cell/bias":
		mw.BwdBias1 = vals

	// Bidirectional LSTM 2
	case "sequential/bidirectional_1/forward_lstm_1/lstm_cell/kernel":
		mw.FwdKernel2 = reshape2D(vals, shape[0], shape[1])
		mw.Units2 = shape[1] / 4
	case "sequential/bidirectional_1/forward_lstm_1/lstm_cell/recurrent_kernel":
		mw.FwdRecurrent2 = reshape2D(vals, shape[0], shape[1])
	case "sequential/bidirectional_1/forward_lstm_1/lstm_cell/bias":
		mw.FwdBias2 = vals
	case "sequential/bidirectional_1/backward_lstm_1/lstm_cell/kernel":
		mw.BwdKernel2 = reshape2D(vals, shape[0], shape[1])
	case "sequential/bidirectional_1/backward_lstm_1/lstm_cell/recurrent_kernel":
		mw.BwdRecurrent2 = reshape2D(vals, shape[0], shape[1])
	case "sequential/bidirectional_1/backward_lstm_1/lstm_cell/bias":
		mw.BwdBias2 = vals

	// Dense layers
	case "sequential/dense/kernel":
		mw.DenseKernel1 = reshape2D(vals, shape[0], shape[1])
	case "sequential/dense/bias":
		mw.DenseBias1 = vals
	case "sequential/dense_1/kernel":
		mw.DenseKernel2 = reshape2D(vals, shape[0], shape[1])
		mw.NumClasses = shape[1]
	case "sequential/dense_1/bias":
		mw.DenseBias2 = vals

	default:
		return fmt.Errorf("unknown weight tensor")
	}
	return nil
}

func reshape2D(flat []float32, rows, cols int) [][]float32 {
	result := make([][]float32, rows)
	for i := 0; i < rows; i++ {
		result[i] = flat[i*cols : (i+1)*cols]
	}
	return result
}
