// src/utils/semanticClassifier.js
import { pipeline } from '@xenova/transformers';
import NodeCache from 'node-cache';

// ENV knobs (pick ONE model)
const MODEL_ID = process.env.NLI_MODEL
  || 'MoritzLaurer/mDeBERTa-v3-base-mnli-xnli'; // multilingual, accurate
// Alternative (faster/smaller, English-leaning):
// 'Xenova/nli-deberta-v3-small'

const LABELS = ['war','politics','economy','society','culture','climate','peace','demise','others'];

// Cache semantic results to avoid re-inference
const semCache = new NodeCache({ stdTTL: 6 * 3600, useClones: false }); // 6h

let clfPromise = null;
async function getPipeline() {
  if (!clfPromise) {
    clfPromise = pipeline('zero-shot-classification', MODEL_ID, { quantized: true });
  }
  return clfPromise;
}

/** Warm the model once at server start */
export async function warmSemantic() {
  try {
    const p = await getPipeline();
    await p('warmup', LABELS, { multi_label: false });
    return true;
  } catch {
    return false;
  }
}

/** Classify a sentence with zero-shot NLI. Returns { label, score, scores } */
export async function semanticClassify(text) {
  const key = `sem:${MODEL_ID}:${text.slice(0, 512)}`; // cache short key
  const hit = semCache.get(key);
  if (hit) return hit;

  const p = await getPipeline();
  const out = await p(text, LABELS, { multi_label: false });
  const scores = {};
  out.labels.forEach((lab, i) => (scores[lab] = out.scores[i]));

  const result = { label: out.labels[0], score: out.scores[0], scores };
  semCache.set(key, result);
  return result;
}
