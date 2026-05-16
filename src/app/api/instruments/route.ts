import { NextResponse } from "next/server";
import { createInstrument, InstrumentServiceError } from "@/server/transactions";

function getStatusCode(error: InstrumentServiceError) {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return 400;
    case "DUPLICATE_INSTRUMENT":
      return 409;
    default:
      return 500;
  }
}

function jsonErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown> | null
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? null
      }
    },
    { status }
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const instrument = await createInstrument(payload);

    return NextResponse.json({ instrument }, { status: 201 });
  } catch (error) {
    if (error instanceof InstrumentServiceError) {
      return jsonErrorResponse(error.code, error.message, getStatusCode(error), error.details);
    }

    if (error instanceof SyntaxError) {
      return jsonErrorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    console.error("Unexpected instrument API failure", error);

    return jsonErrorResponse("INTERNAL_ERROR", "Instrument could not be saved.", 500);
  }
}
