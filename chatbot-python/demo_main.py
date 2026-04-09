import os
import re
import faiss
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from groq import Groq
from dotenv import load_dotenv

# =============================
# Load ENV
# =============================
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("❌ GROQ_API_KEY not found in .env")

client = Groq(api_key=GROQ_API_KEY)

# Thư mục lưu index/chunks — dùng biến môi trường để dễ config Docker
STORAGE_DIR = os.getenv("STORAGE_DIR", ".")
INDEX_PATH  = os.path.join(STORAGE_DIR, "school_index.faiss")
CHUNKS_PATH = os.path.join(STORAGE_DIR, "chunks.txt")

# =============================
# FastAPI Init
# =============================
app = FastAPI(title="Viendong Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Dev mode
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================
# Load Embedding Model
# =============================
print("🔄 Loading embedding model...")
embed_model = SentenceTransformer("intfloat/multilingual-e5-base")
print("✅ Embedding model loaded")

# =============================
# Load FAISS Index
# =============================
print("🔄 Loading FAISS index...")
if os.path.exists(INDEX_PATH):
    index = faiss.read_index(INDEX_PATH)
    print("✅ FAISS index loaded")
else:
    print("⚠️ Index chưa có, sẽ tạo sau khi train lần đầu")
    index = None

# =============================
# Load Documents
# =============================
if os.path.exists(CHUNKS_PATH):
    with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
        documents = [doc.strip() for doc in f.read().split("\n---\n") if doc.strip()]
    print(f"✅ Loaded {len(documents)} chunks")
else:
    documents = []
    print("⚠️ Chưa có chunks.txt")

# =============================
# Helper: Search Function
# =============================
def search_documents(question: str, top_k: int = 6):

    query_vector = embed_model.encode(
        ["query: " + question],
        normalize_embeddings=True
    ).astype("float32")

    k = min(top_k, len(documents))
    D, I = index.search(query_vector, k=k)

    results = []
    for score, idx in zip(D[0], I[0]):
        if 0 <= idx < len(documents):
            results.append((score, documents[idx]))

    return results


# =============================
# Health Check
# =============================
DATA_FOLDER = "data-txt"

def rebuild_index():
    """Đọc lại toàn bộ data-txt, rebuild FAISS index."""
    global index, documents

    def split_faq(text):
        # Split theo [HEADING] blocks
        parts = re.split(r'\n(?=\[)', text)
        chunks = []
        for part in parts:
            part = part.strip()
            if not part:
                continue
            # Nếu quá dài, chia nhỏ hơn theo paragraph
            if len(part) > 800:
                sub_parts = [p.strip() for p in part.split('\n\n') if p.strip()]
                # Gộp heading vào mỗi sub-chunk
                heading = sub_parts[0] if sub_parts else ""
                for sp in sub_parts[1:]:
                    chunks.append(f"{heading}\n{sp}")
                if sub_parts:
                    chunks.append(sub_parts[0])
            else:
                chunks.append(part)
        if not chunks:
            chunks = [p.strip() for p in text.split('\n\n') if p.strip()]
        return chunks

    all_chunks = []
    for filename in os.listdir(DATA_FOLDER):
        if filename.endswith(".txt"):
            with open(os.path.join(DATA_FOLDER, filename), "r", encoding="utf-8") as f:
                text = f.read()
                all_chunks.extend(split_faq(text))

    if not all_chunks:
        return 0

    embeddings = embed_model.encode(
        ["passage: " + chunk for chunk in all_chunks],
        normalize_embeddings=True
    )
    dimension = embeddings.shape[1]
    new_index = faiss.IndexFlatIP(dimension)
    new_index.add(np.array(embeddings).astype("float32"))
    os.makedirs(STORAGE_DIR, exist_ok=True)
    faiss.write_index(new_index, INDEX_PATH)

    with open(CHUNKS_PATH, "w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(chunk.strip() + "\n---\n")

    # Cập nhật runtime
    index = new_index
    documents[:] = all_chunks
    return len(all_chunks)


@app.get("/")
def root():
    return {"status": "Viendong Chatbot API running"}


@app.get("/chatbot/chunks")
@app.get("/chunks")
def get_chunks():
    """Trả về danh sách các chunk đã được index."""
    result = []
    for i, doc in enumerate(documents):
        lines = doc.strip().split('\n')
        heading = lines[0].strip() if lines else f"Chunk {i+1}"
        full = '\n'.join(lines[1:]).strip() if len(lines) > 1 else ''
        result.append({ "id": i, "heading": heading, "full": full })
    return { "total": len(documents), "chunks": result }


# =============================
# Main Ask Endpoint
# =============================
@app.get("/ask")
def ask(question: str):

    if not question.strip():
        return {"answer": "Bạn hỏi mình gì đó đi chứ 😄"}

    if index is None or not documents:
        return {"answer": "Bot chưa được huấn luyện dữ liệu. Vui lòng upload tài liệu trong phần Huấn luyện Bot nhé!"}

    try:
        search_results = search_documents(question)

        if not search_results:
            return {
                "answer": "Hmm mình chưa tìm thấy thông tin phù hợp 🤔 Bạn hỏi rõ hơn chút được không?"
            }

        best_score = search_results[0][0]
        print(f"🔍 Best score: {best_score:.4f} | Question: {question}")

        # Threshold thấp hơn để không bỏ sót câu hỏi hợp lệ
        if best_score < 0.35:
            return {
                "answer": "Mình chưa tìm thấy thông tin phù hợp với câu hỏi này 🤔 Bạn thử hỏi theo cách khác, hoặc liên hệ trực tiếp nhà trường để được tư vấn chi tiết nhé!"
            }

        # Lấy top 5 context, lọc những chunk có score đủ tốt
        good_results = [(s, d) for s, d in search_results if s >= 0.30]
        context_chunks = [doc for _, doc in good_results[:5]]
        context = "\n\n---\n\n".join(context_chunks)

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "system",
                    "content": """Bạn là trợ lý tư vấn tuyển sinh của Trường Cao đẳng Viễn Đông.

NHIỆM VỤ: Trả lời câu hỏi của học sinh/phụ huynh về tuyển sinh, học phí, ngành học, lịch thi, thủ tục nhập học.

PHONG CÁCH:
- Thân thiện, gần gũi như người anh/chị tư vấn thật
- Dùng ngôn ngữ tự nhiên, không cứng nhắc
- Có thể dùng emoji vừa phải để tạo cảm giác thân thiện

ĐỊNH DẠNG VĂN BẢN:
- TUYỆT ĐỐI KHÔNG dùng ký tự markdown: *, **, #, ##, _
- Nếu liệt kê nhiều mục, dùng dấu gạch đầu dòng: -
- Viết văn bản thuần, không format đặc biệt

QUY TẮC BẮT BUỘC:
- Chỉ dựa vào thông tin trong [CONTEXT] để trả lời
- Nếu context có thông tin → trả lời đầy đủ, rõ ràng, có cấu trúc (dùng - nếu có nhiều mục)
- Nếu context không đủ thông tin → thành thật nói chưa có thông tin cụ thể, rồi mời bạn nhắn trực tiếp để được hỗ trợ thêm: Zalo/ĐT 0922334400 (Cô Thơ) hoặc 0977334400 (Cô Thu). KHÔNG được nói chung chung "liên hệ phòng tuyển sinh" vì bạn đang nhắn tin trong kênh tuyển sinh rồi.
- KHÔNG bịa đặt số liệu, ngày tháng, học phí, điểm chuẩn
- KHÔNG suy luận hoặc ghép thông tin từ nhiều phần không liên quan để đưa ra câu trả lời mới
- KHÔNG tự ý đề xuất dịch vụ không có thật như "tư vấn 1:1", "đặt lịch tư vấn", "đăng ký miễn phí" — chỉ hướng dẫn liên hệ qua Zalo/SĐT nếu cần hỗ trợ thêm
- CHỈ trả lời đúng câu hỏi được hỏi. KHÔNG tự ý thêm thông tin ngoài lề (liên thông ĐH, ưu đãi, v.v.) khi người dùng không hỏi đến
- KHÔNG hỏi ngược lại "Bạn muốn tôi hỗ trợ thêm như thế nào?" hay "Bạn có muốn... không?" — trả lời xong là kết thúc, không kéo dài
- KHÔNG trả lời về chủ đề không liên quan đến nhà trường

VÍ DỤ SAI (KHÔNG làm theo):
Hỏi: "Khối Kinh tế có những ngành gì?"
Sai: "...Nếu bạn muốn đặt lịch tư vấn 1:1 miễn phí, tôi có thể giúp bạn liên hệ với phòng tuyển sinh. Bạn muốn tôi hỗ trợ thêm như thế nào?"
Đúng: Liệt kê các ngành rồi dừng. Nếu muốn hỏi thêm có thể nhắn Zalo 0922334400 (Cô Thơ) hoặc 0977334400 (Cô Thu)."""
                },
                {
                    "role": "user",
                    "content": f"""[CONTEXT]
{context}

[CÂU HỎI]
{question}"""
                }
            ],
            temperature=0.1,
            max_tokens=700
        )

        answer = response.choices[0].message.content.strip()

        return {"answer": answer}

    except Exception as e:
        print("❌ Error:", e)
        return {
            "answer": "Hiện tại hệ thống đang hơi bận 😥 Bạn thử lại sau giúp mình nhé!"
        }


