package model

// ApplyScaler applies StandardScaler transform: (x - mean) / scale
// to a single frame of features. Returns a new slice.
func ApplyScaler(features []float64, scaler *ScalerParams) []float64 {
	n := len(features)
	if n > len(scaler.Mean) {
		n = len(scaler.Mean)
	}

	scaled := make([]float64, n)
	for i := 0; i < n; i++ {
		s := scaler.Scale[i]
		if s == 0 || s == 1.0 && scaler.Mean[i] == 0 {
			// Skip zero-variance features (scale=1, mean=0 means constant column)
			scaled[i] = 0
		} else {
			scaled[i] = (features[i] - scaler.Mean[i]) / s
		}
	}
	return scaled
}

// ApplyScalerBatch applies StandardScaler to a batch of frames (sequence).
func ApplyScalerBatch(frames [][]float64, scaler *ScalerParams) [][]float64 {
	result := make([][]float64, len(frames))
	for i, frame := range frames {
		result[i] = ApplyScaler(frame, scaler)
	}
	return result
}

// PadOrTrimSequence ensures the sequence has exactly seqLen frames.
// If shorter, pads with zero frames at the end.
// If longer, takes the last seqLen frames.
func PadOrTrimSequence(frames [][]float64, seqLen int, featSize int) [][]float64 {
	result := make([][]float64, seqLen)

	if len(frames) >= seqLen {
		// Take the last seqLen frames (most recent)
		offset := len(frames) - seqLen
		for i := 0; i < seqLen; i++ {
			result[i] = make([]float64, featSize)
			copy(result[i], frames[offset+i])
		}
	} else {
		// Pad with zeros at the beginning, real data at the end
		padCount := seqLen - len(frames)
		for i := 0; i < padCount; i++ {
			result[i] = make([]float64, featSize)
		}
		for i := 0; i < len(frames); i++ {
			result[padCount+i] = make([]float64, featSize)
			copy(result[padCount+i], frames[i])
		}
	}
	return result
}
