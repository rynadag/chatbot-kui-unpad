from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import multiprocessing
import gc
import importlib
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
# --- PERUBAHAN: GANTI PYPDF DENGAN PDFPLUMBER ---
import pdfplumber


# near top-level definitions
monitor_connections = set()
CLIENT_METADATA = {}
# local rag module (must be available)
import rag

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"Hello": "Server AI Chatbot (WebSocket Ready + Table Support)"}


# ========================================================================
# Helper: convert table (pdfplumber) to markdown
# ========================================================================
def convert_table_to_markdown(table):
    if not table or len(table) < 1:
        return ""

    try:
        cleaned_table = [[str(cell) if cell is not None else "" for cell in row] for row in table]
        header = "| " + " | ".join(cleaned_table[0]) + " |"
        separator = "| " + " | ".join(["---"] * len(cleaned_table[0])) + " |"

        body_lines = []
        for row in cleaned_table[1:]:
            clean_row = [cell.replace("\n", " ") for cell in row]
            body_lines.append("| " + " | ".join(clean_row) + " |")

        if body_lines:
            return f"\n{header}\n{separator}\n" + "\n".join(body_lines) + "\n"
        return f"\n{header}\n{separator}\n"
    except Exception as e:
        print(f"⚠️ Table conversion error: {e}")
        return ""

# ========================================================================
# Parallel PDF extraction helper (page-level)
# ========================================================================
def _extract_pdf_pages_bytes(file_bytes: bytes, max_workers: int = 4) -> str:
    content_text = ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = list(pdf.pages)

            def process_page(page):
                page_content = ""
                try:
                    tables = page.extract_tables()
                    if tables:
                        for table in tables:
                            md_table = convert_table_to_markdown(table)
                            page_content += f"\n\n{md_table}\n\n"
                    text = page.extract_text() or ""
                    page_content += text + "\n"
                except Exception as e:
                    print("Page extraction error:", e)
                return page_content

            workers = min(max_workers, max(1, len(pages)))
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
                results = list(ex.map(process_page, pages))
            content_text = "\n".join(results)
    except Exception as e:
        print("Fatal PDF extraction error:", e)
        raise
    return content_text

# ========================================================================
# Background processing:
# - perform LLM-based cleaning (using rag.smart_clean_text)
# - update document content and updatedAt
# - trigger RAG indexing detached (non-blocking)
#
# We keep features (delete/edit/toggle) unchanged; background process only
# updates content/is_sync and triggers indexing.
# ========================================================================
def _run_mainrag_detached():
    try:
        importlib.reload(rag)
        rag.mainrag()
    except Exception as e:
        print("Detached mainrag error:", e)


def background_process_document(inserted_id):
    try:
        start_all = time.time()
        mongo_uri = os.getenv("MONGO_URI")
        db_name = os.getenv("MONGO_DB_NAME")
        if not mongo_uri or not db_name:
            print("Missing MONGO_URI / MONGO_DB_NAME - cannot run background job.")
            return

        client = MongoClient(mongo_uri)
        db = client[db_name]
        collection = db["knowledgebase"]

        query_id = inserted_id
        try:
            if isinstance(inserted_id, str):
                query_id = ObjectId(inserted_id)
        except Exception:
            pass

        doc = collection.find_one({"_id": query_id})
        if not doc:
            doc = collection.find_one({"_id": str(inserted_id)})
        if not doc:
            print(f"[background] Document not found: {inserted_id}")
            client.close()
            return

        raw_content = doc.get("content", "") or ""

        try:
            if hasattr(rag, "pre_clean_local"):
                pre_cleaned = rag.pre_clean_local(raw_content)
            else:
                pre_cleaned = raw_content
        except Exception as e:
            print("pre_clean_local error:", e)
            pre_cleaned = raw_content

        cleaned_final = pre_cleaned
        try:
            t0 = time.time()
            cleaned_final = rag.smart_clean_text(pre_cleaned)
            t1 = time.time()
            print(f"[background] LLM cleaning duration: {(t1 - t0):.2f}s")
        except Exception as e:
            print("LLM cleaning failed, keeping pre-cleaned content:", e)

        try:
            collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {"content": cleaned_final, "is_sync": False, "updatedAt": datetime.now().isoformat()}},
            )
            print(f"[background] Updated DB doc: {str(doc.get('_id'))}")
        except Exception as e:
            print("DB update error in background:", e)

        client.close()

        try:
            p = multiprocessing.Process(target=_run_mainrag_detached)
            p.daemon = True
            p.start()
            print(f"[background] Launched detached RAG process pid={p.pid}")
        except Exception as e:
            print("Failed to start detached RAG process:", e)

        print(f"[background] Background processing finished in {(time.time() - start_all):.2f}s")
    except Exception as exc:
        print("Exception in background_process_document:", exc)
        traceback.print_exc()


