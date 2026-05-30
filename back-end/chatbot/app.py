from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import gc
import io
import os
import json
import asyncio
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId
import concurrent.futures
import time
import traceback
import uuid
import pdfplumber
from typing import Any

import rag

app = FastAPI(title="KUI UNPAD Chatbot API", version="2.0.0")


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _env_float(name: str, default: float, minimum: float = 0.1) -> float:
    try:
        return max(minimum, float(os.getenv(name, str(default))))
    except ValueError:
        return default


MAX_MESSAGE_CHARS = _env_int("MAX_MESSAGE_CHARS", 2000)
MAX_HISTORY_TURNS = _env_int("MAX_HISTORY_TURNS", 8)
MAX_HISTORY_MESSAGE_CHARS = _env_int("MAX_HISTORY_MESSAGE_CHARS", 1200)
MAX_UPLOAD_BYTES = _env_int("MAX_UPLOAD_BYTES", 25 * 1024 * 1024)
PDF_WORKERS = _env_int("PDF_WORKERS", 4)
WS_PROGRESS_INTERVAL = _env_float("WS_PROGRESS_INTERVAL", 0.8)
SUPPORTED_LANGUAGES = {"id", "en"}


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def _safe_language(value: Any) -> str:
    return value if isinstance(value, str) and value in SUPPORTED_LANGUAGES else "id"


def _normalize_message(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    return text[:limit]


def _sanitize_history(history: Any) -> list[dict]:
    if not isinstance(history, list):
        return []

    sanitized = []
    for item in history[-MAX_HISTORY_TURNS:]:
        if not isinstance(item, dict):
            continue

        raw_role = item.get("role") or item.get("sender")
        if raw_role == "user":
            role = "user"
        elif raw_role in {"assistant", "bot"}:
            role = "assistant"
        else:
            continue

        content = _normalize_message(item.get("content") or item.get("text"), MAX_HISTORY_MESSAGE_CHARS)
        if content:
            sanitized.append({"role": role, "content": content})
    return sanitized


def _get_knowledge_collection():
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("MONGO_DB_NAME")
    if not mongo_uri or not db_name:
        raise RuntimeError("Missing MONGO_URI / MONGO_DB_NAME")

    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=10_000)
    db = client[db_name]
    return client, db["knowledgebase"]


def _normalize_rag_result(result: Any) -> dict:
    if isinstance(result, dict):
        reply = result.get("reply") or result.get("Reply") or ""
        sources = result.get("sources") if isinstance(result.get("sources"), list) else []
        return {
            "reply": str(reply),
            "sources": sources,
            "source_count": len(sources),
        }
    return {"reply": str(result), "sources": [], "source_count": 0}

# =======================================================================
# CORS — restrict origins in production via ALLOWED_ORIGINS env var
# Example .env: ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
# =======================================================================
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =======================================================================
# MONITOR CONNECTIONS
# =======================================================================
monitor_connections: set = set()
CLIENT_METADATA: dict = {}


# =======================================================================
# HEALTH CHECK
# =======================================================================
@app.get("/")
def read_root():
    return {"status": "ok", "service": "KUI UNPAD Chatbot API"}


@app.get("/health")
def health_check():
    """Useful for uptime monitors and deployment checks."""
    return {
        "status": "ok",
        "llm": rag.llm is not None,
        "embeddings": rag.embeddings is not None,
        "chroma_ready": rag._CHROMA_INSTANCE is not None or os.path.exists(rag.PERSIST_DIR),
        "persist_dir": rag.PERSIST_DIR,
        "timestamp": _utc_now(),
    }


# =======================================================================
# PDF HELPERS
# =======================================================================
def convert_table_to_markdown(table) -> str:
    if not table or len(table) < 1:
        return ""
    try:
        cleaned = [[str(cell) if cell is not None else "" for cell in row] for row in table]
        header    = "| " + " | ".join(cleaned[0]) + " |"
        separator = "| " + " | ".join(["---"] * len(cleaned[0])) + " |"
        body = [
            "| " + " | ".join(cell.replace("\n", " ") for cell in row) + " |"
            for row in cleaned[1:]
        ]
        return f"\n{header}\n{separator}\n" + "\n".join(body) + "\n" if body else f"\n{header}\n{separator}\n"
    except Exception as e:
        print(f"Table conversion error: {e}")
        return ""


