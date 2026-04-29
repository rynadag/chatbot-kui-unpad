# =======================================================================
# FILE: rag.py
# Improvements:
# - Cached Chroma instance to avoid re-creating DB every request
# - Stronger QA prompt: answer only from provided context, include SOURCES
# - Trim conversation history before sending to LLM to reduce tokens
# - Small performance tweaks (retriever k, deterministic LLM)
# =======================================================================

import os
import re
import shutil
import gc
import time
import json
import logging
import threading
from contextlib import contextmanager
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime

# --- Langchain / Chroma imports (as in original)
from langchain_core.documents import Document
from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.chains.llm import LLMChain

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - [RAG] - %(message)s")
logger = logging.getLogger(__name__)

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")
MONGO_COLLECTION_NAME = "knowledgebase"

PERSIST_DIR = "chroma_db"
EMBED_MODEL = "models/text-embedding-004"
LLM_MODEL = "gemini-flash-latest"

if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY is not set - embeddings/LLM may fail to initialize")

try:
    embeddings = GoogleGenerativeAIEmbeddings(model=EMBED_MODEL, google_api_key=GOOGLE_API_KEY)
    llm = ChatGoogleGenerativeAI(model=LLM_MODEL, temperature=0.3, google_api_key=GOOGLE_API_KEY)
    llm_strict = ChatGoogleGenerativeAI(model=LLM_MODEL, temperature=0.0, google_api_key=GOOGLE_API_KEY)
except Exception as e:
    logger.error(f"Error initializing models: {e}")
    embeddings = None
    llm = None
    llm_strict = None

# -------------------------------
# Chroma cache (singleton) to avoid re-creating DB each request
# -------------------------------
_CHROMA_INSTANCE = None
_CHROMA_LOCK = threading.Lock()


def _ensure_chroma_loaded():
    global _CHROMA_INSTANCE
    if _CHROMA_INSTANCE is not None:
        return
    with _CHROMA_LOCK:
        if _CHROMA_INSTANCE is None and os.path.exists(PERSIST_DIR):
            try:
                _CHROMA_INSTANCE = Chroma(persist_directory=PERSIST_DIR, embedding_function=embeddings)
                logger.info("Chroma DB loaded into cache.")
            except Exception as e:
                logger.warning(f"Could not load Chroma DB into cache: {e}")


@contextmanager
def get_chroma_db():
    """
    Backwards-compatible context manager. Returns cached Chroma instance if available.
    Yields None if not present.
    """
    try:
        _ensure_chroma_loaded()
        yield _CHROMA_INSTANCE
    finally:
        # keep instance alive (do not delete) for reuse to save startup time
        gc.collect()


def _reload_chroma_cache():
    """Force reload cached chroma (used after indexing)."""
    global _CHROMA_INSTANCE
    with _CHROMA_LOCK:
        try:
            _CHROMA_INSTANCE = Chroma(persist_directory=PERSIST_DIR, embedding_function=embeddings)
            logger.info("Chroma cache reloaded.")
        except Exception as e:
            logger.warning("Failed reloading Chroma cache: %s", e)


