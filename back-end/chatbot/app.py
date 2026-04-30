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

import rag

app = FastAPI()

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
        "chroma_ready": rag._CHROMA_INSTANCE is not None,
        "timestamp": datetime.utcnow().isoformat(),
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
    try:
        start = time.time()
        mongo_uri = os.getenv("MONGO_URI")
        db_name   = os.getenv("MONGO_DB_NAME")
        if not mongo_uri or not db_name:
            print("[bg] Missing MONGO_URI / MONGO_DB_NAME")
            return

        client     = MongoClient(mongo_uri, serverSelectionTimeoutMS=10_000)
        db         = client[db_name]
        collection = db["knowledgebase"]

        query_id = inserted_id
        try:
            if isinstance(inserted_id, str):
                query_id = ObjectId(inserted_id)
        except Exception:
            pass

        doc = collection.find_one({"_id": query_id}) or collection.find_one({"_id": str(inserted_id)})
        if not doc:
            print(f"[bg] Document not found: {inserted_id}")
            client.close()
            return

        raw_content = doc.get("content", "") or ""

        # Local pre-clean (fast, no LLM)
        cleaned = rag.smart_clean_text(raw_content)

        collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"content": cleaned, "is_sync": False, "updatedAt": datetime.utcnow().isoformat()}},
        )
        client.close()
        print(f"[bg] Doc updated in {time.time() - start:.2f}s, starting re-index…")

        # Re-index (runs in same thread — no extra process needed)
        rag.mainrag()
        print(f"[bg] Done in {time.time() - start:.2f}s total")

    except Exception as e:
        print(f"[bg] Exception: {e}")
        traceback.print_exc()


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

    async def process_and_respond(wb: WebSocket, message_text: str, request_id: str, history=None):
        task = asyncio.create_task(asyncio.to_thread(rag.ask, message_text, history or []))
        try:
            while not task.done():
                try:
                    await wb.send_json({"type": "stream", "event": "progress", "request_id": request_id, "message": "generating..."})
                except Exception:
                    break
                await broadcast_monitor({"type": "monitor_progress", "request_id": request_id})
                await asyncio.sleep(0.6)

            try:
                reply_text = await task
            except Exception as e:
                reply_text = f"System Error: {str(e)}"

            try:
                await wb.send_json({"type": "reply", "request_id": request_id, "reply": reply_text})
            except Exception:
                pass

            await broadcast_monitor({
                "type":         "monitor_reply",
                "request_id":   request_id,
                "reply":        reply_text,
                "user_message": message_text,
            })
        except Exception as e:
            print(f"process_and_respond error: {e}")

    try:
        while True:
            raw_data = await websocket.receive_text()

            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                payload = {"message": raw_data}

            # Client hello handshake
            if isinstance(payload, dict) and payload.get("type") == "client_hello":
                tab_id = payload.get("tab_id") or str(uuid.uuid4())
                ua     = payload.get("user_agent", "")
                CLIENT_METADATA[conn_uuid].update({"client_id": tab_id, "user_agent": ua, "connected_at": time.time()})
                await broadcast_monitor({"type": "monitor_client_connect", "client_id": tab_id, "user_agent": ua, "timestamp": time.time()})
                try:
                    await websocket.send_json({"type": "client_hello_ack", "tab_id": tab_id})
                except Exception:
                    pass
                continue

            message = payload.get("message", "")
            history = payload.get("history", None)
            if not message:
                continue

            print(f"📩 Received (WS): {message}")
            request_id = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"

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

            asyncio.create_task(process_and_respond(websocket, message, request_id, history))

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
        CLIENT_METADATA.pop(conn_uuid, None)
    except Exception as e:
        print(f"WebSocket Error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass


# =======================================================================
# HTTP ENDPOINTS
# =======================================================================
@app.post("/reply")
async def reply_http(req: Request):
    """Fallback HTTP endpoint if client doesn't support WebSocket."""
    try:
        data       = await req.json()
        message    = data.get("message", "")
        reply_text = await asyncio.to_thread(rag.ask, message, [])
        return {"Reply": reply_text}
    except Exception as e:
        return {"Reply": f"Error: {str(e)}"}


@app.post("/api/upload-knowledge")
async def upload_knowledge(
    file: UploadFile = File(...),
    topic: str = Form(...),
    category: str = Form(...),
    background_tasks: BackgroundTasks = None,
):
    print(f"📂 Upload: {file.filename}")
    start = time.time()
    try:
        file_content = await file.read()
        content_text = ""

        if file.filename.lower().endswith(".pdf"):
            t0 = time.time()
            content_text = await asyncio.to_thread(_extract_pdf_pages_bytes, file_content, 4)
            print(f"[upload] PDF extracted in {time.time() - t0:.2f}s")
        elif file.filename.lower().endswith(".txt"):
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

        mongo_uri = os.getenv("MONGO_URI")
        db_name   = os.getenv("MONGO_DB_NAME")
        if not mongo_uri or not db_name:
            raise HTTPException(status_code=500, detail="Server misconfigured: missing Mongo settings")

        client     = MongoClient(mongo_uri, serverSelectionTimeoutMS=10_000)
        db         = client[db_name]
        collection = db["knowledgebase"]

        result      = collection.insert_one({
            "topic":     topic,
            "category":  category,
            "content":   content_text,
            "status":    "ACTIVE",
            "is_sync":   False,
            "createdAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat(),
        })
        inserted_id = result.inserted_id
        client.close()

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