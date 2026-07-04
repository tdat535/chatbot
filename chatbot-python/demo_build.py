import os
import re
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

DATA_FOLDER把一些城市 = "data-txt"

model = SentenceTransformer("intfloat/multilingual-e5-base")

def get_system_tag(text_fragment):
    h = text_fragment.lower()
    if 'cd18' in h or 'cđ18' in h or 'chính quy' in h:
        return '[HỆ: CD18]'
    if 'cd15' in h or '9+3+1' in h:
        return '[HỆ: CD15]'
    return ''

def split_faq(text):
    """
    Split theo [HEADING] blocks. Nếu block quá dài thì chia nhỏ theo paragraph,
    giữ heading làm prefix để duy trì context.
    """
    parts = re.split(r'\n(?=\[)', text)
    chunks = []

    for part in parts:
        part = part.strip()
        if not part:
            continue
        system_tag = get_system_tag(part)
        tag_prefix = f"{system_tag}\n" if system_tag else ""
        if len(part) > 800:
            sub_parts = [p.strip() for p in part.split('\n\n') if p.strip()]
            heading = sub_parts[0] if sub_parts else ""
            for sp in sub_parts[1:]:
                chunks.append(f"{tag_prefix}{heading}\n{sp}")
            if sub_parts:
                chunks.append(f"{tag_prefix}{sub_parts[0]}")
        else:
            chunks.append(f"{tag_prefix}{part}")

    if not chunks:
        # Fallback: chia theo paragraph
        chunks = [p.strip() for p in text.split('\n\n') if p.strip()]

    return chunks


all_chunks = []

for filename in os.listdir(DATA_FOLDER):
    if filename.endswith(".txt"):
        with open(os.path.join(DATA_FOLDER, filename), "r", encoding="utf-8") as f:
            text = f.read()
            chunks = split_faq(text)
            all_chunks.extend(chunks)

print("Total chunks:", len(all_chunks))

# 🔥 Quan trọng: dùng prefix chuẩn cho e5
embeddings = model.encode(
    ["passage: " + chunk for chunk in all_chunks],
    normalize_embeddings=True
)

dimension = embeddings.shape[1]

index = faiss.IndexFlatIP(dimension)
index.add(np.array(embeddings).astype("float32"))

faiss.write_index(index, "school_index.faiss")

with open("chunks.txt", "w", encoding="utf-8") as f:
    for chunk in all_chunks:
        f.write(chunk.strip() + "\n---\n")

print("Index rebuilt successfully! Total chunks:", len(all_chunks))