def _extract_pdf_pages_bytes(file_bytes: bytes, max_workers: int = 4) -> str:
    def process_page(page):
        parts = []
        try:
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    md = convert_table_to_markdown(table)
                    if md:
                        parts.append(md)
            text = page.extract_text() or ""
            parts.append(text)
        except Exception as e:
            print(f"Page extraction error: {e}")
        return "\n".join(parts)

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages   = list(pdf.pages)
            workers = min(max_workers, max(1, len(pages)))
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
                results = list(ex.map(process_page, pages))
        return "\n".join(results)
    except Exception as e:
        print(f"Fatal PDF extraction error: {e}")
        raise


# =======================================================================
# BACKGROUND PROCESSING
# Fixed: no longer spawns a child process inside a background task.
# Instead runs mainrag() directly in the same thread (already off event loop).
# =======================================================================
def background_process_document(inserted_id):
    """
    Runs in a BackgroundTask thread (not a separate process).
    1. Fetch doc from Mongo
    2. Clean content locally
    3. Update Mongo
    4. Re-index RAG (in-process, thread-safe via Chroma lock)
    """
    client = None
    try:
        start = time.time()
        client, collection = _get_knowledge_collection()

        query_id = inserted_id
        try:
            if isinstance(inserted_id, str):
                query_id = ObjectId(inserted_id)
        except Exception:
            pass

        doc = collection.find_one({"_id": query_id}) or collection.find_one({"_id": str(inserted_id)})
        if not doc:
            print(f"[bg] Document not found: {inserted_id}")
            return

        raw_content = doc.get("content", "") or ""

        # Local pre-clean (fast, no LLM)
        cleaned = rag.smart_clean_text(raw_content)

        collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"content": cleaned, "is_sync": False, "updatedAt": _utc_now()}},
        )
        print(f"[bg] Doc updated in {time.time() - start:.2f}s, starting re-index…")

        # Re-index (runs in same thread — no extra process needed)
        rag.mainrag()
        print(f"[bg] Done in {time.time() - start:.2f}s total")

    except Exception as e:
        print(f"[bg] Exception: {e}")
        traceback.print_exc()
    finally:
        if client is not None:
            client.close()


# =======================================================================
# MONITOR WEBSOCKET
# =======================================================================
async def broadcast_monitor(message: dict):
    dead = []
    for ws in list(monitor_connections):
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        monitor_connections.discard(ws)


@app.websocket("/ws-monitor")
async def websocket_monitor(websocket: WebSocket):
    await websocket.accept()
    monitor_connections.add(websocket)
    print(f"🔔 Monitor connected: {websocket.client}. Total: {len(monitor_connections)}")
    try:
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                await asyncio.sleep(1)
    finally:
        monitor_connections.discard(websocket)
        print(f"🔕 Monitor disconnected. Total: {len(monitor_connections)}")