# =======================================================================
# Helper: local pre-clean heuristics to reduce LLM tokens / noise
# =======================================================================
def pre_clean_local(raw: str) -> str:
    """
    Fast heuristics:
      - Remove 'Page X of Y' / 'Halaman ...' footers
      - Merge hyphenated line breaks
      - Merge short wrapped lines when next line starts with lowercase
      - Collapse excessive blank lines
    This is intentionally conservative to avoid removing content.
    """
    if not raw:
        return ""

    text = raw

    # remove typical page headers/footers like "Page 1 of 5" or "Halaman 1 dari 5"
    text = re.sub(r"(Page|Halaman)\s*\d+\s*(of|dari)\s*\d+", "", text, flags=re.IGNORECASE)

    # remove lines that are just page numbers
    text = re.sub(r"^\s*\d{1,4}\s*$", "", text, flags=re.MULTILINE)

    # normalize newlines
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # fix hyphenated line-breaks "exam-\nple" => "example"
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)

    # merge short lines with the next line if next starts with lowercase (heuristic)
    lines = text.split("\n")
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
            if len(line) < 80 and nxt and nxt[0].islower() and not re.match(r"^[#\-\dA-Z*`\[\]\*]", nxt):
                merged.append(line + " " + nxt)
                i += 2
                continue
        merged.append(line)
        i += 1

    text = "\n".join(merged)

    # collapse many blank lines to max two
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# =======================================================================
# SMART FORMATTING (LLM) - uses pre_clean_local first
# =======================================================================
cleaning_template = """
You are a Specialized Document Formatter AI.
Your task is to take RAW TEXT extracted from a PDF and restructure it into clean MARKDOWN.

CRITICAL INSTRUCTION FOR TABLES:
The input text MAY ALREADY CONTAIN Markdown Tables (starting with | ... |).
**DO NOT DESTROY THEM.** You must preserve them or fix their alignment if broken.

INSTRUCTIONS:
1. Preserve Tables.
2. Fix broken list items into proper Markdown lists.
3. Use # for titles and ## for sections.
4. Remove common headers/footers.
5. Do NOT summarize. Keep all numbers, dates, names exactly as is.

RAW TEXT:
{raw_text}

CLEAN MARKDOWN OUTPUT:
"""
cleaning_prompt = PromptTemplate(input_variables=["raw_text"], template=cleaning_template)
cleaning_chain = LLMChain(llm=llm_strict, prompt=cleaning_prompt) if llm_strict else None


def smart_clean_text(raw_text: str) -> str:
    """
    Two-phase cleaning:
      1) pre_clean_local (fast)
      2) LLM-based cleaning (chunked if needed)
    Returns cleaned markdown text. If LLM not available, returns pre-cleaned text.
    """
    if not raw_text:
        return ""

    try:
        pre = pre_clean_local(raw_text)
    except Exception as e:
        logger.warning(f"pre_clean_local error: {e}")
        pre = raw_text

    if not cleaning_chain:
        # no LLM available, return pre-clean
        return pre

    CHUNK_SIZE = 12000
    total_len = len(pre)
    if total_len <= CHUNK_SIZE:
        try:
            res = cleaning_chain.invoke({"raw_text": pre})
            # defensive extraction of text
            if isinstance(res, dict):
                return res.get("text") or res.get("content") or str(res)
            return getattr(res, "text", None) or getattr(res, "content", None) or str(res)
        except Exception as e:
            logger.warning(f"LLM clean failed: {e}")
            return pre

    logger.info(f"[CLEAN] Long text ({total_len} chars) - chunking...")
    chunks = [pre[i : i + CHUNK_SIZE] for i in range(0, total_len, CHUNK_SIZE)]
    cleaned_parts = []
    for idx, ch in enumerate(chunks):
        try:
            res = cleaning_chain.invoke({"raw_text": ch})
            if isinstance(res, dict):
                cleaned_chunk = res.get("text") or res.get("content") or ""
            else:
                cleaned_chunk = getattr(res, "text", None) or getattr(res, "content", None) or str(res)
            if not cleaned_chunk:
                cleaned_chunk = ch
            cleaned_parts.append(cleaned_chunk)
            # small sleep to be gentle on API (tunable)
            time.sleep(0.5)
        except Exception as e:
            logger.warning(f"Chunk {idx} LLM clean failed: {e}")
            cleaned_parts.append(ch)
    return "\n\n".join(cleaned_parts)


