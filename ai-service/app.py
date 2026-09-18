"""
GeMVerifier Evidence-Finder sidecar (Python, stdlib-only HTTP).

Job: given ONE tender requirement + ONE bid document, return the best
supporting evidence quote + a relevance score.

Engines (best available wins, reported in every response):
  1. sbert        - paraphrase-multilingual-MiniLM bi-encoder retrieval +
                    trained cross-encoder rerank (needs requirements.txt stack)
  2. tfidf        - pure-stdlib word/bigram TF-IDF cosine (always available)

Endpoints:
  GET  /health                                     -> { status, engines }
  POST /find-evidence { requirement, docText, topK } -> { quote, score, method, candidates }

The Express backend calls this only when AI_SERVICE_URL is set; otherwise it
keeps its built-in heuristic. Any failure here -> caller falls back silently.
"""
import json
import math
import re
from collections import Counter
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

PORT = 8765

# --------------------------------------------------------------------------
# chunking
# --------------------------------------------------------------------------
def chunk_text(text, size=350, overlap=70):
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        # snap to a sentence/word boundary when mid-document
        if end < len(text):
            snap = max(text.rfind(".", start + size - 120, end), text.rfind(" ", end - 60, end))
            if snap > start:
                end = snap + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if len(c) > 20]


# --------------------------------------------------------------------------
# engine 2 (always available): TF-IDF cosine over word unigrams + bigrams
# --------------------------------------------------------------------------
_WORD = re.compile(r"[a-z0-9\u0900-\u097f]+", re.I)

def _terms(s):
    toks = _WORD.findall(s.lower())
    return toks + [a + " " + b for a, b in zip(toks, toks[1:])]

def _vec(terms):
    return Counter(terms)

def _cos(a, b):
    if not a or not b:
        return 0.0
    dot = sum(v * b.get(k, 0) for k, v in a.items())
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0


class TfidfEngine:
    name = "tfidf"

    def score(self, requirement, chunks, top_k=3):
        q = _vec(_terms(requirement))
        # idf over this document's chunks (local corpus)
        df = Counter()
        cvecs = []
        for c in chunks:
            v = _vec(_terms(c))
            cvecs.append(v)
            for k in v:
                df[k] += 1
        n = max(len(chunks), 1)
        idf = {k: math.log(1 + n / (1 + d)) for k, d in df.items()}

        def weight(v):
            return {k: c * idf.get(k, 1.0) for k, c in v.items()}

        qw = weight(q)
        ranked = sorted(
            ((_cos(qw, weight(v)), c) for v, c in zip(cvecs, chunks)),
            key=lambda x: x[0],
            reverse=True,
        )
        return [{"quote": c, "score": round(s, 4)} for s, c in ranked[:top_k]]


# --------------------------------------------------------------------------
# engine 1 (optional): SBERT bi-encoder + trained cross-encoder rerank
# --------------------------------------------------------------------------
class _HfReranker:
    """sentence-transformers CrossEncoder from ./models/reranker dir."""

    def __init__(self, path="./models/reranker"):
        from sentence_transformers import CrossEncoder  # noqa

        self.ce = CrossEncoder(path)

    def predict(self, pairs):
        return [float(x) for x in self.ce.predict(pairs).tolist()]


class _OnnxReranker:
    """INT8 ONNX reranker (export_onnx.py output) + HF tokenizer."""

    def __init__(self, onnx_path="./models/reranker-int8-q.onnx", tok_dir="./models/reranker"):
        import onnxruntime as ort  # noqa
        from transformers import AutoTokenizer  # noqa

        self.sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        self.tok = AutoTokenizer.from_pretrained(tok_dir)

    def predict(self, pairs):
        import numpy as np  # noqa

        enc = self.tok([p[0] for p in pairs], [p[1] for p in pairs],
                       padding=True, truncation=True, max_length=256, return_tensors="np")
        (logits,) = self.sess.run(["logit"], {
            "input_ids": enc["input_ids"].astype(np.int64),
            "attention_mask": enc["attention_mask"].astype(np.int64),
        })
        return [float(1.0 / (1.0 + np.exp(-x[0]))) for x in logits]


class SbertEngine:
    name = "sbert+crossencoder"

    def __init__(self):
        from sentence_transformers import SentenceTransformer  # noqa

        self.bi = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
        self.ce = None
        for loader in (_HfReranker, _OnnxReranker):
            try:
                self.ce = loader()
                break
            except Exception:
                continue

    def score(self, requirement, chunks, top_k=3):
        import numpy as np  # noqa

        q = self.bi.encode([requirement], normalize_embeddings=True)[0]
        C = self.bi.encode(chunks, normalize_embeddings=True)
        sims = (C @ q).tolist()
        order = sorted(range(len(chunks)), key=lambda i: sims[i], reverse=True)[: max(top_k * 4, 8)]
        if self.ce:
            pairs = [[requirement, chunks[i]] for i in order]
            rs = self.ce.predict(pairs).tolist()
            order = sorted(order, key=lambda i, m=dict(zip(order, rs)): m[i], reverse=True)
            scores = {i: float(s) for i, s in zip(order, sorted(rs, reverse=True))}
        else:
            scores = {i: float(sims[i]) for i in order}
        return [
            {"quote": chunks[i], "score": round(scores[i], 4)}
            for i in order[:top_k]
        ]


_engine = None

def engine():
    global _engine
    if _engine is None:
        try:
            _engine = SbertEngine()
            print("[evidence] engine: sbert+crossencoder", flush=True)
        except Exception as e:
            print(f"[evidence] sbert unavailable ({e}); engine: tfidf", flush=True)
            _engine = TfidfEngine()
    return _engine


# --------------------------------------------------------------------------
# HTTP layer (stdlib)
# --------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "EvidenceFinder/1.0"

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):  # quieter logs
        pass

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            try:
                eng = engine()
                self._json(200, {"status": "ok", "engines": [eng.name, "tfidf-fallback"]})
            except Exception as e:
                self._json(200, {"status": "degraded", "error": str(e)[:200]})
        else:
            self._json(404, {"detail": "use POST /find-evidence or GET /health"})

    def do_POST(self):
        if urlparse(self.path).path != "/find-evidence":
            return self._json(404, {"detail": "unknown endpoint"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json(400, {"detail": "invalid JSON"})
        requirement = f"{body.get('title', '')} {body.get('description', '')} {body.get('requirement', '')}".strip()
        chunks = chunk_text(body.get("docText", ""))
        if not requirement or not chunks:
            return self._json(200, {"quote": None, "score": 0.0, "method": "none", "candidates": []})
        top_k = max(1, min(int(body.get("topK", 3)), 5))
        try:
            eng = engine()
            cands = eng.score(requirement, chunks, top_k)
            best = cands[0] if cands else {"quote": None, "score": 0.0}
            self._json(200, {
                "quote": best["quote"],
                "score": best["score"],
                "method": eng.name,
                "candidates": cands,
            })
        except Exception as e:
            self._json(500, {"detail": f"scoring failed: {str(e)[:200]}"})


if __name__ == "__main__":
    print(f"[evidence] listening on :{PORT} (POST /find-evidence, GET /health)", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
