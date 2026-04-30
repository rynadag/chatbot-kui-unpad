import os
import re
import shutil
import gc
import threading
import logging
from contextlib import contextmanager
from typing import List, Optional

from pymongo import MongoClient
from dotenv import load_dotenv

# --- Langchain imports
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_chroma import Chroma
from langchain_groq import ChatGroq
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

try:
    from google import genai
    from google.genai import types as genai_types
except Exception:
    genai = None
    genai_types = None

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - [RAG] - %(message)s")
logger = logging.getLogger(__name__)

# =======================================================================
# CONFIG
# =======================================================================
GOOGLE_API_KEY   = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY     = os.getenv("GROQ_API_KEY")
MONGO_URI        = os.getenv("MONGO_URI")
MONGO_DB_NAME    = os.getenv("MONGO_DB_NAME")
MONGO_COLLECTION = "knowledgebase"

PERSIST_DIR  = "chroma_db"

# Format model embeddings resmi untuk langchain-google-genai
# NOTE: Use Gemini embedding models without the "models/" prefix.
EMBED_MODEL  = os.getenv("EMBED_MODEL", "gemini-embedding-2")
LLM_MODEL    = "llama-3.3-70b-versatile"

RETRIEVER_K       = 8
MMR_FETCH_K       = 20
RERANK_FINAL_K    = 4

if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY not set — embeddings will fail")
if not GROQ_API_KEY:
    logger.warning("GROQ_API_KEY not set — LLM will fail")

# =======================================================================
# GENAI EMBEDDINGS (v1beta)
# =======================================================================
def _normalize_model_name(name: str) -> str:
    for prefix in ("models/", "publishers/google/models/"):
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


def _resolve_embed_model(preferred: str, api_key: str) -> str:
    if not genai or not genai_types:
        return preferred
    try:
        client = genai.Client(
            api_key=api_key,
            http_options=genai_types.HttpOptions(api_version="v1beta"),
        )
        embed_models: list[str] = []
        for m in client.models.list():
            actions = m.supported_actions or []
            if any(a.lower() == "embedcontent" for a in actions):
                name = m.name or preferred
                embed_models.append(_normalize_model_name(name))
        if preferred in embed_models:
            return preferred
        if embed_models:
            return embed_models[0]
    except Exception as e:
        logger.warning(f"Could not resolve embedding model list: {e}")
    return preferred


# =======================================================================
# LLM & EMBEDDINGS INIT
# =======================================================================
def _build_llm(temperature: float = 0.3) -> Optional[ChatGroq]:
    if not GROQ_API_KEY:
        return None
    try:
        return ChatGroq(
            model=LLM_MODEL,
            temperature=temperature,
            api_key=GROQ_API_KEY,
            max_tokens=2048,
        )
    except Exception as e:
        logger.error(f"Failed to init Groq LLM: {e}")
        return None

def _build_embeddings() -> Optional[Embeddings]:
    if not GOOGLE_API_KEY:
        return None
    resolved_model = _resolve_embed_model(EMBED_MODEL, GOOGLE_API_KEY)
    if resolved_model != EMBED_MODEL:
        logger.info(f"Embedding model resolved: {resolved_model}")
    try:
        return GoogleGenerativeAIEmbeddings(
            model=resolved_model,
            google_api_key=GOOGLE_API_KEY,
        )
    except Exception as e:
        logger.error(f"Embeddings init error: {e}")
        return None


try:
    embeddings = _build_embeddings()
    llm        = _build_llm(temperature=0.3)
    llm_strict = _build_llm(temperature=0.0)

    if llm:
        logger.info(f"LLM ready: {LLM_MODEL} via Groq")
    if embeddings:
        logger.info(f"Embeddings ready: {EMBED_MODEL}")
except Exception as e:
    logger.error(f"Model init error: {e}")
    embeddings = llm = llm_strict = None

# =======================================================================
# CHROMA SINGLETON
# =======================================================================
_CHROMA_INSTANCE: Optional[Chroma] = None
_CHROMA_LOCK = threading.Lock()

def _ensure_chroma_loaded() -> None:
    global _CHROMA_INSTANCE
    if _CHROMA_INSTANCE is not None:
        return
    with _CHROMA_LOCK:
        if _CHROMA_INSTANCE is None and os.path.exists(PERSIST_DIR):
            try:
                _CHROMA_INSTANCE = Chroma(
                    persist_directory=PERSIST_DIR,
                    embedding_function=embeddings,
                )
                logger.info("Chroma DB loaded into cache.")
            except Exception as e:
                logger.warning(f"Could not load Chroma DB: {e}")

