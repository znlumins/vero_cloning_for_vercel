// Verifikasi: load model tfjs pakai @tensorflow/tfjs milik project (runtime = browser)
const fs = require("fs");
const path = require("path");
const tf = require("@tensorflow/tfjs");

async function verify(name) {
  const dir = path.join(__dirname, "public", "models", name);
  const mj = JSON.parse(fs.readFileSync(path.join(dir, "model.json"), "utf8"));
  const weightSpecs = mj.weightsManifest.flatMap((g) => g.weights);
  const buf = fs.readFileSync(path.join(dir, "group1-shard1of1.bin"));
  const weightData = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  const handler = tf.io.fromMemory({
    modelTopology: mj.modelTopology,
    weightSpecs,
    weightData,
  });

  const model = await tf.loadLayersModel(handler);
  const input = tf.zeros([1, 30, 212]);
  const out = model.predict(input);
  const data = await out.data();
  let sum = 0, maxI = 0, maxV = -1;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (data[i] > maxV) { maxV = data[i]; maxI = i; }
  }
  console.log(
    `${name.toUpperCase().padEnd(8)} LOAD OK | in ${JSON.stringify(model.inputs[0].shape)} -> out ${JSON.stringify(out.shape)} | softmax_sum=${sum.toFixed(3)} argmax=${maxI} p=${maxV.toFixed(3)}`
  );
  input.dispose(); out.dispose(); model.dispose();
}

(async () => {
  await tf.setBackend("cpu");
  await tf.ready();
  console.log("tfjs", tf.version.tfjs, "| backend", tf.getBackend());
  let ok = true;
  for (const n of ["sibi", "bisindo"]) {
    try { await verify(n); }
    catch (e) { ok = false; console.error(`${n.toUpperCase()} FAIL: ${e.message}`); }
  }
  console.log(ok ? "\n>>> SEMUA MODEL LOAD & PREDIKSI OK" : "\n>>> ADA YANG GAGAL");
  process.exit(ok ? 0 : 1);
})();
