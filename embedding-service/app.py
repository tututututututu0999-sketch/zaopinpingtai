import base64
import io
import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
from transformers import AutoModel, AutoTokenizer

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "jinaai/jina-clip-v2")
app = FastAPI(title="visual-archive-embedding")
model = None
image_preprocess = None
tokenizer = None


class EmbedRequest(BaseModel):
    type: Literal["text", "image"]
    content: str
    sections: list[str] | None = None


def load_model():
    global model, image_preprocess, tokenizer
    if model is None:
        # Jina CLIP v2 returns compatible vectors for Chinese text and image inputs.
        model = AutoModel.from_pretrained(MODEL_NAME, trust_remote_code=True, local_files_only=True)
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True, local_files_only=True)
        # The cached model snapshot can run fully offline. Its remote image
        # processor config is not always cached, so use the model's documented
        # CLIP normalization directly instead of triggering Hugging Face calls.
        from torchvision import transforms
        image_preprocess = transforms.Compose([
            transforms.Resize(512, interpolation=transforms.InterpolationMode.BICUBIC),
            transforms.CenterCrop(512),
            transforms.ToTensor(),
            transforms.Normalize((0.48145466, 0.4578275, 0.40821073), (0.26862954, 0.26130258, 0.27577711)),
        ])
    return model


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "loaded": model is not None}


@app.post("/embed")
def embed(payload: EmbedRequest):
    try:
        active_model = load_model()
        if payload.type == "text":
            import torch
            limit = min(tokenizer.model_max_length, getattr(getattr(active_model.config, "text_config", None), "max_position_embeddings", 8192))
            content = payload.content
            if payload.sections is not None:
                if len(payload.sections) != 6 or any(not section for section in payload.sections):
                    raise ValueError("视觉摘要必须包含完整六组字段")
                # Reserve a budget for every visual group; never silently drop the last groups.
                budget = (limit - 32) // 6
                if any(len(tokenizer.encode(section, add_special_tokens=False)) > budget for section in payload.sections):
                    raise ValueError("单组视觉描述超出token预算，请缩短描述后重新确认")
                content = "\n".join(payload.sections)
            if len(tokenizer.encode(content)) > limit:
                raise ValueError("文本超出模型token上限，请精简后重试")
            tokens = tokenizer([content], padding=True, truncation=False, return_tensors="pt").to(active_model.device)
            with torch.inference_mode():
                vector = active_model.get_text_features(tokens)
                vector = torch.nn.functional.normalize(vector, dim=-1)[0].cpu().numpy()
        else:
            raw = base64.b64decode(payload.content)
            image = Image.open(io.BytesIO(raw)).convert("RGB")
            import torch
            pixels = image_preprocess(image).unsqueeze(0).to(active_model.device)
            with torch.inference_mode():
                vector = active_model.get_image_features(pixels)
                vector = torch.nn.functional.normalize(vector, dim=-1)[0].cpu().numpy()
        return {"model": MODEL_NAME, "dimensions": len(vector), "embedding": vector.tolist(), "serializedContent": content if payload.type == "text" else None}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