# ========================================================================
# LIVE MONITOR / WEBSOCKET LOGIC
# - Adds a dedicated /ws-monitor endpoint for admin monitoring.
# - The chat websocket (/ws) will emit monitoring events to connected monitor clients.
# - Streaming used for "monitoring only": server will send periodic progress events
#   while answering, and a final reply event. Client-side will update the single
#   bot message (no double replies).
# ========================================================================
monitor_connections = set()


async def broadcast_monitor(message: dict):
    """
    Send a JSON message to all connected monitor websockets.
    Safe: if a send fails for a socket, remove it.
    """
    dead = []
    for ws in list(monitor_connections):
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        try:
            monitor_connections.remove(ws)
        except Exception:
            pass


@app.websocket("/ws-monitor")
async def websocket_monitor(websocket: WebSocket):
    await websocket.accept()
    monitor_connections.add(websocket)
    print(f"🔔 Monitor connected: {websocket.client}. Total monitors: {len(monitor_connections)}")
    try:
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                await asyncio.sleep(1)
    finally:
        try:
            monitor_connections.remove(websocket)
        except Exception:
            pass
        print(f"🔕 Monitor disconnected: {websocket.client}. Total monitors: {len(monitor_connections)}")



# ========================================================================
# WebSocket endpoint (updated to support 'streaming for monitoring' only)
# - Sends start/progress/final messages (type field).
# - Does not append duplicate/repeated final replies; client should update existing bot message.
# ========================================================================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    # assign an internal id for this WS connection
    connection_uuid = str(uuid.uuid4())
    CLIENT_METADATA[connection_uuid] = {"ws": websocket, "client_id": None, "user_agent": None, "connected_at": time.time()}
    print(f"🔌 Client Connected: {websocket.client} (conn_uuid={connection_uuid})")

    async def process_and_respond(wb: WebSocket, message_text: str, request_id: str, history=None):
        # (unchanged)
        task = asyncio.create_task(asyncio.to_thread(rag.ask, message_text, history or []))
        try:
            while not task.done():
                progress_msg = {"type": "stream", "event": "progress", "request_id": request_id, "message": "generating..."}
                try:
                    await wb.send_json(progress_msg)
                except Exception:
                    break
                await broadcast_monitor({"type": "monitor_progress", "request_id": request_id, "message": "generating..."})
                await asyncio.sleep(0.6)

            try:
                reply_text = await task
            except Exception as e:
                reply_text = f"System Error: {str(e)}"

            final_msg = {"type": "reply", "request_id": request_id, "reply": reply_text}
            try:
                await wb.send_json(final_msg)
            except Exception:
                pass

            await broadcast_monitor({"type": "monitor_reply", "request_id": request_id, "reply": reply_text, "user_message": message_text})
        except Exception as e:
            print("Error in process_and_respond:", e)

    try:
        while True:
            raw_data = await websocket.receive_text()

            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                payload = {"message": raw_data}

            # handle client hello event (sent by frontend when WS opens)
            if isinstance(payload, dict) and payload.get("type") == "client_hello":
                tab_id = payload.get("tab_id") or str(uuid.uuid4())
                ua = payload.get("user_agent", "")
                # store mapping: connection_uuid -> tab_id + ua
                CLIENT_METADATA[connection_uuid]["client_id"] = tab_id
                CLIENT_METADATA[connection_uuid]["user_agent"] = ua
                CLIENT_METADATA[connection_uuid]["connected_at"] = time.time()
                # broadcast to monitors
                await broadcast_monitor({
                    "type": "monitor_client_connect",
                    "client_id": tab_id,
                    "user_agent": ua,
                    "timestamp": time.time()
                })
                # optionally ack to client (not required)
                try:
                    await websocket.send_json({"type": "client_hello_ack", "tab_id": tab_id})
                except:
                    pass
                continue

            # standard message handling (old behavior)
            message = payload.get("message", "")
            history = payload.get("history", None)

            if not message:
                continue

            print(f"📩 Received (WS): {message}")

            request_id = f"{int(time.time()*1000)}-{os.getpid()}"

            try:
                await websocket.send_json({"type": "stream", "event": "start", "request_id": request_id, "message": "processing"})
            except Exception:
                pass
            await broadcast_monitor({"type": "monitor_user_message", "request_id": request_id, "message": message, "client_id": CLIENT_METADATA[connection_uuid].get("client_id"), "user_agent": CLIENT_METADATA[connection_uuid].get("user_agent")})

            asyncio.create_task(process_and_respond(websocket, message, request_id, history))

    except WebSocketDisconnect:
        print(f"🔌 Client Disconnected: {websocket.client} (conn_uuid={connection_uuid})")
        # on disconnect, if we have client_id info, broadcast disconnect
        meta = CLIENT_METADATA.get(connection_uuid)
        if meta and meta.get("client_id"):
            try:
                await broadcast_monitor({
                    "type": "monitor_client_disconnect",
                    "client_id": meta.get("client_id"),
                    "user_agent": meta.get("user_agent"),
                    "timestamp": time.time()
                })
            except Exception as e:
                print("Failed broadcasting client_disconnect:", e)
        # cleanup
        try:
            del CLIENT_METADATA[connection_uuid]
        except KeyError:
            pass
    except Exception as e:
        print(f"⚠️ WebSocket Error: {e}")
        try:
            await websocket.close()
        except:
            pass

