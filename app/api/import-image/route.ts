import { NextRequest, NextResponse } from "next/server";

type VisionFlightResult = {
  airline: string;
  route: string;
  departure: string;
  arrival: string;
  price: number;
  currency: string;
  baggage: string;
  notes: string;
};

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function normalizeFlight(data: Partial<VisionFlightResult>): VisionFlightResult {
  return {
    airline: String(data.airline || "").trim(),
    route: String(data.route || "").trim(),
    departure: String(data.departure || "").trim(),
    arrival: String(data.arrival || "").trim(),
    price: Number(data.price || 0),
    currency: String(data.currency || "EUR").trim() || "EUR",
    baggage: String(data.baggage || "").trim(),
    notes: String(data.notes || "Imported via Vision").trim(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const imageBase64 = body?.imageBase64;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "Missing imageBase64" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const prompt = `
Read this flight booking screenshot and extract the visible flight details.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanation text.

Use exactly this shape:
{
  "airline": "",
  "route": "",
  "departure": "",
  "arrival": "",
  "price": 0,
  "currency": "EUR",
  "baggage": "",
  "notes": ""
}

Rules:
- route should look like "SOF → BRI" or "Sofia → Bari"
- departure and arrival should contain the visible times if shown
- price should be a number only
- currency should usually be "EUR" unless another currency is clearly shown
- baggage should contain short visible baggage info if shown
- notes can contain short useful info like "1 stop" or "nonstop"
- if something is not visible, return empty string for text fields and 0 for price
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              {
                type: "input_image",
                image_url: imageBase64,
              },
            ],
          },
        ],
      }),
    });

    const raw = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Vision API request failed",
          status: response.status,
          details: raw,
        },
        { status: 500 }
      );
    }

    const text =
      raw?.output?.[0]?.content?.find((item: any) => item.type === "output_text")
        ?.text || "{}";

    const parsed = safeJsonParse<Partial<VisionFlightResult>>(text, {});
    const flight = normalizeFlight(parsed);

    return NextResponse.json({
      success: true,
      flight,
      rawText: text,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Server error",
        message: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}