# =======================================================================
# CHAT WEBSOCKET
# =======================================================================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    conn_uuid = str(uuid.uuid4())
    CLIENT_METADATA[conn_uuid] = {
        "ws": websocket,
        "client_id": None,
        "user_agent": None,
        "connected_at": time.time(),
    }
    print(f"🔌 Client Connected: {websocket.client} (uuid={conn_uuid})")
    response_tasks: set[asyncio.Task] = set()

    async def process_and_respond(wb: WebSocket, message_text: str, request_id: str, history=None, language: str = "id"):
        task = asyncio.create_task(asyncio.to_thread(rag.ask_with_sources, message_text, history or [], language))
        try:
            while not task.done():
                try:
                    await wb.send_json({"type": "stream", "event": "progress", "request_id": request_id, "message": "generating..."})
                except Exception:
                    break
                await broadcast_monitor({"type": "monitor_progress", "request_id": request_id})
                await asyncio.sleep(WS_PROGRESS_INTERVAL)

            try:
                rag_result = _normalize_rag_result(await task)
            except Exception as e:
                rag_result = {"reply": f"System Error: {str(e)}", "sources": [], "source_count": 0}

            reply_text = rag_result["reply"]

            try:
                await wb.send_json({
                    "type": "reply",
                    "request_id": request_id,
                    "reply": reply_text,
                    "sources": rag_result["sources"],
                    "source_count": rag_result["source_count"],
                })
            except Exception:
                pass

            await broadcast_monitor({
                "type":         "monitor_reply",
                "request_id":   request_id,
                "reply":        reply_text,
                "sources":      rag_result["sources"],
                "user_message": message_text,
            })
        except asyncio.CancelledError:
            task.cancel()
            raise
        except Exception as e:
            print(f"process_and_respond error: {e}")

    try:
        while True:
            raw_data = await websocket.receive_text()

            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                payload = {"message": raw_data}
            if not isinstance(payload, dict):
                payload = {"message": str(payload)}

            payload_type = payload.get("type")

            # Client hello handshake
            if payload_type == "client_hello":
                tab_id = _normalize_message(payload.get("tab_id"), 120) or str(uuid.uuid4())
                ua     = _normalize_message(payload.get("user_agent"), 300)
                CLIENT_METADATA[conn_uuid].update({"client_id": tab_id, "user_agent": ua, "connected_at": time.time()})
                await broadcast_monitor({"type": "monitor_client_connect", "client_id": tab_id, "user_agent": ua, "timestamp": time.time()})
                try:
                    await websocket.send_json({"type": "client_hello_ack", "tab_id": tab_id})
                except Exception:
                    pass
                continue

            if payload_type == "client_heartbeat":
                CLIENT_METADATA[conn_uuid]["connected_at"] = time.time()
                continue

            if payload_type == "client_goodbye":
                meta = CLIENT_METADATA.get(conn_uuid)
                if meta and meta.get("client_id"):
                    await broadcast_monitor({
                        "type":       "monitor_client_disconnect",
                        "client_id":  meta.get("client_id"),
                        "user_agent": meta.get("user_agent"),
                        "timestamp":  time.time(),
                    })
                break

            raw_message = payload.get("message", "")
            message = _normalize_message(raw_message, MAX_MESSAGE_CHARS + 1)
            history = _sanitize_history(payload.get("history"))
            language = _safe_language(payload.get("language", "id"))
            if not message:
                continue

            request_id = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
            if len(message) > MAX_MESSAGE_CHARS:
                reply_text = (
                    f"Pesan terlalu panjang. Maksimal {MAX_MESSAGE_CHARS} karakter."
                    if language == "id"
                    else f"Message is too long. Maximum {MAX_MESSAGE_CHARS} characters."
                )
                await websocket.send_json({
                    "type": "reply",
                    "request_id": request_id,
                    "reply": reply_text,
                    "sources": [],
                    "source_count": 0,
                })
                continue

            print(f"📩 Received (WS): {message}")

            try:
                await websocket.send_json({"type": "stream", "event": "start", "request_id": request_id, "message": "processing"})
            except Exception:
                pass

            meta = CLIENT_METADATA.get(conn_uuid, {})
            await broadcast_monitor({
                "type":        "monitor_user_message",
                "request_id":  request_id,
                "message":     message,
                "client_id":   meta.get("client_id"),
                "user_agent":  meta.get("user_agent"),
            })

            response_task = asyncio.create_task(process_and_respond(websocket, message, request_id, history, language))
            response_tasks.add(response_task)
            response_task.add_done_callback(response_tasks.discard)

    except WebSocketDisconnect:
        print(f"🔌 Client Disconnected: {websocket.client} (uuid={conn_uuid})")
        meta = CLIENT_METADATA.get(conn_uuid)
        if meta and meta.get("client_id"):
            try:
                await broadcast_monitor({
                    "type":       "monitor_client_disconnect",
                    "client_id":  meta.get("client_id"),
                    "user_agent": meta.get("user_agent"),
                    "timestamp":  time.time(),
                })
            except Exception:
                pass
    except Exception as e:
        print(f"WebSocket Error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        for task in list(response_tasks):
            task.cancel()
        if response_tasks:
            await asyncio.gather(*response_tasks, return_exceptions=True)
        CLIENT_METADATA.pop(conn_uuid, None)


# =======================================================================
# HTTP ENDPOINTS
# =======================================================================
@app.post("/reply")
async def reply_http(req: Request):
    """Fallback HTTP endpoint if client doesn't support WebSocket."""
    try:
        data = await req.json()
        if not isinstance(data, dict):
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        raw_message = data.get("message", "")
        message = _normalize_message(raw_message, MAX_MESSAGE_CHARS + 1)
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        if len(message) > MAX_MESSAGE_CHARS:
            raise HTTPException(status_code=413, detail=f"Message exceeds {MAX_MESSAGE_CHARS} characters")

        history = _sanitize_history(data.get("history"))
        language = _safe_language(data.get("language", "id"))
        rag_result = _normalize_rag_result(await asyncio.to_thread(rag.ask_with_sources, message, history, language))
        return {
            "Reply": rag_result["reply"],
            "sources": rag_result["sources"],
            "source_count": rag_result["source_count"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload-knowledge")
async def upload_knowledge(
    file: UploadFile = File(...),
    topic: str = Form(...),
    category: str = Form(...),
    background_tasks: BackgroundTasks = None,
):
    filename = file.filename or ""
    print(f"📂 Upload: {filename}")
    start = time.time()
    client = None
    try:
        topic = _normalize_message(topic, 160)
        category = _normalize_message(category, 120)
        if not topic or not category:
            raise HTTPException(status_code=400, detail="Topic and category are required")

        file_content = await file.read()
        if len(file_content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit")

        content_text = ""
        lower_filename = filename.lower()

        if lower_filename.endswith(".pdf"):
            t0 = time.time()
            content_text = await asyncio.to_thread(_extract_pdf_pages_bytes, file_content, PDF_WORKERS)
            print(f"[upload] PDF extracted in {time.time() - t0:.2f}s")
        elif lower_filename.endswith(".txt"):
            content_text = file_content.decode("utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=400, detail="Only PDF/TXT allowed")

        if not content_text.strip():
            raise HTTPException(status_code=400, detail="Empty content after extraction")

        # Quick local pre-clean before saving
        try:
            content_text = rag.pre_clean_local(content_text)
        except Exception as e:
            print(f"pre_clean_local error: {e}")

        try:
            client, collection = _get_knowledge_collection()
        except RuntimeError:
            raise HTTPException(status_code=500, detail="Server misconfigured: missing Mongo settings")

        now = _utc_now()
        result      = collection.insert_one({
            "topic":     topic,
            "category":  category,
            "content":   content_text,
            "status":    "ACTIVE",
            "is_sync":   False,
            "createdAt": now,
            "updatedAt": now,
        })
        inserted_id = result.inserted_id

        # Schedule background: clean + re-index (runs in thread, not subprocess)
        if background_tasks is not None:
            background_tasks.add_task(background_process_document, inserted_id)
        else:
            asyncio.create_task(asyncio.to_thread(background_process_document, inserted_id))

        return {
            "message": "Dokumen disimpan. Background cleaning & indexing dijalankan.",
            "data": {
                "_id":               str(inserted_id),
                "topic":             topic,
                "uploadDurationSec": round(time.time() - start, 2),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if client is not None:
            client.close()


@app.get("/do-rag")
async def do_rag_route():
    """Manual re-index — runs in thread (non-blocking)."""
    print("🔄 Manual RAG Triggered...")
    asyncio.create_task(asyncio.to_thread(rag.mainrag))
    return {"Status": "Started", "Message": "RAG re-indexing started in background thread"}


@app.get("/clear-cache")
def clear_cache():
    try:
        rag.force_cleanup_chroma()
        gc.collect()
        return {"Status": "Cache cleared"}
    except Exception as e:
        return {"Status": "Error", "Message": str(e)}


@app.get("/reset-memory")
def reset_memory_route():
    try:
        rag.reset_memory()
        return {"Status": "Memory reset"}
    except Exception as e:
        return {"Status": "Error", "Message": str(e)}


# =======================================================================
# ENTRYPOINT
# =======================================================================
if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Server (WS Port 8080)...")
    uvicorn.run(app, host="127.0.0.1", port=8080)
