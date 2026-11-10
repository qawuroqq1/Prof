function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  });
}

async function answerAssistant(request, env, origin) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: "Assistant is not configured" }, 503, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  if (!payload || typeof payload.question !== "string" || !payload.question.trim() || payload.question.length > 1200) {
    return jsonResponse({ error: "Invalid question" }, 400, origin);
  }

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Ты помощник Профсоюза работников образования города Астаны. Отвечай кратко и на языке заданного вопроса. Давай только общую справочную информацию, не выдавай ответ за юридическое заключение. Для персональной консультации предложи связаться с профсоюзом: +7 (7172) 21-71-06, prof_adilet@mail.ru."
          },
          { role: "user", content: payload.question.trim() }
        ]
      })
    });
  } catch (error) {
    console.error("OpenAI request failed:", error);
    return jsonResponse({ error: "Assistant service is unavailable" }, 502, origin);
  }

  if (!response.ok) {
    console.error("OpenAI rejected the assistant request:", response.status);
    return jsonResponse({ error: "Assistant service rejected the request" }, 502, origin);
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    console.error("Could not parse the assistant response:", error);
    return jsonResponse({ error: "Assistant returned an invalid response" }, 502, origin);
  }
  const answer = result.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    return jsonResponse({ error: "Assistant returned an empty answer" }, 502, origin);
  }
  return jsonResponse({ answer }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = (env.ALLOWED_ORIGIN || "")
      .split(",")
      .map((allowedOrigin) => allowedOrigin.trim())
      .filter(Boolean);
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Vary": "Origin"
        }
      });
    }
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);
    if (new URL(request.url).pathname !== "/") return jsonResponse({ error: "Not found" }, 404, origin);
    return answerAssistant(request, env, origin);
  }
};
