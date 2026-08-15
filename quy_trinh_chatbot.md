# BÁO CÁO QUY TRÌNH XÂY DỰNG AI CHATBOT TƯ VẤN TUYỂN SINH

## 1. Tổng quan Kiến trúc Hệ thống
Chatbot được xây dựng dựa trên kiến trúc **RAG (Retrieval-Augmented Generation)**, kết hợp giữa cơ sở dữ liệu Vector để tìm kiếm ngữ cảnh và mô hình ngôn ngữ lớn (LLM) để sinh câu trả lời tự nhiên.

**Các công nghệ cốt lõi được sử dụng:**
- **Framework API:** FastAPI (Python) - xử lý request tốc độ cao, hỗ trợ bất đồng bộ (async).
- **Mô hình nhúng (Embedding Model):** `intfloat/multilingual-e5-base` (Sentence Transformers) - chuyên xử lý tiếng Việt và đa ngôn ngữ để biến đổi văn bản thành vector.
- **Cơ sở dữ liệu Vector:** FAISS (Facebook AI Similarity Search) - lưu trữ và tìm kiếm vector siêu tốc.
- **Mô hình Ngôn ngữ (LLM):** `Llama-3.3-70b-versatile` thông qua nền tảng API của **Groq** (đảm bảo tốc độ sinh text cực nhanh).
- **Bảo mật & Tối ưu:** Sử dụng `slowapi` để chặn spam (Rate limiting).

---

## 2. Quy trình Xử lý và Chuẩn bị Dữ liệu (Data Ingestion)
Toàn bộ dữ liệu kiến thức (văn bản giới thiệu, quy chế tuyển sinh) được lưu trữ trong thư mục `data-txt/`. Quá trình chuyển hóa dữ liệu (build index) diễn ra qua các bước:

### 2.1. Phân mảnh dữ liệu (Chunking)
- Các file văn bản gốc (`.txt`) được đọc và chia nhỏ thành nhiều đoạn (chunks).
- **Thuật toán chia nhỏ:** Ưu tiên cắt theo các thẻ tiêu đề (Heading). Nếu một đoạn văn quá dài (trên 800 ký tự), hệ thống tự động ngắt theo từng đoạn (paragraph) nhỏ hơn, nhưng vẫn giữ lại tiêu đề gốc ở đầu mỗi đoạn để không làm mất ngữ cảnh.
- Gắn thẻ meta (System tags): Dựa vào từ khóa trong đoạn văn (như `cd18`, `cđ18`, `cd15`), hệ thống tự động dán nhãn `[HỆ: CD18]` hoặc `[HỆ: CD15]` để tăng độ chính xác khi tìm kiếm.

### 2.2. Nhúng dữ liệu (Embedding) và Lưu trữ
- Các đoạn text sau khi cắt sẽ được thêm tiền tố `"passage: "` (chuẩn của mô hình E5) và đưa qua SentenceTransformer để biến thành các ma trận số học (vector).
- Các vector này được nạp vào FAISS Index và lưu xuống file tĩnh `school_index.faiss`. 
- Nội dung chữ (text text) tương ứng được lưu vào file `chunks.txt` để đối chiếu và trích xuất sau này.

---

## 3. Luồng Xử lý Truy vấn Của Người Dùng (RAG & Query Flow)
Khi người dùng đặt câu hỏi qua API `GET /ask`, hệ thống thực hiện quy trình sau:

### 3.1. Tiền xử lý Câu hỏi
- Hàm `extract_last_question()` trích xuất riêng câu hỏi thực sự ở cuối cuộc hội thoại, loại bỏ các đoạn hội thoại cũ để tránh làm nhiễu công cụ tìm kiếm.
- Nếu câu hỏi cuối quá ngắn (ví dụ: "Ngành Cơ khí"), hệ thống tự động gộp với câu trước đó để bảo toàn ngữ cảnh.

### 3.2. Ưu tiên tra cứu đặc thù (Bypass Logic & Rule-based)
Nhằm kiểm soát rủi ro LLM "ảo giác" (bịa đặt thông tin), chatbot được lập trình các luồng xử lý riêng, bỏ qua AI với các câu hỏi nhạy cảm:
- **Câu chào hỏi:** Trả lời trực tiếp bằng kịch bản lập trình sẵn.
- **Thông tin liên hệ/Địa chỉ:** Bắt từ khóa như "địa chỉ", "ở đâu", "cô Thơ", "tư vấn"... và trả ra thông tin fix cứng.
- **Tra cứu Học phí bằng Cấu trúc JSON:** Nếu phát hiện câu hỏi về "học phí", hệ thống dùng thuật toán nội bộ tra cứu trực tiếp file `hoc_phi_viendong.json`. Thuật toán dò tìm Hệ Đào Tạo (CĐ18 hay CD15) và Tên Ngành (có xử lý tiếng Việt không dấu) để bóc tách chính xác Phương án 1 và Phương án 2 trả về cho người dùng.

### 3.3. Tìm kiếm Ngữ cảnh bằng Vector (Vector Search)
- Thêm tiền tố `"query: "` vào câu hỏi và chuyển thành vector.
- FAISS sẽ tìm kiếm top 12 đoạn văn bản có độ tương đồng cao nhất.
- **Tối ưu hóa từ khóa (Keyword Boost):** Thuật toán tự động cộng thêm điểm (boost score) cho các kết quả trả về nếu chúng chứa từ khóa trùng khớp mạnh với nhóm chủ đề của câu hỏi (như nhóm xét tuyển, môn THPT...).
- Hệ thống lọc ra 5 đoạn văn bản tốt nhất (có điểm số similarity >= 0.30) để làm Ngữ cảnh (Context).

### 3.4. Sinh câu trả lời bằng LLM (Generation)
- Ghép 5 đoạn văn bản ngữ cảnh thành một khối dữ liệu đưa vào Prompt.
- Gửi Prompt qua API Groq tới Llama-3.3-70b.
- **System Prompt (Quy tắc cho AI)** được thiết kế rất nghiêm ngặt:
  - Đóng vai trợ lý tuyển sinh phong cách Gen Z thân thiện.
  - Tuyệt đối không dùng ký tự Markdown in đậm/nghiêng.
  - Tuân thủ 100% ngữ cảnh được cung cấp, không bịa số liệu.
  - Quy định gắt gao về cách format câu trả lời liên quan đến Học phí (phải nêu đủ 2 phương án) và Đăng ký (luôn kèm link).

---

## 4. Cơ chế Cập nhật và Huấn luyện Dữ liệu Mới
Hệ thống cung cấp sẵn các API cho phép quản trị viên thêm dữ liệu mới vào AI một cách tự động (Dynamic Ingestion):

### 4.1. Huấn luyện qua File (Upload)
- API `POST /train` cho phép upload file `.txt` hoặc `.pdf`. 
- Nếu là PDF, hệ thống dùng thư viện `pypdf` để bóc tách chữ. File được lưu vào `data-txt` và hàm `rebuild_index()` được kích hoạt để tính toán lại toàn bộ Vector Database.

### 4.2. Huấn luyện qua Website (URL Scraper)
- API `POST /train-url` nhận một đường link (URL).
- Tích hợp thư viện `BeautifulSoup` và `requests` để tự động truy cập trang web, loại bỏ các phần tử rác (menu, footer, script) và lưu trữ nội dung cốt lõi của bài viết thành file txt. Cuối cùng tiến hành rebuild lại Index ngay lập tức.