# =============================
# Training Endpoint — URL
# =============================
class TrainUrlBody(BaseModel):
    url: str

@app.post("/train-url")
@app.post("/chatbot/train-url")
async def train_url(body: TrainUrlBody):
    """Scrape một trang web và train từ nội dung đó."""
    import requests
    from bs4 import BeautifulSoup
    from urllib.parse import urlparse

    url = body.url.strip()
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL không hợp lệ, phải bắt đầu bằng http:// hoặc https://")

    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CRMBot/1.0)"}
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không thể tải trang: {e}")

    try:
        soup = BeautifulSoup(resp.content, "html.parser")
        # Xoá script, style, nav, footer
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        # Gọn whitespace
        lines = [ln.strip() for ln in text.splitlines()]
        text = "\n".join(ln for ln in lines if ln)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi parse HTML: {e}")

    if len(text) < 100:
        raise HTTPException(status_code=400, detail="Trang web không có đủ nội dung để huấn luyện")

    os.makedirs(DATA_FOLDER, exist_ok=True)
    # Đặt tên file từ domain
    domain = urlparse(url).netloc.replace(".", "_")
    save_name = f"web_{domain}.txt"
    with open(os.path.join(DATA_FOLDER, save_name), "w", encoding="utf-8") as f:
        f.write(text)

    print(f"🌐 Đã scrape: {url} → {save_name} ({len(text)} chars)")
    chunk_count = rebuild_index()
    print(f"✅ Rebuild xong: {chunk_count} chunks")

    return {
        "ok": True,
        "file": save_name,
        "chunks": chunk_count,
        "message": f"Đã huấn luyện từ '{url}' — {chunk_count} đoạn văn bản",
    }


