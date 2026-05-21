import os
import re
import faiss
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from groq import Groq
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

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
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Viendong Chatbot API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
KEYWORD_BOOST_GROUPS = [
    (["học phí", "hoc phi", "chi phí", "chi phi", "đóng tiền", "dong tien", "phương án", "phuong an", "pa1", "pa2", "gia tien", "giá tiền"],
     ["học phí", "PA1", "PA2", "phương án", "HK", "đồng/HK", "cấp bù"]),
    (["ngành", "nganh", "xét tuyển", "xet tuyen", "tuyển sinh", "tuyen sinh", "đăng ký", "dang ky"],
     ["ngành", "tuyển sinh", "xét tuyển"]),
]

def search_documents(question: str, top_k: int = 12):
    query_lower = question.lower()

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

    # Keyword boost: nếu câu hỏi chứa từ khoá nhóm, ưu tiên chunk liên quan
    for trigger_keywords, content_keywords in KEYWORD_BOOST_GROUPS:
        if any(kw in query_lower for kw in trigger_keywords):
            boosted = []
            for score, doc in results:
                doc_lower = doc.lower()
                if any(kw.lower() in doc_lower for kw in content_keywords):
                    boosted.append((score + 0.05, doc))
                else:
                    boosted.append((score, doc))
            results = sorted(boosted, key=lambda x: x[0], reverse=True)
            break

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
def extract_last_question(text: str) -> str:
    """Build search query từ conversation context.
    Nếu câu hỏi cuối ngắn/mơ hồ, gộp với câu trước để giữ chủ đề."""
    lines = text.strip().split('\n')
    student_lines = []
    for line in lines:
        line = line.strip()
        if line.startswith('Học sinh:'):
            student_lines.append(line[len('Học sinh:'):].strip())

    if not student_lines:
        # Fallback: lấy dòng cuối cùng không rỗng
        for line in reversed(lines):
            if line.strip():
                return line.strip()
        return text.strip()

    last_q = student_lines[-1]

    # Câu ngắn/mơ hồ → gộp với câu trước để giữ topic (vd: "CNTT", "Cơ khí")
    if len(last_q) < 40 and len(student_lines) >= 2:
        return f"{student_lines[-2]} {last_q}"

    return last_q


