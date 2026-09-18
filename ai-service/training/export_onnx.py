"""Export the trained reranker to INT8 ONNX for CPU serving.
Run on Colab after train.py: python export_onnx.py --model ./models/reranker --out reranker-int8.onnx
~25MB, <50ms on CPU, no GPU, no network. Drop into ai-service/models/."""
import argparse

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", default="reranker-int8.onnx")
    args = ap.parse_args()

    from sentence_transformers import CrossEncoder
    import torch

    ce = CrossEncoder(args.model)
    ce.model.eval()
    tok = ce.tokenizer
    dummy = tok(["requirement text"], ["evidence chunk text"],
                return_tensors="pt", padding=True, truncation=True, max_length=256)
    torch.onnx.export(
        ce.model, (dummy["input_ids"], dummy["attention_mask"]),
        args.out, input_names=["input_ids", "attention_mask"],
        output_names=["logit"], opset_version=14, dynamic_axes={
            "input_ids": {0: "batch"}, "attention_mask": {0: "batch"}, "logit": {0: "batch"}},
    )
    from onnxruntime.quantization import quantize_dynamic, QuantType
    q = args.out.replace(".onnx", "-q.onnx")
    quantize_dynamic(args.out, q, weight_type=QuantType.QInt8)
    import os
    print(f"fp32: {args.out} ({os.path.getsize(args.out)//1024} KB)")
    print(f"int8: {q} ({os.path.getsize(q)//1024} KB)  <- ship this")

if __name__ == "__main__":
    main()