# =======================================================================
# RERANK & QA (kept compatible but improved)
# =======================================================================
def rerank_with_gemini(query: str, docs: list, top_k: int = 3):
    if not docs:
        return [], "QUERY"

    logger.info(f"⚖️ Reranking {len(docs)} candidates...")

    doc_options = ""
    for i, d in enumerate(docs):
        content = d.page_content[:450].replace("\n", " ")
        doc_options += f"Doc ID {i}: {content}\n\n"

    rerank_msg = f"""
    You are an Intelligent Relevance Evaluator.
    Analyze the USER QUESTION and the candidate DOCUMENT LIST.

    USER QUESTION: "{query}"

    DOCUMENT LIST:
    {doc_options}

    YOUR TASK:
    1. **Check Intent:** CHAT (Greeting) vs QUERY (Information).
    2. **Rerank (If QUERY):** Select document IDs relevant to the answer.

    OUTPUT FORMAT:
    - If CHAT: "INTENT:CHAT"
    - If QUERY with valid docs: JSON list e.g., [0, 2]
    - If QUERY but NO valid docs: "NONE"
    """
    try:
        response = llm_strict.invoke(rerank_msg)
        content = getattr(response, "content", None) or getattr(response, "text", None) or str(response)
        content = content.strip()
        logger.info(f"Rerank Output: {content}")

        if "INTENT:CHAT" in content:
            return [], "CHAT"
        if "NONE" in content:
            return [], "QUERY"

        content = content.replace("```json", "").replace("```", "").strip()
        try:
            selected_indices = json.loads(content)
        except Exception:
            return docs[:top_k], "QUERY"

        if not isinstance(selected_indices, list):
            return docs[:top_k], "QUERY"

        reranked_docs = []
        for idx in selected_indices:
            if isinstance(idx, int) and 0 <= idx < len(docs):
                reranked_docs.append(docs[idx])
        return reranked_docs[:top_k], "QUERY"
    except Exception as e:
        logger.warning(f"Rerank fallback: {e}")
        return docs[:top_k], "QUERY"


qa_template = """
You are the **International Student AI Assistant for Universitas Padjadjaran (Unpad)**.
Your persona is professional, warm, academic, and helpful.

IMPORTANT:
- ALWAYS ANSWER IN ENGLISH.
- Answer ONLY using the DOCUMENT CONTEXT provided. Do NOT hallucinate.
- If the answer cannot be found in the provided DOCUMENT CONTEXT, respond exactly with:
  "I don't know based on the provided knowledge base. Please check the source documents or ask the administrator to add relevant information."
- At the end of your answer, include a short SOURCES section listing the document topics you used (format as bullet list).
- Use Markdown formatting. Use headings, bold, bullet points where helpful.
- If you present tabular/structured data, prefer Markdown tables.

INPUT:
CHAT HISTORY:
{chat_history}

DOCUMENT CONTEXT:
{context}

USER QUESTION: {question}

ANSWER (MARKDOWN, ENGLISH). After the answer, include:

SOURCES:
- topic 1
- topic 2
"""
qa_prompt = ChatPromptTemplate.from_template(qa_template)


def _trim_history(history: list, max_turns: int = 6):
    """Keep last max_turns user+assistant turns (pairs) to reduce tokens."""
    if not history:
        return []
    # assume history is list of {"role": "...", "content": "..."} or similar
    return history[-max_turns:]