@contextmanager
def get_chroma_db():
    try:
        _ensure_chroma_loaded()
        yield _CHROMA_INSTANCE
    finally:
        gc.collect()

def _reload_chroma_cache() -> None:
    global _CHROMA_INSTANCE
    with _CHROMA_LOCK:
        try:
            _CHROMA_INSTANCE = Chroma(
                persist_directory=PERSIST_DIR,
                embedding_function=embeddings,
            )
            logger.info("Chroma cache reloaded.")
        except Exception as e:
            logger.warning(f"Failed reloading Chroma: {e}")

# =======================================================================
# TEXT CLEANING
# =======================================================================
def pre_clean_local(raw: str) -> str:
    if not raw:
        return ""
    text = raw
    text = re.sub(r"(Page|Halaman)\s*\d+\s*(of|dari)\s*\d+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^\s*\d{1,4}\s*$", "", text, flags=re.MULTILINE)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)

    lines  = text.split("\n")
    merged = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            merged.append("")
            i += 1
            continue
        if i + 1 < len(lines):
            nxt = lines[i + 1].lstrip()
            if (
                len(line) < 80
                and nxt
                and nxt[0].islower()
                and not re.match(r"^[#\-\dA-Z*`\[\]\*]", nxt)
            ):
                merged.append(line + " " + nxt)
                i += 2
                continue
        merged.append(line)
        i += 1

    text = "\n".join(merged)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def smart_clean_text(raw_text: str) -> str:
    """Called by app.py — local cleaning only (no LLM)."""
    return pre_clean_local(raw_text)

# =======================================================================
# PROMPTS
# =======================================================================
QA_TEMPLATE = """\
You are the **International Student AI Assistant for Universitas Padjadjaran (UNPAD)**.
Persona: professional, warm, concise, and academically accurate.

RULES:
- Answer ONLY from the DOCUMENT CONTEXT below. Never hallucinate.
- If the answer is not in the context, reply exactly:
  "I don't have that information in the knowledge base. Please contact the KUI UNPAD office or ask an administrator to add the relevant information."
- Always answer in **English**.
- Use Markdown: bold, bullet points, tables where appropriate.
- Keep answers focused and avoid unnecessary filler.
- End every answer with a brief **Sources** section (bullet list of topic names used).

CHAT HISTORY:
{chat_history}

DOCUMENT CONTEXT:
{context}

USER QUESTION:
{question}

ANSWER:
"""
qa_prompt = ChatPromptTemplate.from_template(QA_TEMPLATE)

GREETING_TEMPLATE = """\
You are the KUI UNPAD International Office assistant.
Reply warmly and briefly in English to this greeting: {question}
Mention you can help with campus info, scholarships, and academic procedures.
"""
greeting_prompt = ChatPromptTemplate.from_template(GREETING_TEMPLATE)

# =======================================================================
# RETRIEVAL — MMR (no LLM reranking)
# =======================================================================
_GREETING_WORDS = {
    "hi", "hello", "hey", "halo", "hei", "howdy", "greetings",
    "good morning", "good afternoon", "good evening",
    "selamat pagi", "selamat siang", "selamat malam",
    "apa kabar", "how are you",
}

def _is_greeting(question: str) -> bool:
    q = question.strip().lower().rstrip("!?.")
    if q in _GREETING_WORDS:
        return True
    words = q.split()
    return len(words) <= 3 and any(g in q for g in _GREETING_WORDS)

def retrieve_docs(db: Chroma, query: str) -> List[Document]:
    try:
        retriever = db.as_retriever(
            search_type="mmr",
            search_kwargs={
                "k":           RETRIEVER_K,
                "fetch_k":     MMR_FETCH_K,
                "lambda_mult": 0.6,
            },
        )
        return retriever.invoke(query)
    except Exception as e:
        logger.warning(f"MMR retrieval failed, falling back to similarity: {e}")
        return db.as_retriever(search_kwargs={"k": RETRIEVER_K}).invoke(query)

# =======================================================================
# ASK
# =======================================================================
def _trim_history(history: list, max_turns: int = 6) -> list:
    return history[-max_turns:] if history else []