@app.get("/ask")
@limiter.limit("20/minute")
async def ask(request: Request, question: str):
    import asyncio

    if not question.strip():
        return {"answer": "Bạn hỏi mình gì đó đi chứ 😄"}

    if index is None or not documents:
        return {"answer": "Bot chưa được huấn luyện dữ liệu. Vui lòng upload tài liệu trong phần Huấn luyện Bot nhé!"}

    # Tách câu hỏi thực sự để search (không search cả đoạn hội thoại)
    search_query = extract_last_question(question)

    try:
        loop = asyncio.get_event_loop()
        search_results = await loop.run_in_executor(None, search_documents, search_query)

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

        TUITION_KEYWORDS = ["học phí", "hoc phi", "chi phí", "đóng tiền", "phương án", "pa1", "pa2", "đóng bao nhiêu", "tốn bao nhiêu", "mất bao nhiêu"]
        is_tuition_q = any(kw in search_query.lower() for kw in TUITION_KEYWORDS)

        # Bypass LLM cho câu hỏi học phí — trả thẳng text từ chunk để tránh hallucinate số tiền
        if is_tuition_q:
            def detect_system(chunk):
                low = chunk.lower()
                if "cd18" in low or "cđ18" in low or "chính quy" in low:
                    return "CD18"
                if "cd15" in low or "9+3+1" in low:
                    return "CD15"
                return "unknown"

            def extract_pa_sections(chunk):
                sections = []
                paragraphs = [p.strip() for p in re.split(r'\n\n+', chunk) if p.strip()]
                for para in paragraphs:
                    lines = [l.strip() for l in para.splitlines() if l.strip()]
                    pa1 = next((l for l in lines if l.lower().startswith("- pa1") or l.lower().startswith("pa1")), None)
                    pa2 = next((l for l in lines if l.lower().startswith("- pa2") or l.lower().startswith("pa2")), None)
                    if pa1 and pa2:
                        heading = next((l for l in lines if not l.startswith("[") and "pa1" not in l.lower() and "pa2" not in l.lower() and len(l) > 5), "")
                        sections.append((heading, pa1, pa2))
                return sections

            # Detect hệ từ toàn bộ conversation (kể cả lịch sử chat)
            q_lower = question.lower()
            wants_cd18 = any(kw in q_lower for kw in ["cd18", "cđ18", "chính quy", "cao đẳng chính quy", "18"])
            wants_cd15 = any(kw in q_lower for kw in ["cd15", "9+3+1", "học nghề", "15", "vừa học vừa thi"])

            # Chưa rõ hệ → hỏi ngược lại
            if not wants_cd18 and not wants_cd15:
                return {"answer": "Trường có 2 hệ đào tạo nha, bạn đang hỏi hệ nào?\n- CĐ18: Cao đẳng chính quy (2.5 năm)\n- CD15: Hệ 9+3+1 vừa học nghề vừa thi tốt nghiệp THPT"}

            # Scan toàn bộ documents, ưu tiên chunk khớp từ khoá ngành
            stop = {"học", "phí", "ngành", "hỏi", "muốn", "bao", "nhiêu", "tôi", "của", "cho", "là", "và", "á", "ạ", "cd18", "cd15", "hệ"}
            subject_kws = [w for w in re.split(r'[\s,\.]+', search_query.lower()) if len(w) > 2 and w not in stop]
            all_pa = [(doc, sum(1 for kw in subject_kws if kw in doc.lower()))
                      for doc in documents if "pa1" in doc.lower() and "pa2" in doc.lower()]
            all_pa.sort(key=lambda x: x[1], reverse=True)

            cd18_entry, cd15_entry = None, None
            for chunk, score in all_pa:
                system = detect_system(chunk)
                sections = extract_pa_sections(chunk)
                if not sections:
                    continue
                heading, pa1, pa2 = sections[0]
                entry = f"{heading}\n{pa1}\n{pa2}" if heading else f"{pa1}\n{pa2}"
                if system == "CD18" and cd18_entry is None:
                    cd18_entry = entry
                elif system == "CD15" and cd15_entry is None:
                    cd15_entry = entry
                if cd18_entry and cd15_entry:
                    break

            target = cd18_entry if wants_cd18 else cd15_entry
            label = "Hệ Cao đẳng chính quy (CĐ18)" if wants_cd18 else "Hệ 9+3+1 - Học nghề (CD15)"

            if target:
                out = [
                    f"Học phí {label}, có 2 phương án PH chọn 1 đều được nha 💰",
                    target,
                    "\nMỗi HK chia đóng 2-3 lần, đợt 1 HK1 tối thiểu 5 triệu."
                ]
                return {"answer": "\n".join(out)}

            return {"answer": "Mình chưa tìm thấy thông tin học phí cụ thể cho ngành này 🤔 Bạn nhắn Zalo 0922334400 (Cô Thơ) hoặc 0977334400 (Cô Thu) để được báo giá chi tiết theo 2 PA nha!"}

        messages = [
            {
                "role": "system",
                "content": """Bạn là trợ lý tư vấn tuyển sinh của Trường Cao đẳng Viễn Đông.

NHIỆM VỤ: Trả lời câu hỏi của học sinh/phụ huynh về tuyển sinh, học phí, ngành học, lịch thi, thủ tục nhập học.

PHONG CÁCH — GEN Z:
- Nói chuyện như người anh/chị Gen Z tư vấn thật: tự nhiên, gần gũi, không văn phòng
- Dùng ngôn ngữ Gen Z tự nhiên: "thì", "nha", "á", "oke", "chill", "ez", "btw"... nhưng vẫn rõ ràng, không lố
- Emoji vừa đủ (1-2 cái/câu), không spam
- NGẮN GỌN là ưu tiên số 1: đủ ý, không dài dòng, không giải thích thừa
- Không mở đầu bằng "Chào bạn!" hay "Xin chào!" mỗi câu — chỉ trả lời thẳng vào vấn đề

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
- KHI trả lời về học phí: LUÔN trình bày đủ 2 phương án PA1 và PA2 theo đúng format trong context. KHÔNG chỉ nêu 1 mức học phí chung chung. Câu mở đầu bắt buộc là: "Có 2 phương án đóng học phí, PH chọn 1 trong 2 phương án đều được ạ"
- SỐ TIỀN HỌC PHÍ: PHẢI lấy đúng 100% từ [CONTEXT]. TUYỆT ĐỐI KHÔNG tự điền số tiền nếu không thấy trong context. Nếu context không có số tiền cụ thể → nói "liên hệ Cô Thơ 0922334400 hoặc Cô Thu 0977334400 để biết mức học phí chính xác".
- KHÔNG hỏi ngược lại "Bạn muốn tôi hỗ trợ thêm như thế nào?" hay "Bạn có muốn... không?" — trả lời xong là kết thúc, không kéo dài
- KHÔNG trả lời về chủ đề không liên quan đến nhà trường

VÍ DỤ ĐÚNG về học phí (bắt buộc làm theo format này):
Hỏi: "Học phí ngành Kế toán?"
Đúng: "Có 2 phương án đóng học phí, PH chọn 1 trong 2 phương án đều được ạ
- PA1: đóng 11.000.000 đồng/HK, nhà nước không có cấp bù riêng cho khối kinh tế
- PA2: đóng 11.000.000 đồng/HK (học phí trọn khóa 6 HK: 68.000.000 đồng)"

VÍ DỤ SAI về học phí (KHÔNG làm theo):
Sai: "Học phí ngành Kế toán là 10.000.000đ/năm" — SAI vì tự bịa số tiền và không có 2 PA

VÍ DỤ SAI về format (KHÔNG làm theo):
Hỏi: "Khối Kinh tế có những ngành gì?"
Sai: "...Nếu bạn muốn đặt lịch tư vấn 1:1 miễn phí, tôi có thể giúp bạn liên hệ với phòng tuyển sinh. Bạn muốn tôi hỗ trợ thêm như thế nào?"
Đúng: Liệt kê các ngành rồi dừng. Nếu muốn hỏi thêm có thể nhắn Zalo 0922334400 (Cô Thơ) hoặc 0977334400 (Cô Thu)."""
            },
        ]

        messages.append({
            "role": "user",
            "content": f"""[CONTEXT]
{context}

[CÂU HỎI]
{question}"""
        })

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=messages,
            temperature=0.05,
            max_tokens=600
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
@limiter.limit("5/minute")
async def train_url(request: Request, body: TrainUrlBody):
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
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB

@app.post("/train")
@app.post("/chatbot/train")
@limiter.limit("5/minute")
async def train_upload(request: Request, file: UploadFile = File(...)):
    """Upload file TXT hoặc PDF, lưu vào data-txt, rebuild FAISS index."""
    filename = file.filename or "uploaded.txt"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in [".txt", ".pdf"]:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file .txt hoặc .pdf")

    os.makedirs(DATA_FOLDER, exist_ok=True)
    content_bytes = await file.read()

    if len(content_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File quá lớn (tối đa {MAX_UPLOAD_BYTES // 1024 // 1024}MB)")

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