# =============================
# Training Endpoint — File
# =============================
@app.post("/train")
@app.post("/chatbot/train")
async def train_upload(file: UploadFile = File(...)):
    """Upload file TXT hoặc PDF, lưu vào data-txt, rebuild FAISS index."""
    filename = file.filename or "uploaded.txt"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in [".txt", ".pdf"]:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file .txt hoặc .pdf")

    os.makedirs(DATA_FOLDER, exist_ok=True)
    content_bytes = await file.read()

    if ext == ".pdf":
        try:
            import pypdf
            import io as _io
            reader = pypdf.PdfReader(_io.BytesIO(content_bytes))
            text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi đọc PDF: {e}")
        save_name = os.path.splitext(filename)[0] + ".txt"
        with open(os.path.join(DATA_FOLDER, save_name), "w", encoding="utf-8") as f:
            f.write(text)
    else:
        save_name = filename
        with open(os.path.join(DATA_FOLDER, save_name), "wb") as f:
            f.write(content_bytes)

    print(f"📄 Đã lưu: {save_name} — đang rebuild index...")
    chunk_count = rebuild_index()
    print(f"✅ Rebuild xong: {chunk_count} chunks")

    return {
        "ok": True,
        "file": save_name,
        "chunks": chunk_count,
        "message": f"Đã huấn luyện thêm từ '{save_name}' — {chunk_count} đoạn văn bản",
    }