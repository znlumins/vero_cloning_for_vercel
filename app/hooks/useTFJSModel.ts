// app/hooks/useTFJSModel.ts
"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import { initTFBackend } from "@/lib/tfBackend";
import type { ModelId } from "@/lib/signModes";

interface LabelMap {
  labels: string[];
  index_to_label: Record<string, string>;
  num_classes: number;
  sequence_length: number;
  features_per_frame: number;
}

interface ScalerParams {
  mean: number[];
  scale: number[];
}

interface PredictionResult {
  huruf: string;
  confidence: number;
}

// Tipe diambil dari signModes, bukan ditulis ulang: daftar model yang disalin
// tangan di sini pernah tertinggal saat model baru ditambahkan, dan gejalanya
// cuma galat TypeScript yang membingungkan di halaman pemanggil.
export function useTFJSModel(modelType: ModelId) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const modelRef = useRef<tf.LayersModel | tf.GraphModel | null>(null);
  const modelKindRef = useRef<"graph" | "layers">("layers");
  const labelMapRef = useRef<LabelMap | null>(null);
  const scalerRef = useRef<ScalerParams | null>(null);
  const prevModelType = useRef<string>("");

  // Load model + label_map + scaler when modelType changes
  useEffect(() => {
    if (prevModelType.current === modelType && modelRef.current) return;
    prevModelType.current = modelType;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      // Dispose previous model
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }

      try {
        // Pilih backend SEBELUM memuat model — kompilasi shader/kernel saat
        // pemanasan harus terjadi pada backend yang benar-benar akan dipakai.
        await initTFBackend();

        const basePath = `/models/${modelType}`;

        // Detect model format (graph-model vs layers-model) from model.json
        // so this loader works with EITHER a tfjs GraphModel or a LayersModel.
        const modelJson = await fetch(`${basePath}/model.json`).then((r) =>
          r.json()
        );
        const isGraph = modelJson.format === "graph-model";

        // Load all 3 resources in parallel
        const [model, labelRes, scalerRes] = await Promise.all([
          isGraph
            ? tf.loadGraphModel(`${basePath}/model.json`)
            : tf.loadLayersModel(`${basePath}/model.json`),
          fetch(`${basePath}/label_map.json`).then((r) => r.json()),
          fetch(`${basePath}/scaler_params.json`)
            .then((r) => r.json())
            .catch(() => null), // scaler is optional
        ]);

        if (cancelled) {
          model.dispose();
          return;
        }

        modelRef.current = model;
        modelKindRef.current = isGraph ? "graph" : "layers";
        labelMapRef.current = labelRes as LabelMap;
        scalerRef.current = scalerRes as ScalerParams | null;

        // Warm up with a dummy prediction to pre-compile WebGL shaders.
        // Graph models with LSTM contain control-flow ops -> executeAsync.
        const dummyInput = tf.zeros([1, 30, 212]);
        const dummyOutput: tf.Tensor | tf.Tensor[] = isGraph
          ? await (model as tf.GraphModel).executeAsync(dummyInput)
          : ((model as tf.LayersModel).predict(dummyInput) as tf.Tensor);
        if (Array.isArray(dummyOutput)) dummyOutput.forEach((t) => t.dispose());
        else dummyOutput.dispose();
        dummyInput.dispose();

        console.log(
          `${modelType.toUpperCase()} TFJS model loaded (${labelRes.num_classes} classes)`
        );
        setIsLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          console.error(`Failed to load ${modelType} model:`, e);
          setError(e.message || "Failed to load model");
          setIsLoading(false);
        }
      }
    }

    // JANGAN muat saat mount. Hook ini dipanggil di level atas komponen, jadi
    // dulu unduhan model (~0,7–1,3 MB per model, dan halaman memakai dua) plus
    // pemanasan yang mengompilasi shader berjalan SEGERA saat halaman dibuka —
    // sebelum pengguna menekan apa pun. Itu bikin halaman tersendat sejak detik
    // pertama, gejala yang dilaporkan sebagai "buka browser saja berat".
    //
    // Ditunda sampai browser senggang: paint pertama & interaktivitas didahulukan,
    // model menyusul di latar. Timeout 2 detik jadi jaring pengaman supaya di
    // halaman yang sibuk model tetap termuat sebelum pengguna sempat menekan.
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;

    if (typeof ric === "function") {
      idleHandle = ric(() => load(), { timeout: 2000 });
    } else {
      // Safari lawas belum punya requestIdleCallback.
      timeoutHandle = window.setTimeout(load, 300);
    }

    return () => {
      cancelled = true;
      const cic = (window as unknown as {
        cancelIdleCallback?: (id: number) => void;
      }).cancelIdleCallback;
      if (idleHandle !== null && typeof cic === "function") cic(idleHandle);
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    };
  }, [modelType]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
    };
  }, []);

  /**
   * Run prediction on a sequence of frames.
   * @param frames - Array of 30 frames, each with 212 features
   * @returns PredictionResult with huruf and confidence, or null if model not ready
   */
  const predict = useCallback(
    async (frames: number[][]): Promise<PredictionResult | null> => {
      const model = modelRef.current;
      const labelMap = labelMapRef.current;
      if (!model || !labelMap) return null;

      // Apply StandardScaler normalization if scaler is available
      let normalizedFrames = frames;
      const scaler = scalerRef.current;
      if (scaler && scaler.mean && scaler.scale) {
        normalizedFrames = frames.map((frame) =>
          frame.map((val, i) => {
            const scale = scaler.scale[i];
            if (scale === 0) return 0;
            return (val - scaler.mean[i]) / scale;
          })
        );
      }

      // Create tensor [1, 30, 212]
      const inputTensor = tf.tensor3d([normalizedFrames]);
      let raw: tf.Tensor | tf.Tensor[] | null = null;

      try {
        // Predict. Graph models (LSTM control-flow) require executeAsync;
        // layers models use predict.
        raw =
          modelKindRef.current === "graph"
            ? await (model as tf.GraphModel).executeAsync(inputTensor)
            : ((model as tf.LayersModel).predict(inputTensor) as tf.Tensor);
        const outputTensor = Array.isArray(raw) ? raw[0] : raw;
        const probabilities = await outputTensor.data();

        // Find argmax
        let maxIdx = 0;
        let maxVal = probabilities[0];
        for (let i = 1; i < probabilities.length; i++) {
          if (probabilities[i] > maxVal) {
            maxVal = probabilities[i];
            maxIdx = i;
          }
        }

        // Map index to label
        const huruf =
          labelMap.index_to_label[String(maxIdx)] ||
          labelMap.labels[maxIdx] ||
          "?";

        return {
          huruf: huruf.toUpperCase(),
          confidence: maxVal,
        };
      } finally {
        // Cleanup GPU memory even if predict throws (prevents VRAM leak
        // when toggling models mid-inference).
        inputTensor.dispose();
        if (Array.isArray(raw)) raw.forEach((t) => t.dispose());
        else raw?.dispose();
      }
    },
    []
  );

  return { isLoading, error, predict };
}
