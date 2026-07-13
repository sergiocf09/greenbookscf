import { supabase } from "@/integrations/supabase/client";

export type TeeColorDetected =
  | "azul"
  | "blanco"
  | "amarillo"
  | "rojo"
  | "negro"
  | "dorado"
  | null;

export interface DetectedPlayer {
  nameInCard: string;
  scores: (number | null)[]; // length 18
  putts: (number | null)[] | null; // length 18 or null
}

export interface ParsedScorecard {
  detectedPlayers: DetectedPlayer[];
  detectedCourseName: string | null;
  detectedDate: string | null; // YYYY-MM-DD
  detectedTeeColor: TeeColorDetected;
  confidence: "high" | "medium" | "low";
}

export type ScorecardInput = File | Blob | string; // File/Blob from picker, or existing data URL

/**
 * Convert a File/Blob to a data URL (base64) suitable for the vision model.
 */
async function toDataUrl(input: ScorecardInput): Promise<string> {
  if (typeof input === "string") {
    if (!input.startsWith("data:image/")) {
      throw new Error("La cadena de entrada debe ser un data URL de imagen (data:image/...)");
    }
    return input;
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("No se pudo leer la imagen"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Error leyendo imagen"));
    reader.readAsDataURL(input as Blob);
  });
}

function normalizeScores(arr: unknown): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: 18 }, () => null);
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < 18; i++) {
    const v = arr[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 20) {
      out[i] = Math.round(v);
    } else {
      out[i] = null;
    }
  }
  return out;
}

function normalizePutts(arr: unknown): (number | null)[] | null {
  if (arr === null || arr === undefined) return null;
  if (!Array.isArray(arr)) return null;
  const out: (number | null)[] = Array.from({ length: 18 }, () => null);
  for (let i = 0; i < 18; i++) {
    const v = arr[i];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 15) {
      out[i] = Math.round(v);
    } else {
      out[i] = null;
    }
  }
  return out;
}

function normalizeTeeColor(v: unknown): TeeColorDetected {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().trim();
  const allowed = ["azul", "blanco", "amarillo", "rojo", "negro", "dorado"] as const;
  return (allowed as readonly string[]).includes(s) ? (s as TeeColorDetected) : null;
}

function normalizeConfidence(v: unknown): "high" | "medium" | "low" {
  return v === "high" || v === "medium" || v === "low" ? v : "low";
}

/**
 * Sends the image to the parse-scorecard edge function and returns a normalized result.
 */
export async function parseScorecard(input: ScorecardInput): Promise<ParsedScorecard> {
  const imageDataUrl = await toDataUrl(input);

  const { data, error } = await supabase.functions.invoke("parse-scorecard", {
    body: { imageDataUrl },
  });

  if (error) {
    throw new Error(error.message || "No se pudo analizar la tarjeta");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Respuesta inválida del servidor");
  }

  const raw = data as Record<string, unknown>;

  const detectedPlayers: DetectedPlayer[] = Array.isArray(raw.detectedPlayers)
    ? (raw.detectedPlayers as unknown[]).map((p) => {
        const obj = (p ?? {}) as Record<string, unknown>;
        return {
          nameInCard: typeof obj.nameInCard === "string" ? obj.nameInCard.trim() : "",
          scores: normalizeScores(obj.scores),
          putts: normalizePutts(obj.putts),
        };
      }).filter((p) => p.nameInCard.length > 0)
    : [];

  return {
    detectedPlayers,
    detectedCourseName:
      typeof raw.detectedCourseName === "string" && raw.detectedCourseName.trim()
        ? raw.detectedCourseName.trim()
        : null,
    detectedDate:
      typeof raw.detectedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.detectedDate)
        ? raw.detectedDate
        : null,
    detectedTeeColor: normalizeTeeColor(raw.detectedTeeColor),
    confidence: normalizeConfidence(raw.confidence),
  };
}
