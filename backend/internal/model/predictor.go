package model

import (
	"fmt"
	"math"
)

// PredictResult holds the prediction output.
type PredictResult struct {
	Label      string    `json:"label"`
	Confidence float64   `json:"confidence"`
	TopK       []LabelScore `json:"top_k,omitempty"`
}

// LabelScore pairs a label with its probability score.
type LabelScore struct {
	Label string  `json:"label"`
	Score float64 `json:"score"`
}

// Predict runs the full inference pipeline:
// 1. StandardScaler
// 2. Pad/trim to sequence_length
// 3. BatchNorm → BiLSTM×2 → Dense → Softmax
func Predict(bundle *ModelBundle, rawFrames [][]float64) (*PredictResult, error) {
	cfg := bundle.PreprocessCfg
	w := bundle.Weights

	if w == nil || w.Units1 == 0 {
		return nil, fmt.Errorf("model weights not loaded for %s", bundle.Name)
	}

	// 1. Scale features
	scaled := ApplyScalerBatch(rawFrames, bundle.Scaler)

	// 2. Pad or trim to sequence_length
	seq := PadOrTrimSequence(scaled, cfg.SequenceLength, cfg.FeaturesPerFrame)

	// Convert to float32 for inference
	seqF32 := make([][]float32, len(seq))
	for i, frame := range seq {
		seqF32[i] = make([]float32, len(frame))
		for j, v := range frame {
			seqF32[i][j] = float32(v)
		}
	}

	// 3. BatchNorm 0 (input normalization)
	seqF32 = batchNormSeq(seqF32, w.BN0Gamma, w.BN0Beta, w.BN0Mean, w.BN0Variance)

	// 4. Bidirectional LSTM Layer 1 (return_sequences=true)
	fwdOut1 := lstmForward(seqF32, w.FwdKernel1, w.FwdRecurrent1, w.FwdBias1, w.Units1, false)
	bwdOut1 := lstmForward(seqF32, w.BwdKernel1, w.BwdRecurrent1, w.BwdBias1, w.Units1, true)
	biOut1 := concatSeq(fwdOut1, bwdOut1) // [seqLen, 2*units1]

	// 5. Bidirectional LSTM Layer 2 (return_sequences=false → only last output)
	fwdOut2 := lstmForward(biOut1, w.FwdKernel2, w.FwdRecurrent2, w.FwdBias2, w.Units2, false)
	bwdOut2 := lstmForward(biOut1, w.BwdKernel2, w.BwdRecurrent2, w.BwdBias2, w.Units2, true)
	// return_sequences=false: take last timestep from forward, first from backward
	lastFwd := fwdOut2[len(fwdOut2)-1]
	lastBwd := bwdOut2[0]
	biVec := append(lastFwd, lastBwd...) // [2*units2]

	// 6. Dense 1 (ReLU)
	dense1 := denseForward(biVec, w.DenseKernel1, w.DenseBias1)
	relu(dense1)

	// 7. BatchNorm 1
	dense1 = batchNorm1D(dense1, w.BN1Gamma, w.BN1Beta, w.BN1Mean, w.BN1Variance)

	// 8. Dense 2 (output → Softmax)
	logits := denseForward(dense1, w.DenseKernel2, w.DenseBias2)
	probs := softmax(logits)

	// Find top prediction
	maxIdx := 0
	maxProb := float64(probs[0])
	for i, p := range probs {
		if float64(p) > maxProb {
			maxProb = float64(p)
			maxIdx = i
		}
	}

	label := "UNKNOWN"
	if maxIdx < len(bundle.Labels.Labels) {
		label = bundle.Labels.Labels[maxIdx]
	}

	// Build top-5
	topK := topKScores(probs, bundle.Labels.Labels, 5)

	return &PredictResult{
		Label:      label,
		Confidence: maxProb,
		TopK:       topK,
	}, nil
}

// --- LSTM Forward Pass ---

