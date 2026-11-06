const MAX_QUESTION_LENGTH = 1200;

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

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN;

    if (!allowedOrigin || requestOrigin !== allowedOrigin) {
      return Response.json({ error: "Origin not allowed" }, { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, allowedOrigin);
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({ error: "Assistant is not configured" }, 500, allowedOrigin);
    }

    const contentLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > 4096) {
      return jsonResponse({ error: "Request is too large" }, 413, allowedOrigin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, allowedOrigin);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonResponse({ error: "Invalid request body" }, 400, allowedOrigin);
    }

    const question = typeof payload.question === "string" ? payload.question.trim() : "";
    const language = ["ru", "kz", "en"].includes(payload.language) ? payload.language : "ru";
    if (!question || question.length > MAX_QUESTION_LENGTH) {
      return jsonResponse({ error: "Question must be between 1 and 1200 characters" }, 400, allowedOrigin);
    }

    const languageNames = { ru: "Russian", kz: "Kazakh", en: "English" };
    const instructions = [
      "You are the virtual assistant for the Astana city education workers' trade union.",
      `Answer in ${languageNames[language]}. Be concise, courteous, and practical.`,
      "Provide general information, not legal advice. Do not invent laws, policies, contact details, or union procedures.",
      "If you are unsure or the question needs an individual legal assessment, say so and direct the user to the union's legal service.",
      "Do not request sensitive personal information."
    ].join(" ");

    let openAIResponse;
    try {
      openAIResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-4o-mini",
          instructions,
          input: question,
          max_output_tokens: 500,
          store: false
        })
      });
    } catch (error) {
      console.error("OpenAI request failed:", error);
      return jsonResponse({ error: "Assistant service is unavailable" }, 502, allowedOrigin);
    }

    if (!openAIResponse.ok) {
      console.error("OpenAI returned status:", openAIResponse.status);
      return jsonResponse({ error: "Assistant service returned an error" }, 502, allowedOrigin);
    }

    let result;
    try {
      result = await openAIResponse.json();
    } catch (error) {
      console.error("Could not parse OpenAI response:", error);
      return jsonResponse({ error: "Assistant returned an invalid response" }, 502, allowedOrigin);
    }
    const outputItems = result && Array.isArray(result.output) ? result.output : [];
    const answer = outputItems
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n")
      .trim();

    if (!answer) {
      console.error("OpenAI returned no text output");
      return jsonResponse({ error: "Assistant returned no answer" }, 502, allowedOrigin);
    }

    return jsonResponse({ answer }, 200, allowedOrigin);
  }
};
