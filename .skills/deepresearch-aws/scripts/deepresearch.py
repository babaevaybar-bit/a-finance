"""
deepresearch
"""
import re
import json
import time
import argparse
import requests
import sys
import os
import concurrent.futures

_LOG_FILE = None

BASE_URL = "https://app-dglnmr1k1czl-api-zYm4X4jwv0bL.gateway.appmedo.com/"
STREAM_TIMEOUT = 480  # 8 minutes per attempt
MAX_ATTEMPTS = 4      # 1 start + 3 status checks


def log_progress(message: str) -> None:
    """
    log_progress
    """
    if not _LOG_FILE:
        return
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{timestamp} {message}\n")
    except OSError:
        pass


def get_gateway_headers():
    """
    get_gateway_headers
    """
    api_key = os.environ.get("INTEGRATIONS_API_KEY")
    if not api_key:
        print("Error: INTEGRATIONS_API_KEY environment variable not set.", file=sys.stderr)
        sys.exit(1)
    return {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": f"Bearer {api_key}",
    }


def call_api(payload):
    """
    call_api
    """
    headers = get_gateway_headers()
    response = requests.post(BASE_URL, headers=headers, json=payload)
    response.raise_for_status()
    return response.json()


def call_api_stream(payload):
    """
    call_api_stream
    """
    import codecs
    headers = get_gateway_headers()
    with requests.post(BASE_URL, headers=headers, json=payload, stream=True, timeout=None) as resp:
        resp.raise_for_status()
        depth = 0
        in_string = False
        escape_next = False
        obj_chars = []
        decoder = codecs.getincrementaldecoder("utf-8")("ignore")

        for raw in resp.iter_content(chunk_size=4096):
            if not raw:
                continue
            for char in decoder.decode(raw, False):
                if escape_next:
                    if obj_chars:
                        obj_chars.append(char)
                    escape_next = False
                    continue
                if char == "\\" and in_string:
                    escape_next = True
                    if obj_chars:
                        obj_chars.append(char)
                    continue
                if char == '"':
                    in_string = not in_string
                    if obj_chars:
                        obj_chars.append(char)
                    continue
                if in_string:
                    if obj_chars:
                        obj_chars.append(char)
                    continue
                if char == "{":
                    depth += 1
                    obj_chars.append(char)
                elif char == "}":
                    depth -= 1
                    obj_chars.append(char)
                    if depth == 0 and obj_chars:
                        try:
                            parsed = json.loads("".join(obj_chars))
                            debug_str = json.dumps(parsed, ensure_ascii=False)
                            print(f"[DEBUG_CHUNK] {debug_str}", flush=True)
                            yield parsed
                        except json.JSONDecodeError:
                            pass
                        obj_chars = []
                elif depth > 0:
                    obj_chars.append(char)


def extract_session(chunks):
    """
    extract_session
    """
    for chunk in chunks:
        session = chunk.get("sessionInfo", {}).get("session")
        if session:
            return session
    return None


def extract_plan(chunks):
    """
    extract_plan
    """
    texts = []
    for chunk in chunks:
        for reply in chunk.get("answer", {}).get("replies", []):
            grounded = reply.get("groundedContent", {})
            content = grounded.get("content", {})
            if content.get("thought", False):
                text = content.get("text", "")
                if text:
                    texts.append(text)
    return "\n".join(texts)


def stream_research(payload, collect_plan=False):
    """
    stream_research
    """
    texts = []
    references = {}
    current_question = None
    has_research_content = False

    for chunk in call_api_stream(payload):
        for reply in chunk.get("answer", {}).get("replies", []):
            log_progress(f"{reply}")
            grounded = reply.get("groundedContent", {})
            content = grounded.get("content", {})
            content_kind = grounded.get("contentMetadata", {}).get("contentKind", "")

            if content_kind == "RESEARCH_AUDIO_SUMMARY":
                continue

            text = content.get("text", "")

            if content_kind == "RESEARCH_QUESTION":
                current_question = text
                has_research_content = True
                print(f"\n🔍 Researching: {text}", flush=True)
                log_progress(f"[QUESTION] {text}")

            elif content_kind == "RESEARCH_ANSWER":
                if text:
                    has_research_content = True
                    if current_question:
                        print(f"  ✓ Done: {current_question}", flush=True)
                        log_progress(f"[ANSWER] {current_question}")
                        current_question = None

            elif content_kind == "RESEARCH_PLAN":
                if collect_plan and text:
                    has_research_content = True
                    texts.append(text)
                    log_progress(f"[PLAN_CONTENT] received {len(text)} chars")
                else:
                    print(f"\n=== Research Plan ===\n{text}\n====================\n", flush=True)
                    log_progress(f"[PLAN] {text}")

            elif content_kind == "RESEARCH_REPORT":
                if text:
                    has_research_content = True
                    texts.append(text)
                    log_progress(f"[REPORT] received {len(text)} chars")


            for ref in grounded.get("textGroundingMetadata", {}).get("references", []):
                doc = ref.get("documentMetadata", {})
                uri = doc.get("uri", "")
                title = doc.get("title", "")
                domain = doc.get("domain", "")
                if uri and uri not in references:
                    references[uri] = {"title": title, "domain": domain, "uri": uri}

    result = "\n".join(texts)
    # 从第一个二级标题开始，去掉 API 返回的开头废话
    match = re.search(r'^## ', result, re.MULTILINE)
    if match:
        result = result[match.start():]
    if references:
        result += "\n\n---\n## References\n"
        for i, ref in enumerate(references.values(), 1):
            title = ref["title"] or ref["domain"] or ref["uri"]
            result += f"{i}. [{title}]({ref['uri']})\n"

    return result, has_research_content


