// app/utils/handLogic.ts

type Landmark = { x: number; y: number; z: number };

/**
 * 1. MENGHITUNG JARAK (Feature Extraction)
 * Menghasilkan 210 fitur jarak antar titik tangan.
 */
export function calculateDistances(landmarks: Landmark[]) {
  if (!landmarks || landmarks.length === 0) return new Array(210).fill(0.0);

  const points = landmarks.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z }));
  const distances: number[] = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p1 = points[i];
      const p2 = points[j];
      const dist = Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
      );
      distances.push(dist);
    }
  }

  const maxDist = distances.length > 0 ? Math.max(...distances) : 1;
  return distances.map((d) => d / maxDist);
}

/**
 * 2. PERSIAPAN FITUR BISINDO (420 Fitur)
 * Menggabungkan fitur dari 2 tangan (210 + 210).
 */
export function prepareBisindoFeatures(multiHandLandmarks: any[][]) {
  const fullFeatures = new Array(420).fill(0.0);

  if (multiHandLandmarks && multiHandLandmarks.length > 0) {
    const limit = Math.min(multiHandLandmarks.length, 2);
    for (let i = 0; i < limit; i++) {
      const handFeatures = calculateDistances(multiHandLandmarks[i]);
      const startIdx = i * 210;
      for (let j = 0; j < handFeatures.length; j++) {
        fullFeatures[startIdx + j] = handFeatures[j];
      }
    }
  }
  return fullFeatures;
}

/**
 * 3. MENGUBAH ANGKA PREDIKSI MENJADI HURUF (Mapping)
 */
export function getBestPrediction(scores: any, modelType: "bisindo" | "sibi") {
  if (!scores) return "...";

  // Label sesuai dengan hasil cek_csv.py kamu (A-Z)
  const alphabetLabels = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", 
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", 
    "U", "V", "W", "X", "Y", "Z"
  ];

  // Karena keduanya A-Z, kita bisa pakai array yang sama
  const targetLabels = alphabetLabels;

  let maxScore = -Infinity;
  let predictedIndex = -1;

  // Jika output m2cgen adalah Array [0.1, 0.8, ...]
  if (Array.isArray(scores)) {
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > maxScore) {
        maxScore = scores[i];
        predictedIndex = i;
      }
    }
  } 
  // Jika output m2cgen adalah Object Map {0: 0.1, 1: 0.8, ...}
  else {
    for (const key in scores) {
      if (scores[key] > maxScore) {
        maxScore = scores[key];
        predictedIndex = parseInt(key);
      }
    }
  }

  // Jika tidak ada prediksi yang valid
  if (predictedIndex === -1) return "TIDAK DIKENAL";

  // Ambil huruf berdasarkan index yang menang
  return targetLabels[predictedIndex] || "ERROR LABEL";
}