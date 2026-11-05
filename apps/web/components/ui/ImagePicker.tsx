"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, errorMessage, uploadGalleryImage, type GalleryImage, type GalleryPage, type ImageCategory } from "../../lib/api";
import { optimizedImage, responsiveImageSet } from "../../lib/images";

type ImagePickerProps = {
  category: ImageCategory;
  label: string;
  value: string;
  onChange: (url: string) => void;
  onUploadStateChange?: (busy: boolean) => void;
};

export default function ImagePicker({ category, label, value, onChange, onUploadStateChange }: ImagePickerProps) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async (next?: string) => {
    setBusy(true);
    setError("");
    try {
      const page = await apiFetch<GalleryPage>(`/api/media/${category}${next ? `?cursor=${encodeURIComponent(next)}` : ""}`, { auth: true });
      setImages((previous) => next ? [...previous, ...page.images] : page.images);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // A new gallery is loaded only when its panel opens or its category changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  const upload = async (file?: File) => {
    if (!file) return;
    onUploadStateChange?.(true);
    setBusy(true);
    setError("");
    try {
      const image = await uploadGalleryImage(category, file);
      setImages((previous) => [image, ...previous]);
      onChange(image.url);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      onUploadStateChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[#173B6C]">{label}</p>
      {value && <img src={optimizedImage(value, 640)} srcSet={responsiveImageSet(value)} sizes="(max-width: 640px) 100vw, 400px" alt="Imagen seleccionada" className="aspect-video w-full rounded border border-[#d6c7aa] object-cover" />}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="min-h-11 rounded border border-[#B58A43] px-4 text-sm font-medium text-[#173B6C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173B6C]">
          {open ? "Ocultar galería" : "Elegir de galería"}
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded bg-[#B58A43] px-4 text-sm font-medium text-[#173B6C] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#173B6C]">
          Subir imagen
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy} onChange={(event) => void upload(event.target.files?.[0])} className="sr-only" aria-label={`Subir ${label.toLowerCase()}`} />
        </label>
      </div>
      <p className="text-xs text-[#5b6780]">PNG, JPEG, WebP o AVIF · máximo 8 MB. Las imágenes se guardan en Cloudinary.</p>
      {error && <p role="alert" className="text-sm text-[#991b1b]">{error}</p>}
      {open && (
        <div className="max-h-80 overflow-y-auto rounded border border-[#d6c7aa] p-3" aria-label={`Galería de ${label.toLowerCase()}`}>
          {busy && images.length === 0 && <p role="status" className="text-sm text-[#173B6C]">Cargando imágenes…</p>}
          {!busy && images.length === 0 && !error && <p className="text-sm text-[#5b6780]">Todavía no hay imágenes en esta carpeta.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((image) => (
              <button key={image.id} type="button" onClick={() => onChange(image.url)} aria-label="Seleccionar imagen" aria-pressed={value === image.url} className={`min-h-20 overflow-hidden rounded border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173B6C] ${value === image.url ? "border-[#B58A43]" : "border-transparent"}`}>
                <img src={image.thumbnailUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </button>
            ))}
          </div>
          {cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)} className="mt-3 min-h-11 w-full rounded border border-[#B58A43] px-4 text-sm text-[#173B6C] disabled:opacity-50">{busy ? "Cargando…" : "Ver más"}</button>}
        </div>
      )}
    </div>
  );
}
