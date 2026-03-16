import { useState, useRef, useCallback } from "react";
import { useSimpleConfirm, SimpleConfirmModal } from "./SimpleConfirm";
import { usePatientsDispatch } from "../context/PatientsContext";
import { generateId } from "../utils/id";
import type { PatientEntry, PatientPhoto } from "../types";

/** Compress image to max dimension and quality for localStorage */
function compressImage(
  dataUrl: string,
  maxDim = 800,
  quality = 0.6
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

const MAX_PHOTOS = 10;

// ── AI Analysis via /api/claude ──────────────────────────────────────────────

async function analyzePhotosWithAI(
  photos: PatientPhoto[],
  patient: PatientEntry
): Promise<string> {
  const imageContents = photos.slice(0, 4).map((p) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/jpeg" as const,
      data: p.dataUrl.replace(/^data:image\/[a-z]+;base64,/, ""),
    },
  }));

  const context = [
    patient.name ? `Patient: ${patient.name}` : null,
    patient.age ? `Age: ${patient.age}` : null,
    patient.diagnosis ? `Diagnosis: ${patient.diagnosis}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            ...imageContents,
            {
              type: "text",
              text: `You are a geriatric medicine clinical assistant at SZMC. Analyze these clinical images for a geriatric patient.
Context: ${context || "No context provided"}

Provide a concise clinical summary in English:
1. What you observe in each image (labs, imaging, ECG, wound, clinical findings)
2. Key abnormalities or concerns
3. Relevance to the patient's known diagnosis
Keep it brief and clinically actionable — this goes into a shift handoff note.`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return (data?.content?.[0]?.text ?? "").trim();
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  patient: PatientEntry;
  /** Compact mode for handoff cards — smaller thumbnails, inline buttons */
  compact?: boolean;
}

export function PhotoAttachments({ patient, compact }: Props) {
  const dispatch = usePatientsDispatch();
  const [viewing, setViewing] = useState<PatientPhoto | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState(false);
  const photos = patient.photos ?? [];

  const addPhotos = useCallback(
    async (files: FileList) => {
      const remaining = MAX_PHOTOS - photos.length;
      if (remaining <= 0) return;
      const toProcess = Array.from(files).slice(0, remaining);
      for (const file of toProcess) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const compressed = await compressImage(dataUrl);
        const photo: PatientPhoto = {
          id: generateId("photo-"),
          dataUrl: compressed,
          time: new Date().toISOString(),
        };
        dispatch({ type: "ADD_PHOTO", patientId: patient.id, photo });
      }
    },
    [dispatch, patient.id, photos.length]
  );

  const handleFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      addPhotos(files);
      e.target.value = "";
    },
    [addPhotos]
  );

  const { confirmState, requestConfirm, dismiss: dismissConfirm } =
    useSimpleConfirm();

  const handleRemove = (photoId: string) => {
    requestConfirm("למחוק תמונה?", () => {
      dispatch({ type: "REMOVE_PHOTO", patientId: patient.id, photoId });
    });
  };

  const handleAI = async () => {
    if (photos.length === 0) return;
    setAiLoading(true);
    setAiError(false);
    try {
      const result = await analyzePhotosWithAI(photos, patient);
      setAiResult(result);
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  const applyAIToNote = () => {
    if (!aiResult) return;
    const current = patient.handoverNote ?? "";
    const note = current
      ? `${current}\n\n📸 AI: ${aiResult}`
      : `📸 AI: ${aiResult}`;
    dispatch({ type: "SET_HANDOVER_NOTE", patientId: patient.id, note });
    setAiResult(null);
  };

  const thumbSize = compact ? "w-12 h-12" : "w-16 h-16";
  const atLimit = photos.length >= MAX_PHOTOS;

  return (
    <div className="space-y-1.5">
      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {photos.map((photo) => (
            <div key={photo.id} className="relative flex-none">
              <img
                src={photo.dataUrl}
                alt={photo.caption || "צילום"}
                onClick={() => setViewing(photo)}
                className={`${thumbSize} rounded-lg object-cover border border-gray-700 cursor-pointer active:opacity-70`}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(photo.id);
                }}
                className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center leading-none"
                aria-label="מחק תמונה"
              >
                ✕
              </button>
              {!compact && (
                <div className="text-[8px] text-gray-500 text-center mt-0.5 tabular-nums">
                  {new Date(photo.time).toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-1.5">
        {/* Camera button */}
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={atLimit}
          className="text-[11px] px-2 py-1 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 active:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          📷 צלם
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFiles}
          className="hidden"
        />

        {/* Gallery button — multi-select */}
        <button
          onClick={() => galleryRef.current?.click()}
          disabled={atLimit}
          className="text-[11px] px-2 py-1 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 active:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          🖼️ גלריה
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="hidden"
        />

        {/* AI analyze button */}
        {photos.length > 0 && (
          <button
            onClick={handleAI}
            disabled={aiLoading}
            className="text-[11px] px-2 py-1 rounded-lg border border-teal-700 bg-teal-900/30 text-teal-300 active:bg-teal-800/40 disabled:opacity-50"
          >
            {aiLoading ? "🔄 מנתח..." : "✨ AI ניתוח"}
          </button>
        )}

        {/* Counter */}
        {photos.length > 0 && (
          <span className="text-[10px] text-gray-600 self-center mr-auto">
            {photos.length}/{MAX_PHOTOS}
          </span>
        )}
      </div>

      {/* AI result */}
      {aiError && (
        <div className="text-[10px] text-red-400">
          ⚠️ שגיאה בניתוח —{" "}
          <button onClick={handleAI} className="underline">
            נסה שוב
          </button>
        </div>
      )}
      {aiResult && (
        <div className="bg-teal-900/20 border border-teal-700/40 rounded-lg p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-teal-400">
              ✨ ניתוח AI
            </span>
            <button
              onClick={applyAIToNote}
              className="text-[10px] px-2 py-0.5 rounded bg-teal-600 text-white active:bg-teal-700"
            >
              הוסף למסירה
            </button>
          </div>
          <p
            className="text-[11px] text-teal-200 leading-relaxed whitespace-pre-wrap"
            dir="auto"
          >
            {aiResult}
          </p>
        </div>
      )}

      {/* Full-screen viewer */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setViewing(null)}
        >
          <img
            src={viewing.dataUrl}
            alt={viewing.caption || "צילום"}
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={() => setViewing(null)}
            className="absolute top-4 left-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center"
            aria-label="סגור"
          >
            ✕
          </button>
          <div className="absolute bottom-4 text-white text-sm text-center w-full">
            {new Date(viewing.time).toLocaleString("he-IL")}
          </div>
        </div>
      )}
      <SimpleConfirmModal state={confirmState} onCancel={dismissConfirm} />
    </div>
  );
}