def ask(question: str, history: list = []) -> str:
    """
    ask(question, history):
      - history: list of dicts with keys like {'role': 'user'|'ai'|'assistant', 'content': '...'}
    """
    if not llm or not embeddings:
        return "⚠️ AI System is initializing. Please wait a moment."

    try:
        # trim history to recent few turns
        trimmed_history = _trim_history(history, max_turns=6)
        chat_history_str = ""
        for msg in trimmed_history:
            role = "Human" if msg.get("role") == "user" else "AI"
            content = msg.get("content") or msg.get("text") or ""
            chat_history_str += f"{role}: {content}\n"

        # ensure chroma is loaded
        _ensure_chroma_loaded()

        with get_chroma_db() as db:
            if not db:
                return "Knowledge database is not ready. Please perform 'Update RAG' in the admin panel."

            # Slightly smaller k to speed up and avoid token explosion; reranker will pick top relevant
            retriever = db.as_retriever(search_kwargs={"k": 6})
            initial_docs = retriever.invoke(question)

            final_docs, intent = rerank_with_gemini(question, initial_docs, top_k=3)

            context_text = ""
            used_topics = []
            if intent == "QUERY" and not final_docs:
                context_text = ""
            elif final_docs:
                snippets = []
                for d in final_docs:
                    txt = re.sub(r"\s+", " ", d.page_content).strip()
                    topic = d.metadata.get("topic", "General")
                    used_topics.append(topic)
                    # keep a short snippet and the topic as source label
                    snippets.append(f"[Source: {topic}]\n{txt}")
                context_text = "\n\n".join(snippets)

            chain = qa_prompt | llm_strict  # deterministic
            response = chain.invoke({"chat_history": chat_history_str, "context": context_text, "question": question})

            # Defensive extraction
            if hasattr(response, 'content'):
                content = str(response.content)
            elif isinstance(response, dict):
                content = response.get('content') or response.get('text') or str(response)
            else:
                content = str(response)

            # Try to ensure we include SOURCES: if model omitted, append best-effort sources
            if "SOURCES:" not in content and used_topics:
                sources_md = "\n\nSOURCES:\n" + "\n".join([f"- {t}" for t in used_topics])
                content = content.strip() + sources_md

            return content

    except Exception as e:
        logger.error(f"Ask Error: {e}")
        return f"System Error: {str(e)}"


# =======================================================================
# Chroma helpers & indexing (kept behavior but with logging)
# =======================================================================
def force_cleanup_chroma():
    gc.collect()


def load_from_mongo():
    if not MONGO_URI or not MONGO_DB_NAME:
        logger.error("Mongo configuration missing")
        return []

    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB_NAME]
    collection = db[MONGO_COLLECTION_NAME]

    cursor = collection.find({"status": "ACTIVE"})

    docs = []
    count = 0
    for doc in cursor:
        combined_text = f"Topic: {doc.get('topic', '')}\nCategory: {doc.get('category', '')}\nContent:\n{doc.get('content', '')}"

        docs.append(
            Document(
                page_content=combined_text,
                metadata={"id": str(doc.get("_id")), "topic": doc.get("topic", "No Topic"), "category": doc.get("category", "General")},
            )
        )
        count += 1

    try:
        collection.update_many({}, {"$set": {"is_sync": True}})
    except Exception as e:
        logger.warning("Could not set is_sync flags: %s", e)

    client.close()
    logger.info(f"✅ Loaded {count} ACTIVE documents from MongoDB.")
    return docs


def mainrag():
    logger.info("🚀 Starting RAG Indexing Process...")

    try:
        if os.path.exists(PERSIST_DIR):
            try:
                shutil.rmtree(PERSIST_DIR, ignore_errors=True)
                logger.info("🧹 Old Vector Database wiped.")
            except Exception as e:
                logger.error(f"⚠️ Failed to wipe DB: {e}")

        docs = load_from_mongo()
        if not docs:
            logger.warning("MongoDB is empty or no ACTIVE docs. ChromaDB will be empty.")
            return "Indexing Complete (No Data)"

        logger.info(f"Elementing {len(docs)} documents...")

        text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
        splits = text_splitter.split_documents(docs)

        Chroma.from_documents(
            documents=splits,
            embedding=embeddings,
            persist_directory=PERSIST_DIR,
        )

        # reload cached chroma instance after indexing so subsequent queries are fast
        _reload_chroma_cache()

        logger.info("✅ New Vector Database created successfully!")
        return "Indexing Complete"
    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        return f"Indexing Failed: {e}"


def reset_memory():
    force_cleanup_chroma()
    global _CHROMA_INSTANCE
    with _CHROMA_LOCK:
        _CHROMA_INSTANCE = None
    if os.path.exists(PERSIST_DIR):
        try:
            shutil.rmtree(PERSIST_DIR, ignore_errors=True)
            logger.info("✅ Vector Database cleared.")
        except Exception as e:
            logger.error(f"Failed to clear database: {e}")