def deep_research(query):
    """
    deep_research
    """
    payload_step1 = {
        "query": {"text": query},
        "agentsSpec": {"agentSpecs": {"agentId": "deep_research"}},
        "toolsSpec": {"webGroundingSpec": {}}
    }

    print("Submitting research query...", flush=True)
    log_progress(f"[START] query={query!r}")

    # step1: consume full stream to complete research plan generation
    session = None
    chunks_step1 = []
    for chunk in call_api_stream(payload_step1):
        chunks_step1.append(chunk)
        if not session:
            s = chunk.get("sessionInfo", {}).get("session")
            if s:
                session = s
                log_progress(f"[SESSION] {session}")

    if not session:
        log_progress("[ERROR] Failed to obtain session")
        print("Error: Failed to obtain session.", file=sys.stderr)
        sys.exit(1)
    print("✓ Session established", flush=True)

    plan = extract_plan(chunks_step1)
    if plan:
        print(f"\n=== Research Plan ===\n{plan}\n====================\n", flush=True)
        log_progress(f"[PLAN] {plan}")

    # step2: trigger deep research, retry with status check on timeout
    print("Starting Deep Research...", flush=True)
    log_progress("[STEP2] Starting Deep Research")
    t0 = time.time()

    for attempt in range(MAX_ATTEMPTS):
        query_text = "Start Research" if attempt == 0 else "What is the status?"
        payload_step2 = {
            "query": {"text": query_text},
            "session": session,
            "agentsSpec": {"agentSpecs": {"agentId": "deep_research"}},
            "toolsSpec": {"webGroundingSpec": {}}
        }

        if attempt > 0:
            print(f"\nChecking research status (attempt {attempt}/{MAX_ATTEMPTS - 1})...", flush=True)
            log_progress(f"[STATUS_CHECK] attempt={attempt}")

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(stream_research, payload_step2)
            try:
                result, has_research = future.result(timeout=STREAM_TIMEOUT)
                elapsed = time.time() - t0
                if has_research:
                    log_progress(f"[DONE] elapsed={elapsed:.1f}s")
                else:
                    log_progress(f"[ERROR] No research content returned | elapsed={elapsed:.1f}s")
                break
            except concurrent.futures.TimeoutError:
                elapsed = time.time() - t0
                log_progress(f"[TIMEOUT] attempt={attempt + 1} elapsed={elapsed:.1f}s")
                print(f"Attempt {attempt + 1}/{MAX_ATTEMPTS} timed out after {STREAM_TIMEOUT}s.", flush=True)
    else:
        elapsed = time.time() - t0
        log_progress(f"[ERROR] All {MAX_ATTEMPTS} attempts timed out | elapsed={elapsed:.1f}s")
        print(f"\n⏱ Elapsed: {elapsed:.1f}s", file=sys.stderr)
        print(f"Error: Research timed out after {MAX_ATTEMPTS} attempts.", file=sys.stderr)
        sys.exit(1)

    # step3: request full report content to inspect raw response
    chinese_chars = sum(1 for c in query if '\u4e00' <= c <= '\u9fff')
    is_chinese = chinese_chars / max(len(query), 1) > 0.2
    full_report_query = "请给我报告的完整内容" if is_chinese else "Give me the full content of the report"

    print("\nRequesting full report content...", flush=True)
    log_progress(f"[STEP3] Requesting full report (lang={'zh' if is_chinese else 'en'})")
    payload_step3 = {
        "query": {"text": full_report_query},
        "session": session,
        "agentsSpec": {"agentSpecs": {"agentId": "deep_research"}},
        "toolsSpec": {"webGroundingSpec": {}}
    }
    full_result, has_full = stream_research(payload_step3, collect_plan=True)
    elapsed = time.time() - t0
    log_progress(f"[STEP3_DONE] has_content={has_full} elapsed={elapsed:.1f}s")

    print(f"\n⏱ Elapsed: {elapsed:.1f}s", file=sys.stderr)
    return full_result if has_full and full_result else result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gemini Deep Research")
    parser.add_argument("query", help="Research query")
    parser.add_argument("--log-file", default=None, help="Log file path for monitor.py")
    parser.add_argument("--output-file", default=None, help="Output file path for the research result")
    args = parser.parse_args()

    _LOG_FILE = args.log_file

    result = deep_research(args.query)

    if result:
        if args.output_file:
            output_path = args.output_file
        else:
            output_path = re.sub(r'[^\w]+', '_', args.query).strip('_')[:50] + ".md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(result)
