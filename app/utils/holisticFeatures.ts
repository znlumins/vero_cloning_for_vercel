// app/utils/holisticFeatures.ts
// Feature extraction matching the training pipeline (212 features per frame)
// Feature layout from preprocess_config.json:
// [0-62]    right_hand_normalized (21 × 3 = 63)
// [63-125]  left_hand_normalized (21 × 3 = 63)
// [126-135] right_fingertip_distances (10)
// [136-145] left_fingertip_distances (10)
// [146-171] inter_hand_distances (26)
// [172-176] right_finger_angles (5)
// [177-181] left_finger_angles (5)
// [182-209] pose_upper_body (7 × 4 = 28)
// [210-211] hand_presence_flags (2)

type Landmark = { x: number; y: number; z: number; visibility?: number };

const FINGERTIPS = [4, 8, 12, 16, 20];
const WRIST_INDEX = 0;
const MIDDLE_FINGER_MCP = 9;
// pose indices: nose(0), left_shoulder(11), right_shoulder(12), left_elbow(13),
// right_elbow(14), left_wrist(15), right_wrist(16)
const POSE_INDICES = [0, 11, 12, 13, 14, 15, 16];
const FEATURES_PER_FRAME = 212;

/**
 * Normalize hand landmarks relative to the wrist,
 * scaled by the distance from wrist to middle finger MCP.
 */
function normalizeHand(landmarks: Landmark[]): number[] {
  if (!landmarks || landmarks.length < 21) {
    return new Array(63).fill(0);
  }

  const wrist = landmarks[WRIST_INDEX];
  const mcp = landmarks[MIDDLE_FINGER_MCP];

  const scale = Math.sqrt(
    (mcp.x - wrist.x) ** 2 +
    (mcp.y - wrist.y) ** 2 +
    (mcp.z - wrist.z) ** 2
  ) || 1;

  const features: number[] = [];
  for (let i = 0; i < 21; i++) {
    features.push((landmarks[i].x - wrist.x) / scale);
    features.push((landmarks[i].y - wrist.y) / scale);
    features.push((landmarks[i].z - wrist.z) / scale);
  }
  return features;
}

/**
 * Calculate pairwise distances between fingertips (5 choose 2 = 10).
 */
function fingertipDistances(landmarks: Landmark[]): number[] {
  if (!landmarks || landmarks.length < 21) {
    return new Array(10).fill(0);
  }

  const tips = FINGERTIPS.map(i => landmarks[i]);
  const dists: number[] = [];

  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      dists.push(Math.sqrt(
        (tips[i].x - tips[j].x) ** 2 +
        (tips[i].y - tips[j].y) ** 2 +
        (tips[i].z - tips[j].z) ** 2
      ));
    }
  }
  return dists;
}

/**
 * Calculate inter-hand distances between all pairs of fingertips
 * across left and right hand (5 × 5 = 25) + wrist-to-wrist (1) = 26.
 */
function interHandDistances(rightLandmarks: Landmark[], leftLandmarks: Landmark[]): number[] {
  if (!rightLandmarks || !leftLandmarks ||
      rightLandmarks.length < 21 || leftLandmarks.length < 21) {
    return new Array(26).fill(0);
  }

  const dists: number[] = [];

  // Fingertip cross distances (5 × 5 = 25)
  for (const ri of FINGERTIPS) {
    for (const li of FINGERTIPS) {
      const r = rightLandmarks[ri];
      const l = leftLandmarks[li];
      dists.push(Math.sqrt(
        (r.x - l.x) ** 2 + (r.y - l.y) ** 2 + (r.z - l.z) ** 2
      ));
    }
  }

  // Wrist-to-wrist distance
  const rw = rightLandmarks[WRIST_INDEX];
  const lw = leftLandmarks[WRIST_INDEX];
  dists.push(Math.sqrt(
    (rw.x - lw.x) ** 2 + (rw.y - lw.y) ** 2 + (rw.z - lw.z) ** 2
  ));

  return dists;
}

/**
 * Calculate finger flex angles for each finger.
 * Angle between wrist→MCP and MCP→tip vectors.
 */
