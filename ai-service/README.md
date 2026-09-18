# Evidence-Finder sidecar (the ML model service)

Retrieval + rerank: given ONE tender requirement + ONE bid document, return the
best evidence quote + relevance score. The Express backend calls it only when
`AI_SERVICE_URL` is set; otherwise it keeps its built-in heuristic.

## Run locally (zero install, stdlib only)

```bash
cd ai-service
python3 app.py   # :8765 — TF-IDF engine, works immediately
curl -X POST localhost:8765/find-evidence \
  -H 'Content-Type: application/json' \
  -d '{"requirement":"Minimum EMD required: Rs 500000","docText":"EMD of Rs 500000 enclosed..."}'
```

## Real models (Colab / production)

```bash
pip install -r requirements.txt   # sentence-transformers + torch(CPU) + onnxruntime
python3 app.py                    # auto-upgrades to SBERT + trained reranker if present
```

## Train the reranker (Colab, free GPU, ~30 min)

```bash
cd training
python generate_corpus.py --out train.jsonl --n 5000 --seed 7
python generate_corpus.py --out val.jsonl --n 1000 --seed 99
python train.py --train train.jsonl --val val.jsonl --out ./models/reranker
python eval.py --model ./models/reranker --heldout val.jsonl --golden golden.json
python export_onnx.py --model ./models/reranker --out reranker-int8.onnx
```

`eval.py` exits 0 only on 100% golden accuracy — the golden set is the three
seeded vendors (Acme must retrieve, Brightline's OEM gap must surface empty,
Shady's thin bid must fail) plus negation traps. `sample_corpus.jsonl` shows
the row format; `golden.json` is the demo bar.

## Contract (frozen — Express depends on this shape)

```
POST /find-evidence { requirement|title+description, docText, topK? }
-> { quote: string|null, score: 0..1, method: "sbert+crossencoder"|"tfidf", candidates: [{quote, score}] }
GET /health -> { status, engines }
```

Any 5xx/timeout → Express falls back silently. A low score (< 0.5) means
"no evidence" → check becomes `needs_review`, never a fabricated verdict.
