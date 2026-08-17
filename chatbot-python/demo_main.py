import os
import re
import json
import unicodedata
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
# Load Tuition JSON
# =============================
TUITION_JSON_PATH = os.path.join(os.path.dirname(__file__), "pdfs", "hoc_phi_viendong.json")
try:
    with open(TUITION_JSON_PATH, "r", encoding="utf-8") as _f:
        TUITION_DATA = json.load(_f)
    print(f"✅ Loaded tuition JSON: {TUITION_JSON_PATH}")
except Exception as _e:
    TUITION_DATA = {}
    print(f"⚠️ Không tải được tuition JSON: {_e}")

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
    (["bằng cấp 3", "bang cap 3", "bằng thpt", "bang thpt", "môn thpt", "mon thpt", "môn văn hoá", "mon van hoa", "7 môn", "9 môn", "môn học thpt", "thi tốt nghiệp thpt"],
     ["Toán", "Ngữ văn", "Vật lý", "Hoá học", "bằng cấp 3", "THPT", "văn hoá THPT", "GDKT"]),
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
# Tuition JSON Lookup
# =============================
def _normalize(text: str) -> str:
    """Chuẩn hóa chuỗi: bỏ dấu, lowercase, bỏ ký tự thừa."""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", " ", ascii_str.lower()).strip()


def _match_major(query_norm: str, major_name: str) -> bool:
    """Kiểm tra query có đề cập tên ngành không (so khớp từ hoàn chỉnh)."""
    # Thay thế viết tắt phổ biến trong câu hỏi
    aliases = {
        "cntt": "cong nghe thong tin",
        "qtkd": "quan tri kinh doanh",
        "tkdh": "thiet ke do hoa",
        "nhks": "nha hang khach san",
        "oto": "o to",
        "nna": "ngon ngu anh"
    }
    for k, v in aliases.items():
        if k in query_norm:
            query_norm = query_norm.replace(k, v)

    clean = re.sub(r"\(.*?\)", "", major_name).strip()
    major_norm = _normalize(clean)
    if major_norm in query_norm:
        return True
    
    major_tokens = major_norm.split()
    query_tokens = query_norm.split()
    key_tokens = [t for t in major_tokens if len(t) >= 4]
    if not key_tokens:
        return False
    
    return any(t in query_tokens for t in key_tokens)


def _fmt_money(amount) -> str:
    if amount is None:
        return "?"
    return f"{amount:,.0f}".replace(",", ".") + "đ"