function fingerAngles(landmarks: Landmark[]): number[] {
  if (!landmarks || landmarks.length < 21) {
    return new Array(5).fill(0);
  }

  // MCP joints for each finger: [1, 5, 9, 13, 17]
  const mcpJoints = [1, 5, 9, 13, 17];
  const wrist = landmarks[WRIST_INDEX];
  const angles: number[] = [];

  for (let f = 0; f < 5; f++) {
    const mcp = landmarks[mcpJoints[f]];
    const tip = landmarks[FINGERTIPS[f]];

    // Vector wrist→MCP
    const v1 = { x: mcp.x - wrist.x, y: mcp.y - wrist.y, z: mcp.z - wrist.z };
    // Vector MCP→tip
    const v2 = { x: tip.x - mcp.x, y: tip.y - mcp.y, z: tip.z - mcp.z };

    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2) || 1;
    const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2) || 1;

    // Clamp to [-1, 1] to avoid NaN from acos
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    angles.push(Math.acos(cosAngle));
  }

  return angles;
}

/**
 * Extract upper body pose features (7 landmarks × 4 values = 28).
 */
function poseUpperBody(poseLandmarks: Landmark[]): number[] {
  if (!poseLandmarks || poseLandmarks.length < 17) {
    return new Array(28).fill(0);
  }

  const features: number[] = [];
  for (const idx of POSE_INDICES) {
    const lm = poseLandmarks[idx];
    features.push(lm.x, lm.y, lm.z, lm.visibility ?? 0);
  }
  return features;
}

/**
 * Extract all 212 features from a single MediaPipe Holistic frame.
 * 
 * @param results - MediaPipe Holistic results object
 * @returns 212-element feature array matching the training pipeline
 */
export function extractHolisticFeatures(results: {
  rightHandLandmarks?: Landmark[];
  leftHandLandmarks?: Landmark[];
  poseLandmarks?: Landmark[];
}): number[] {
  const rightHand = results.rightHandLandmarks || null;
  const leftHand = results.leftHandLandmarks || null;
  const pose = results.poseLandmarks || null;

  const features: number[] = [];

  // [0-62] right_hand_normalized
  features.push(...normalizeHand(rightHand as Landmark[]));

  // [63-125] left_hand_normalized
  features.push(...normalizeHand(leftHand as Landmark[]));

  // [126-135] right_fingertip_distances
  features.push(...fingertipDistances(rightHand as Landmark[]));

  // [136-145] left_fingertip_distances
  features.push(...fingertipDistances(leftHand as Landmark[]));

  // [146-171] inter_hand_distances
  features.push(...interHandDistances(rightHand as Landmark[], leftHand as Landmark[]));

  // [172-176] right_finger_angles
  features.push(...fingerAngles(rightHand as Landmark[]));

  // [177-181] left_finger_angles
  features.push(...fingerAngles(leftHand as Landmark[]));

  // [182-209] pose_upper_body
  features.push(...poseUpperBody(pose as Landmark[]));

  // [210-211] hand_presence_flags
  features.push(
    rightHand && rightHand.length >= 21 ? 1 : 0,
    leftHand && leftHand.length >= 21 ? 1 : 0,
  );

  return features;
}

/** Interpolasi linier antar dua vektor fitur. */
function lerpFeatures(a: number[], b: number[], alpha: number): number[] {
  const out = new Array<number>(b.length);
  for (let i = 0; i < b.length; i++) {
    const av = a[i] ?? b[i];
    out[i] = av + (b[i] - av) * alpha;
  }
  return out;
}

