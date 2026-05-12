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
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - [RAG] - %(message)s")
logger = logging.getLogger(__name__)

# =======================================================================
# CONFIG
# =======================================================================
GROQ_API_KEY     = os.getenv("GROQ_API_KEY")
MONGO_URI        = os.getenv("MONGO_URI")
MONGO_DB_NAME    = os.getenv("MONGO_DB_NAME")
MONGO_COLLECTION = "knowledgebase"

PERSIST_DIR  = "chroma_db"

# FREE local embedding model — no API key needed!
# all-MiniLM-L6-v2 is fast, lightweight (80MB), and accurate for English text.
EMBED_MODEL  = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")
LLM_MODEL    = "llama-3.3-70b-versatile"

RETRIEVER_K       = 10
MMR_FETCH_K       = 25
RERANK_FINAL_K    = 5

if not GROQ_API_KEY:
    logger.warning("GROQ_API_KEY not set — LLM will fail")

# =======================================================================
# LLM & EMBEDDINGS INIT (100% FREE)
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
    """Build FREE local embeddings using HuggingFace sentence-transformers.
    No API key required! Runs 100% locally on your machine.
    """
    try:
        emb = HuggingFaceEmbeddings(
            model_name=EMBED_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True, "batch_size": 64},
        )
        logger.info(f"✅ Local Embeddings loaded: {EMBED_MODEL} (FREE, no API key)")
        return emb
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
        logger.info(f"Embeddings ready: {EMBED_MODEL} (local, free)")
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
# PROMPTS (IMPROVED FOR ACCURACY)
# =======================================================================
QA_TEMPLATE = """\
You are the **International Student AI Assistant for Universitas Padjadjaran (UNPAD)**.
Persona: professional, warm, concise, and academically accurate.

STRICT RULES:
1. Answer ONLY using the DOCUMENT CONTEXT below. NEVER make up information.
2. If the context does NOT contain enough information to answer fully, say:
   "I don't have that specific information in the knowledge base. Please contact the KUI UNPAD office or ask an administrator to add the relevant information."
3. Always respond in **English**, unless the user writes in Indonesian — then respond in Indonesian.
4. Use Markdown formatting: **bold**, bullet points, tables where appropriate.
5. Be concise and structured. Avoid unnecessary filler.
6. When citing information, mention the source topic naturally.
7. If the question is ambiguous, provide the most relevant interpretation based on context.
8. For factual questions, prioritize accuracy over completeness.

PREVIOUS CONVERSATION (for context continuity):
{chat_history}

DOCUMENT CONTEXT (your ONLY source of truth):
{context}

USER QUESTION:
{question}

Provide a helpful, accurate answer based ONLY on the document context above:
"""
qa_prompt = ChatPromptTemplate.from_template(QA_TEMPLATE)

GREETING_TEMPLATE = """\
You are the KUI UNPAD International Office assistant.
Reply warmly and briefly in the same language as the greeting below.
Mention you can help with campus info, scholarships, academic procedures, and international student matters.
Keep it under 3 sentences.

User greeting: {question}
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
                "lambda_mult": 0.5,
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
            context_text = "\n\n---\n\n".join(context_parts)

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
                unique_topics = list(dict.fromkeys(used_topics))
                content = content.strip() + "\n\n**Sources:**\n" + "\n".join(f"- {t}" for t in unique_topics)

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
            chunk_size=1200,
            chunk_overlap=250,
            separators=["\n\n", "\n", ". ", ", ", " ", ""],
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