# ========================================================================
# HTTP endpoints (reply unchanged)
# ========================================================================
@app.post("/reply")
async def reply_http(req: Request):
    """Fallback HTTP jika client belum support WS"""
    try:
        data = await req.json()
        message = data.get("message", "")
        reply_text = rag.ask(message, [])
        return {"Reply": reply_text}
    except Exception as e:
        return {"Reply": f"Error: {str(e)}"}


# ========================================================================
# Upload endpoint: fast response + background processing
# - extracts PDF/TXT (parallel where applicable)
# - saves extracted (pre-cleaned) content to Mongo immediately
# - schedules background task to run heavy LLM cleaning + indexing
# ========================================================================
@app.post("/api/upload-knowledge")
async def upload_knowledge(
    file: UploadFile = File(...),
    topic: str = Form(...),
    category: str = Form(...),
    background_tasks: BackgroundTasks = None,
):
    print(f"📂 Upload: {file.filename}")
    start_total = time.time()
    try:
        file_content = await file.read()
        content_text = ""

        # Extract PDF (parallel per page) or TXT
        if file.filename.lower().endswith(".pdf"):
            try:
                t0 = time.time()
                # run CPU/IO extraction in a thread to avoid blocking event loop
                content_text = await asyncio.to_thread(_extract_pdf_pages_bytes, file_content, 4)
                t1 = time.time()
                print(f"[upload] PDF extraction duration: {(t1 - t0):.2f}s")
            except Exception as e:
                print(f"❌ PDFPlumber Error: {e}")
                raise HTTPException(status_code=400, detail=f"Bad PDF: {str(e)}")
        elif file.filename.lower().endswith(".txt"):
            content_text = file_content.decode("utf-8", errors="ignore")
        else:
            raise HTTPException(status_code=400, detail="Only PDF/TXT allowed")

        if not content_text.strip():
            raise HTTPException(status_code=400, detail="Empty content")

        # Optional quick pre-clean before saving (to reduce noise quickly)
        try:
            if hasattr(rag, "pre_clean_local"):
                content_text = rag.pre_clean_local(content_text)
        except Exception as e:
            print("pre_clean_local (upload) error:", e)

        # Save to Mongo immediately (content will be cleaned by background task)
        mongo_uri = os.getenv("MONGO_URI")
        db_name = os.getenv("MONGO_DB_NAME")
        if not mongo_uri or not db_name:
            raise HTTPException(status_code=500, detail="Server misconfigured: missing Mongo settings")

        client = MongoClient(mongo_uri)
        db = client[db_name]
        collection = db["knowledgebase"]

        new_doc = {
            "topic": topic,
            "category": category,
            "content": content_text,  # pre-cleaned raw content
            "status": "ACTIVE",
            "is_sync": False,
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
        }

        result = collection.insert_one(new_doc)
        inserted_id = result.inserted_id
        client.close()

        # Schedule background processing (heavy LLM cleaning + indexing)
        if background_tasks is not None:
            background_tasks.add_task(background_process_document, inserted_id)
            print(f"[upload] Scheduled background task for doc {inserted_id}")
        else:
            # Fallback: spawn process (detached) to run background work
            p = multiprocessing.Process(target=background_process_document, args=(inserted_id,))
            p.daemon = True
            p.start()
            print(f"[upload] Spawned process for background processing pid={p.pid}")

        elapsed = time.time() - start_total
        return {
            "message": "Sukses! Dokumen disimpan. Background cleaning & indexing dijalankan.",
            "data": {"_id": str(inserted_id), "topic": topic, "uploadDurationSec": elapsed},
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ========================================================================
# Manual RAG trigger - run in detached process and return immediately
# ========================================================================
@app.get("/do-rag")
def do_rag_route():
    """Manual Re-Index (runs in background process to avoid blocking server)"""
    print("🔄 Manual RAG Triggered...")
    try:
        p = multiprocessing.Process(target=_run_mainrag_detached)
        p.daemon = True
        p.start()
        return {"Status": "Started", "Message": "RAG Re-indexing started in background", "pid": p.pid}
    except Exception as e:
        return {"Status": "Error", "Message": str(e)}


# ========================================================================
# Utility endpoints
# ========================================================================
@app.get("/clear-cache")
def clear_cache():
    try:
        rag.force_cleanup_chroma()
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


if __name__ == "__main__":
    import uvicorn

    multiprocessing.set_start_method("spawn", force=True)
    print("🚀 Starting Server (WS Port 8080)...")
    uvicorn.run(app, host="127.0.0.1", port=8080)