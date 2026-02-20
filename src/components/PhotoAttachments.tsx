import { useState, useRef } from "react";
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

export function PhotoAttachments({ patient }: { patient: PatientEntry }) {
  const dispatch = usePatientsDispatch();
  const [viewing, setViewing] = useState<PatientPhoto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photos = patient.photos ?? [];

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const raw = reader.result as string;
      const compressed = await compressImage(raw);
      const photo: PatientPhoto = {
        id: generateId("photo-"),
        dataUrl: compressed,
        time: new Date().toISOString(),
      };
      dispatch({ type: "ADD_PHOTO", patientId: patient.id, photo });
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleRemove = (photoId: string) => {
    if (confirm("למחוק תמונה?")) {
      dispatch({ type: "REMOVE_PHOTO", patientId: patient.id, photoId });
    }
  };

  return (
    <div>
      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {photos.map((photo) => (
            <div key={photo.id} className="relative flex-none">
              <img
                src={photo.dataUrl}
                alt={photo.caption || "צילום"}
                onClick={() => setViewing(photo)}
                className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700 cursor-pointer active:opacity-70"
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
              <div className="text-[8px] text-gray-400 text-center mt-0.5 tabular-nums">
                {new Date(photo.time).toLocaleTimeString("he-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add photo button */}
      <button
        onClick={() => inputRef.current?.click()}
        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 active:bg-gray-100"
      >
        📷 צלם / צרף תמונה
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

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
    </div>
  );
}