def lookup_tuition_from_json(full_question: str, search_query: str) -> str | None:
    """
    Tra cứu học phí từ TUITION_DATA (hoc_phi_viendong.json).
    Trả về chuỗi trả lời hoặc None nếu không đủ thông tin.
    """
    q_all = (full_question + " " + search_query).lower()
    search_norm = _normalize(search_query)
    q_current = search_query.lower()  # Có thể là câu hỏi đã bị gộp với câu trước
    
    # Lấy câu hỏi thực sự cuối cùng (không gộp) để ưu tiên nhận diện hệ
    lines = full_question.strip().split('\n')
    last_q_only = ""
    for line in reversed(lines):
        if line.strip().startswith('Học sinh:'):
            last_q_only = line[len('Học sinh:'):].strip().lower()
            break
    if not last_q_only:
        last_q_only = q_current

    # 1. Xác định hệ đào tạo — ưu tiên câu hỏi cuối cùng
    wants_cd18 = any(kw in last_q_only for kw in ["cd18", "cđ18", "chính quy", "cao đẳng", "thpt", "cấp 3", "lớp 12"])
    wants_cd15 = any(kw in last_q_only for kw in ["cd15", "9+3", "học nghề", "vừa học vừa thi", "thcs", "cấp 2", "lớp 9"])
    
    # Nếu câu cuối không nói hệ, thử dò trong câu gộp (ngữ cảnh trước đó)
    if not wants_cd18 and not wants_cd15:
        wants_cd18 = any(kw in q_current for kw in ["cd18", "cđ18", "chính quy", "cao đẳng", "thpt", "cấp 3", "lớp 12"])
        wants_cd15 = any(kw in q_current for kw in ["cd15", "9+3", "học nghề", "vừa học vừa thi", "thcs", "cấp 2", "lớp 9"])

    # Nếu vẫn chưa rõ, tìm trong toàn bộ lịch sử (vì có thể HS đã nói ở câu trước)
    if not wants_cd18 and not wants_cd15:
        wants_cd18 = any(kw in full_question.lower() for kw in ["cd18", "cđ18", "chính quy", "cao đẳng", "thpt", "cấp 3", "lớp 12"])
        wants_cd15 = any(kw in full_question.lower() for kw in ["cd15", "9+3", "học nghề", "vừa học vừa thi", "thcs", "cấp 2", "lớp 9"])

    # Chua ro he
    is_asking_pa = any(kw in search_norm for kw in ["pa1", "pa2", "phuong an", "pa 1", "pa 2"])

    if is_asking_pa:
        cd18_pa = TUITION_DATA.get("cd18k20_dai_hoc_cao_dang", {}).get("phuong_an_giai_thich", {})
        lines = ["Giai thich 2 phuong an dong hoc phi:"]
        if cd18_pa.get("PA1"): lines.append(f"PA1: {cd18_pa['PA1']}")
        if cd18_pa.get("PA2"): lines.append(f"PA2: {cd18_pa['PA2']}")
        return "\n".join(lines)

    if not wants_cd18 and not wants_cd15:
        all_prices = []
        for sk in ["cd18k20_dai_hoc_cao_dang", "cd15k8_thcs_to_cao_dang"]:
            sd = TUITION_DATA.get(sk, {})
            for n in sd.get("danh_sach_nganh", []):
                p2 = n.get("PA2", {})
                v = p2.get("tam_thu_hk1") or p2.get("hoc_phi_phai_dong_moi_hk")
                if v:
                    all_prices.append(v)
        range_str = ""
        if all_prices:
            mn, mx = min(all_prices), max(all_prices)
            range_str = f"t\u1eeb {_fmt_money(mn)} \u0111\u1ebfn {_fmt_money(mx)}/HK"
        return (
            f"H\u1ecdc ph\u00ed t\u1ea1i Vi\u1ec5n \u0110\u00f4ng dao \u0111\u1ed9ng {range_str} t\u00f9y ng\u00e0nh v\u00e0 h\u1ec7 \u0111\u00e0o t\u1ea1o nha. "
            f"B\u1ea1n \u0111ang h\u1ecdc theo h\u1ec7 n\u00e0o \u0111\u1ec3 m\u00ecnh b\u00e1o ch\u00ednh x\u00e1c h\u01a1n?\n"
            f"- C\u0110\u0318: Cao \u0111\u1eb3ng ch\u00ednh quy (2.5 n\u0103m) \u2014 d\u00e0nh cho h\u1ecdc sinh t\u1ed1t nghi\u1ec7p THPT\n"
            f"- CD15: H\u1ec7 9+3+1 v\u1eeba h\u1ecdc ngh\u1ec1 v\u1eeba thi t\u1ed1t nghi\u1ec7p THPT \u2014 d\u00e0nh cho h\u1ecdc sinh THCS"
        )

    system_key = "cd18k20_dai_hoc_cao_dang" if wants_cd18 else "cd15k8_thcs_to_cao_dang"
    system_data = TUITION_DATA.get(system_key, {})
    if not system_data:
        return None

    label = "Hệ Cao đẳng chính quy (CĐ18)" if wants_cd18 else "Hệ 9+3+1 - Học nghề (CD15)"
    luu_y = system_data.get("luu_y_dong_hoc_phi", "")

    # 2. Tìm ngành khớp trong danh sách
    danh_sach = system_data.get("danh_sach_nganh", [])
    matched = [n for n in danh_sach if _match_major(search_norm, n.get("nganh_hoc", ""))]

    pa_giai_thich = system_data.get("phuong_an_giai_thich", {})
    is_asking_pa = any(kw in search_norm for kw in ["pa1", "pa2", "phuong an", "pa 1", "pa 2"])

    # Nếu hỏi giải thích PA mà không kèm ngành cụ thể
    if is_asking_pa and not matched:
        lines = [f"Dưới đây là giải thích chi tiết về các phương án đóng học phí của {label}:"]
        if pa_giai_thich.get("PA1"): lines.append(f"👉 PA1: {pa_giai_thich['PA1']}")
        if pa_giai_thich.get("PA2"): lines.append(f"👉 PA2: {pa_giai_thich['PA2']}")
        return "\n".join(lines)

    # Nếu không khớp ngành cụ thể → hỏi ngược ngành (không để FAISS/LLM trả bừa)
    if not matched:
        label = "Hệ Cao đẳng chính quy (CĐ18)" if wants_cd18 else "Hệ 9+3+1 - Học nghề (CD15)"
        # Tính khoảng học phí PA2 (đóng thực tế thấp nhất) của hệ đó
        if wants_cd18:
            prices = [
                n["PA2"]["tam_thu_hk1"]
                for n in danh_sach
                if n.get("PA2", {}).get("tam_thu_hk1")
            ]
        else:
            prices = [
                n["PA2"]["hoc_phi_phai_dong_moi_hk"]
                for n in danh_sach
                if n.get("PA2", {}).get("hoc_phi_phai_dong_moi_hk")
            ]
        range_str = ""
        if prices:
            mn, mx = min(prices), max(prices)
            if mn == mx:
                range_str = f"khoảng {_fmt_money(mn)}/HK"
            else:
                range_str = f"từ {_fmt_money(mn)} đến {_fmt_money(mx)}/HK"
        return (
            f"Học phí {label} dao động {range_str} tùy ngành nha "
            f"(đây là mức đóng thực tế theo PA2, sau khi đã trừ trợ cấp nhà nước). "
            f"Bạn muốn xem học phí ngành nào cụ thể?"
        )

    # Lấy ngành khớp đầu tiên (hoặc tất cả nếu nhiều)
    lines = [f"Có 2 phương án đóng học phí, PH chọn 1 trong 2 phương án đều được ạ\n"]

    for nganh in matched[:3]:  # tối đa 3 ngành nếu query chung chung
        name = nganh["nganh_hoc"]
        pa1 = nganh.get("PA1", {})
        pa2 = nganh.get("PA2", {})

        if wants_cd18:
            # CD18: tam_thu_hk1 + tron_khoa + cap_bu (nếu có)
            pa1_hk = pa1.get("tam_thu_hk1")
            pa1_tk = pa1.get("tron_khoa")
            pa2_hk = pa2.get("tam_thu_hk1")
            pa2_tk = pa2.get("tron_khoa")
            cap_bu = pa1.get("cap_bu_6_hk")

            entry = f"Ngành {name}:\n"
            if pa1_hk and pa1_tk:
                entry += f"- PA1: tạm thu {_fmt_money(pa1_hk)}/HK (trọn khóa {_fmt_money(pa1_tk)})"
                if cap_bu:
                    entry += f" — Nhà nước cấp bù {_fmt_money(cap_bu)}/6HK"
                entry += "\n"
            if pa2_hk and pa2_tk:
                entry += f"- PA2: {_fmt_money(pa2_hk)}/HK (trọn khóa {_fmt_money(pa2_tk)})\n"

            ghi_chu = nganh.get("ghi_chu")
            if ghi_chu:
                entry += f"  ({ghi_chu})\n"

        else:
            # CD15: hoc_phi_phai_dong_moi_hk + hoan_tra
            pa1_hk = pa1.get("hoc_phi_phai_dong_moi_hk")
            pa1_ht = pa1.get("hoc_phi_nha_nuoc_hoan_tra_moi_hk")
            pa2_hk = pa2.get("hoc_phi_phai_dong_moi_hk")

            entry = f"Ngành {name}:\n"
            if pa1_hk:
                entry += f"- PA1: {_fmt_money(pa1_hk)}/HK"
                if pa1_ht:
                    entry += f" (Nhà nước hoàn trả {_fmt_money(pa1_ht)}/HK sau)"
                entry += "\n"
            if pa2_hk:
                entry += f"- PA2: {_fmt_money(pa2_hk)}/HK\n"

        lines.append(entry.strip())

    if luu_y:
        lines.append(f"\n\U0001f4a1 L\u01b0u \u00fd: {luu_y}")

    return "\n".join(lines).strip()


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

    # Greeting detection — trả lời thẳng, không cần FAISS
    _last_line = question.strip().split('\n')[-1].strip().lower()
    _greeting_keywords = ["xin chào", "chào", "hello", "hi ", "hi!", "hey", "alo", "alô", "ơi"]
    if any(_last_line == kw or _last_line.startswith(kw) for kw in _greeting_keywords) and len(_last_line) < 30:
        return {"answer": "Chào bạn 👋 Mình là trợ lý tư vấn tuyển sinh của Trường Cao đẳng Viễn Đông nha. Bạn cần tư vấn gì cứ hỏi mình nhé!"}

    # Lấy câu hỏi cuối của học sinh để check keyword (tránh match từ tin nhắn staff trong context)
    _student_q = extract_last_question(question).lower()

    # Cán bộ tư vấn bypass — hardcode để tránh LLM hallucinate tên
    _cbtv_kws = ["cán bộ tư vấn", "tư vấn viên", "ai tư vấn", "người tư vấn", "nhân viên tư vấn", "cô thơ", "cô thu", "thầy nhanh", "thầy huy", "số tư vấn", "sdt tư vấn", "liên hệ tư vấn"]
    if any(kw in _student_q for kw in _cbtv_kws):
        return {"answer": "Đội ngũ cán bộ tư vấn tuyển sinh của trường nha:\n- Cô Thơ: 0922334400\n- Cô Thu: 0977334400\n- Thầy Nhanh: 0978734400\n- Thầy Huy: 0966337755\n\nBạn nhắn Zalo hoặc gọi trực tiếp đều được nhé 😊"}

    # Địa chỉ trường bypass — hardcode để tránh LLM hallucinate địa chỉ sai (vd: Cà Mau)
    _diachi_kws = ["địa chỉ", "ở đâu", "tọa lạc", "nằm ở", "đường nào", "quận nào", "phường nào", "trường ở", "cơ sở", "campus", "tìm trường", "đến trường", "xe bus"]
    if any(kw in _student_q for kw in _diachi_kws):
        return {"answer": "Trường Cao đẳng Viễn Đông tọa lạc tại: Lô 2, Công viên Phần mềm Quang Trung, Phường Trung Mỹ Tây, TP.HCM (gần ngã tư An Sương) nha 📍\nCó nhiều tuyến xe bus đi ngang, rất thuận tiện đi lại!"}

    # Tín chỉ bypass — chunk ngắn FAISS không retrieve được
    _tinchi_kws = ["tín chỉ", "tin chỉ", "1 tín", "một tín", "giá tín", "tiền tín", "bao nhiêu tín"]
    if any(kw in _student_q for kw in _tinchi_kws):
        return {"answer": "Học phí tính theo tín chỉ tại Viễn Đông dao động từ 470.000đ đến 670.000đ mỗi tín chỉ (15 tiết học), tùy chuyên ngành nha!"}

    if index is None or not documents:
        return {"answer": "Bot chưa được huấn luyện dữ liệu. Vui lòng upload tài liệu trong phần Huấn luyện Bot nhé!"}

    # Tách câu hỏi thực sự để search (không search cả đoạn hội thoại)
    search_query = extract_last_question(question)

    TUITION_KEYWORDS = ["học phí", "hoc phi", "chi phí", "đóng tiền", "phương án", "pa1", "pa2", "đóng bao nhiêu", "tốn bao nhiêu", "mất bao nhiêu", "tiền học"]
    is_tuition_q = any(kw in search_query.lower() for kw in TUITION_KEYWORDS)

    # Nếu Bot vừa hỏi ngược học sinh về hệ/ngành học phí, thì câu trả lời tiếp theo chắc chắn là luồng học phí
    last_context = "\n".join(question.strip().split('\n')[-6:]).lower()
    if "báo chính xác hơn" in last_context or "xem học phí ngành nào cụ thể" in last_context:
        # Trừ phi HS bẻ lái sang hỏi chủ đề khác
        if not any(kw in search_query.lower() for kw in ["xét tuyển", "xet tuyen", "điểm chuẩn", "diem chuan", "hồ sơ", "ho so"]):
            is_tuition_q = True

    # ── Bypass LLM cho câu hỏi học phí — tra cứu thẳng từ JSON ──
    if is_tuition_q and TUITION_DATA:
        tuition_answer = lookup_tuition_from_json(question, search_query)
        if tuition_answer:
            return {"answer": tuition_answer}
        # Nếu JSON không khớp → để fallthrough xuống FAISS + LLM bình thường

    try:
        loop = asyncio.get_event_loop()
        search_results = await loop.run_in_executor(None, lambda: search_documents(search_query, 12))

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
- LUÔN trả lời bằng TIẾNG VIỆT. TUYỆT ĐỐI KHÔNG dùng tiếng Anh, tiếng Thái, hoặc bất kỳ ngôn ngữ nào khác dù chỉ 1 từ
- Chỉ dựa vào thông tin trong [CONTEXT] để trả lời
- Nếu context có thông tin → trả lời đầy đủ, rõ ràng, có cấu trúc (dùng - nếu có nhiều mục)
- Nếu context không đủ thông tin → thành thật nói chưa có thông tin cụ thể, rồi mời bạn nhắn trực tiếp để được hỗ trợ thêm: Zalo/ĐT 0922334400 (Cô Thơ) hoặc 0977334400 (Cô Thu). KHÔNG được nói chung chung "liên hệ phòng tuyển sinh" vì bạn đang nhắn tin trong kênh tuyển sinh rồi.
- TUYỆT ĐỐI KHÔNG xác nhận trường CÓ một ngành/môn/dịch vụ nếu [CONTEXT] không ghi rõ điều đó. Ví dụ: hỏi "trường có dạy tiếng Trung không?" mà context không đề cập tiếng Trung → KHÔNG được nói "có dạy", phải nói "mình chưa thấy thông tin về tiếng Trung, bạn liên hệ Cô Thơ 0922334400 để xác nhận nha".
- KHÔNG bịa đặt số liệu, ngày tháng, học phí, điểm chuẩn
- KHÔNG suy luận hoặc ghép thông tin từ nhiều phần không liên quan để đưa ra câu trả lời mới
- KHÔNG tự ý đề xuất dịch vụ không có thật như "tư vấn 1:1", "đặt lịch tư vấn", "đăng ký miễn phí" — chỉ hướng dẫn liên hệ qua Zalo/SĐT nếu cần hỗ trợ thêm
- CHỈ trả lời đúng câu hỏi được hỏi. KHÔNG tự ý thêm thông tin ngoài lề (liên thông ĐH, ưu đãi, v.v.) khi người dùng không hỏi đến
- KHI trả lời về học phí: LUÔN trình bày đủ 2 phương án PA1 và PA2 theo đúng format trong context. KHÔNG chỉ nêu 1 mức học phí chung chung. Câu mở đầu bắt buộc là: "Có 2 phương án đóng học phí, PH chọn 1 trong 2 phương án đều được ạ"
- SỐ TIỀN HỌC PHÍ: PHẢI lấy đúng 100% từ [CONTEXT]. TUYỆT ĐỐI KHÔNG tự điền số tiền nếu không thấy trong context. Nếu context không có số tiền cụ thể → nói "liên hệ Cô Thơ 0922334400 hoặc Cô Thu 0977334400 để biết mức học phí chính xác".
- KHÔNG hỏi ngược lại "Bạn muốn tôi hỗ trợ thêm như thế nào?" hay "Bạn có muốn... không?" — trả lời xong là kết thúc, không kéo dài
- KHÔNG trả lời về chủ đề không liên quan đến nhà trường
- KHI người dùng hỏi về đăng ký xét tuyển, cách đăng ký, nộp hồ sơ: LUÔN gửi kèm link đăng ký https://tuyensinh.viendong.edu.vn/xettuyen/

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
            model="llama-3.1-70b-versatile",
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