def ask(question: str, history: list = []) -> str:
    if not llm or not embeddings:
        return "⚠️ AI System is initializing. Please wait a moment."

    try:
        trimmed          = _trim_history(history)
        chat_history_str = ""
        for msg in trimmed:
            role    = "Human" if msg.get("role") == "user" else "AI"
            content = msg.get("content") or msg.get("text") or ""
            chat_history_str += f"{role}: {content}\n"

        # Short-circuit greetings
        if _is_greeting(question):
            chain    = greeting_prompt | llm
            response = chain.invoke({"question": question})
            return str(response.content) if hasattr(response, "content") else str(response)

        _ensure_chroma_loaded()

        with get_chroma_db() as db:
            if not db:
                return (
                    "Knowledge database is not ready. "
                    "Please perform 'Update RAG' in the admin panel."
                )

            docs = retrieve_docs(db, question)[:RERANK_FINAL_K]

            context_parts = []
            used_topics   = []
            for d in docs:
                txt   = re.sub(r"\s+", " ", d.page_content).strip()
                topic = d.metadata.get("topic", "General")
                used_topics.append(topic)
                context_parts.append(f"[Source: {topic}]\n{txt}")
            context_text = "\n\n".join(context_parts)

            chain    = qa_prompt | llm_strict
            response = chain.invoke({
                "chat_history": chat_history_str,
                "context":      context_text,
                "question":     question,
            })

            if hasattr(response, "content"):
                content = str(response.content)
            elif isinstance(response, dict):
                content = response.get("content") or response.get("text") or str(response)
            else:
                content = str(response)

            if "Sources" not in content and "SOURCES" not in content and used_topics:
                content = content.strip() + "\n\n**Sources:**\n" + "\n".join(f"- {t}" for t in used_topics)

            return content

    except Exception as e:
        logger.error(f"Ask Error: {e}")
        return f"System Error: {str(e)}"

# =======================================================================
# MONGO LOADER
# =======================================================================
def load_from_mongo() -> List[Document]:
    if not MONGO_URI or not MONGO_DB_NAME:
        logger.error("Mongo configuration missing")
        return []

    client     = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10_000)
    db         = client[MONGO_DB_NAME]
    collection = db[MONGO_COLLECTION]

    docs  = []
    for doc in collection.find({"status": "ACTIVE"}):
        text = (
            f"Topic: {doc.get('topic', '')}\n"
            f"Category: {doc.get('category', '')}\n"
            f"Content:\n{doc.get('content', '')}"
        )
        docs.append(Document(
            page_content=text,
            metadata={
                "id":       str(doc.get("_id")),
                "topic":    doc.get("topic",    "No Topic"),
                "category": doc.get("category", "General"),
            },
        ))

    try:
        collection.update_many({}, {"$set": {"is_sync": True}})
    except Exception as e:
        logger.warning(f"Could not set is_sync flags: {e}")

    client.close()
    logger.info(f"Loaded {len(docs)} ACTIVE documents from MongoDB.")
    return docs

# =======================================================================
# INDEXING
# =======================================================================
def mainrag() -> str:
    logger.info("Starting RAG Indexing Process...")

    try:
        if os.path.exists(PERSIST_DIR):
            shutil.rmtree(PERSIST_DIR, ignore_errors=True)
            logger.info("Old Vector DB wiped.")

        docs = load_from_mongo()
        if not docs:
            logger.warning("No ACTIVE docs found. ChromaDB will be empty.")
            return "Indexing Complete (No Data)"

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1500,
            chunk_overlap=300,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        splits = splitter.split_documents(docs)
        logger.info(f"Generated {len(splits)} chunks from {len(docs)} documents.")

        Chroma.from_documents(
            documents=splits,
            embedding=embeddings,
            persist_directory=PERSIST_DIR,
        )

        _reload_chroma_cache()
        logger.info("Vector Database created successfully!")
        return "Indexing Complete"

    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        return f"Indexing Failed: {e}"

# =======================================================================
# UTILITIES
# =======================================================================
def force_cleanup_chroma() -> None:
    gc.collect()

def reset_memory() -> None:
    global _CHROMA_INSTANCE
    force_cleanup_chroma()
    with _CHROMA_LOCK:
        _CHROMA_INSTANCE = None
    if os.path.exists(PERSIST_DIR):
        shutil.rmtree(PERSIST_DIR, ignore_errors=True)
        logger.info("Vector Database cleared.")