import os
import re
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

DATA_FOLDER = "data-txt"

model = SentenceTransformer("intfloat/multilingual-e5-base")

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
        if len(part) > 800:
            sub_parts = [p.strip() for p in part.split('\n\n') if p.strip()]
            heading = sub_parts[0] if sub_parts else ""
            for sp in sub_parts[1:]:
                chunks.append(f"{heading}\n{sp}")
            if sub_parts:
                chunks.append(sub_parts[0])
        else:
            chunks.append(part)

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