/**
 * Buffer geser untuk prediksi berbasis sekuens — DIPETAKAN KE WAKTU, bukan ke
 * hitungan frame.
 *
 * KENAPA BEGINI: model dilatih dari rekaman 30fps, jadi jendela 30-frame saat
 * training selalu mewakili 1 DETIK gerakan. Versi lama buffer ini menyimpan 30
 * frame terakhir apa adanya, berapa pun laju perangkat. Di laptop yang cuma
 * sanggup 5fps, 30 frame membentang 6 detik — model melihat isyarat teregang 6x
 * lebih lambat dari apa pun yang pernah dilatihkan, dan tebakannya jadi ngawur.
 * Itu sebabnya lag dan akurasi jelek selalu muncul bersamaan: yang satu
 * menyebabkan yang lain.
 *
 * Sekarang buffer memakai kisi waktu tetap (default 33,3ms = 30fps):
 *  - Frame datang lebih cepat dari kisi -> slot terakhir diperbarui (ambil yang
 *    terbaru), panjang jendela tidak bertambah.
 *  - Frame datang lebih lambat -> slot yang terlewat diisi interpolasi linier
 *    antara sampel sebelumnya dan sampel baru, sehingga jendela tetap mewakili
 *    ~1 detik.
 *  - Jeda sangat panjang (tab dilatarbelakangkan, > 1 jendela penuh) -> buffer
 *    direset; menambal jeda sepanjang itu hanya menghasilkan data karangan.
 *
 * Catatan jujur: interpolasi tidak menciptakan informasi yang hilang. Di
 * perangkat sangat lambat sebagian besar isi jendela jadi sintetis dan akurasi
 * tetap menurun — tapi setidaknya SKALA WAKTU-nya benar, jadi model bekerja pada
 * distribusi yang sama dengan data latihnya. Badge FPS memperingatkan pengguna
 * saat kondisi ini terjadi.
 */
export class FrameBuffer {
  private buffer: number[][] = [];
  private maxSize: number;
  private slotMs: number;
  /** Waktu (ms) slot terakhir yang terisi; 0 = buffer masih kosong. */
  private lastSlotAt = 0;
  /** Sampel nyata terakhir, jadi titik awal interpolasi. */
  private lastFeatures: number[] | null = null;

  constructor(sequenceLength: number = 30, targetFps: number = 30) {
    this.maxSize = sequenceLength;
    this.slotMs = 1000 / targetFps;
  }

  /**
   * Tambahkan satu frame. Kembalikan true saat jendela sudah penuh.
   * @param now waktu kedatangan frame (ms); default jam monotonik browser.
   */
  push(features: number[], now: number = performance.now()): boolean {
    // Frame pertama menandai awal kisi waktu.
    if (this.buffer.length === 0) {
      this.appendSlot(features);
      this.lastSlotAt = now;
      this.lastFeatures = features;
      return this.isReady();
    }

    // Toleransi kecil: pada perangkat yang jalan TEPAT di laju sasaran, galat
    // pembulatan floating-point bisa membuat hasil bagi jadi 0,999... sehingga
    // frame dianggap belum berganti slot dan jendela terisi lebih lambat dari
    // seharusnya. Epsilon menghilangkan gigitan di batas slot itu.
    const slots = Math.floor((now - this.lastSlotAt) / this.slotMs + 1e-6);

    // Lebih cepat dari kisi: perbarui slot terakhir dengan sampel terbaru.
    if (slots <= 0) {
      this.buffer[this.buffer.length - 1] = features;
      this.lastFeatures = features;
      return this.isReady();
    }

    // Jeda lebih panjang dari satu jendela penuh: mulai bersih.
    if (slots > this.maxSize) {
      this.buffer = [features];
      this.lastSlotAt = now;
      this.lastFeatures = features;
      return this.isReady();
    }

    const prev = this.lastFeatures ?? features;
    for (let i = 1; i <= slots; i++) {
      const alpha = i / slots;
      this.appendSlot(alpha >= 1 ? features : lerpFeatures(prev, features, alpha));
    }

    // Majukan kisi tepat sebanyak slot terisi supaya tidak menumpuk galat.
    this.lastSlotAt += slots * this.slotMs;
    this.lastFeatures = features;
    return this.isReady();
  }

  /** Masukkan satu slot & jaga panjang jendela. */
  private appendSlot(features: number[]): void {
    this.buffer.push(features);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /** Get the current buffer contents. */
  getFrames(): number[][] {
    return [...this.buffer];
  }

  /** Check if buffer has enough frames for prediction. */
  isReady(): boolean {
    return this.buffer.length >= this.maxSize;
  }

  /** Remove older frames to allow sliding window (e.g. shift 15 frames) */
  shiftFrames(count: number): void {
    if (count > this.buffer.length) {
      this.buffer = [];
    } else {
      this.buffer = this.buffer.slice(count);
    }
  }

  /** Reset the buffer. */
  clear(): void {
    this.buffer = [];
    this.lastSlotAt = 0;
    this.lastFeatures = null;
  }

  /** Get current frame count. */
  get length(): number {
    return this.buffer.length;
  }
}

export { FEATURES_PER_FRAME };
