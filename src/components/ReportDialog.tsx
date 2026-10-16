import { useEffect, useState } from "react";
import { downloadPngFile } from "../lib/graphImage";

type Props = {
  open: boolean;
  projectName: string;
  text: string;
  svg: string;
  width: number;
  height: number;
  onClose: () => void;
  children?: React.ReactNode;
};

export default function ReportDialog({ open, projectName, text, svg, width, height, onClose, children }: Props) {
  const [note, setNote] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [open, svg]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="report-overlay" onClick={onClose}>
      <article className="report-sheet" onClick={(event) => event.stopPropagation()}>
        <header className="report-head no-print">
          <div>
            <strong>Informe del proyecto</strong>
            <span>{projectName}</span>
          </div>
          <div className="report-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(text).then(
                  () => setNote("Informe copiado."),
                  () => setNote("No se pudo copiar. Selecciona el texto."),
                );
              }}
            >
              Copiar texto
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                void downloadPngFile(svg, "pathwise-grafo.png", width, height).then(
                  () => setNote("Grafo descargado."),
                  () => setNote("No se pudo descargar el grafo."),
                );
              }}
            >
              Descargar grafo
            </button>
            <button type="button" className="button button-primary" onClick={() => window.print()}>
              Imprimir / PDF
            </button>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </header>
        {note && <p className="report-note no-print">{note}</p>}
        <pre className="report-text">{text}</pre>
        {imageUrl && <img className="report-graph" src={imageUrl} alt="Diagrama de red del proyecto" />}
        {children}
      </article>
    </div>
  );
}