func lstmForward(seq [][]float32, kernel, recurrent [][]float32, bias []float32, units int, reverse bool) [][]float32 {
	seqLen := len(seq)
	outputs := make([][]float32, seqLen)

	h := make([]float32, units)
	c := make([]float32, units)

	for step := 0; step < seqLen; step++ {
		t := step
		if reverse {
			t = seqLen - 1 - step
		}

		x := seq[t]

		// gates = x @ kernel + h @ recurrent_kernel + bias
		gates := make([]float32, 4*units)
		copy(gates, bias)

		// x @ kernel
		inputDim := len(x)
		for i := 0; i < inputDim; i++ {
			xi := x[i]
			if xi == 0 {
				continue
			}
			for j := 0; j < 4*units; j++ {
				gates[j] += xi * kernel[i][j]
			}
		}

		// h @ recurrent_kernel
		for i := 0; i < units; i++ {
			hi := h[i]
			if hi == 0 {
				continue
			}
			for j := 0; j < 4*units; j++ {
				gates[j] += hi * recurrent[i][j]
			}
		}

		// Split gates: i, f, c_candidate, o
		// Keras LSTM gate order: i, f, c, o
		iGate := gates[0:units]
		fGate := gates[units : 2*units]
		cGate := gates[2*units : 3*units]
		oGate := gates[3*units : 4*units]

		newH := make([]float32, units)
		newC := make([]float32, units)

		for i := 0; i < units; i++ {
			ig := sigmoid32(iGate[i])
			fg := sigmoid32(fGate[i])
			cCandidate := tanh32(cGate[i])
			og := sigmoid32(oGate[i])

			newC[i] = fg*c[i] + ig*cCandidate
			newH[i] = og * tanh32(newC[i])
		}

		h = newH
		c = newC
		outputs[t] = make([]float32, units)
		copy(outputs[t], h)
	}

	return outputs
}

// --- Dense Forward ---

func denseForward(input []float32, kernel [][]float32, bias []float32) []float32 {
	outDim := len(bias)
	output := make([]float32, outDim)
	copy(output, bias)

	for i := 0; i < len(input); i++ {
		xi := input[i]
		if xi == 0 {
			continue
		}
		for j := 0; j < outDim; j++ {
			output[j] += xi * kernel[i][j]
		}
	}
	return output
}

// --- BatchNorm ---

func batchNormSeq(seq [][]float32, gamma, beta, mean, variance []float32) [][]float32 {
	eps := float32(0.001)
	result := make([][]float32, len(seq))
	for t, frame := range seq {
		n := len(frame)
		if n > len(gamma) {
			n = len(gamma)
		}
		out := make([]float32, n)
		for i := 0; i < n; i++ {
			out[i] = gamma[i]*(frame[i]-mean[i])/float32(math.Sqrt(float64(variance[i]+eps))) + beta[i]
		}
		result[t] = out
	}
	return result
}

func batchNorm1D(input, gamma, beta, mean, variance []float32) []float32 {
	eps := float32(0.001)
	n := len(input)
	if n > len(gamma) {
		n = len(gamma)
	}
	out := make([]float32, n)
	for i := 0; i < n; i++ {
		out[i] = gamma[i]*(input[i]-mean[i])/float32(math.Sqrt(float64(variance[i]+eps))) + beta[i]
	}
	return out
}

// --- Activation Functions ---

func sigmoid32(x float32) float32 {
	return float32(1.0 / (1.0 + math.Exp(-float64(x))))
}

func tanh32(x float32) float32 {
	return float32(math.Tanh(float64(x)))
}

func relu(v []float32) {
	for i := range v {
		if v[i] < 0 {
			v[i] = 0
		}
	}
}

func softmax(logits []float32) []float32 {
	maxVal := logits[0]
	for _, v := range logits {
		if v > maxVal {
			maxVal = v
		}
	}
	sum := float32(0)
	probs := make([]float32, len(logits))
	for i, v := range logits {
		probs[i] = float32(math.Exp(float64(v - maxVal)))
		sum += probs[i]
	}
	for i := range probs {
		probs[i] /= sum
	}
	return probs
}

// --- Helpers ---

func concatSeq(a, b [][]float32) [][]float32 {
	n := len(a)
	result := make([][]float32, n)
	for i := 0; i < n; i++ {
		result[i] = append(a[i], b[i]...)
	}
	return result
}

func topKScores(probs []float32, labels []string, k int) []LabelScore {
	if k > len(probs) {
		k = len(probs)
	}

	type idxScore struct {
		idx   int
		score float32
	}

	// Simple selection sort for top-k (k is small)
	scores := make([]idxScore, len(probs))
	for i, p := range probs {
		scores[i] = idxScore{i, p}
	}

	result := make([]LabelScore, 0, k)
	for i := 0; i < k; i++ {
		maxJ := i
		for j := i + 1; j < len(scores); j++ {
			if scores[j].score > scores[maxJ].score {
				maxJ = j
			}
		}
		scores[i], scores[maxJ] = scores[maxJ], scores[i]

		lbl := "?"
		if scores[i].idx < len(labels) {
			lbl = labels[scores[i].idx]
		}
		result = append(result, LabelScore{
			Label: lbl,
			Score: float64(scores[i].score),
		})
	}
	return result
}
