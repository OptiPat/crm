import { Fragment } from "react";
import { CifPreviewSegments } from "@/components/souscription-cif/CifPreviewSegments";
import type { SouscriptionPreviewSegment } from "@/lib/souscription-cif/render-template";

type CifProseProps = {
  segments: SouscriptionPreviewSegment[];
  className?: string;
  onMissingVariableClick?: (key: string) => void;
};

type ProseLine = SouscriptionPreviewSegment[];
type ProseBlock = { kind: "para"; lines: ProseLine[] } | { kind: "blank" };

/**
 * Découpe les segments en lignes (sur les `\n`), en préservant le formatage inline
 * (gras / souligné / variable manquante). Une ligne vide reste vide (= saut de ligne).
 */
function splitIntoLines(segments: SouscriptionPreviewSegment[]): ProseLine[] {
  const lines: ProseLine[] = [[]];
  for (const seg of segments) {
    if (seg.kind === "missing") {
      lines[lines.length - 1].push(seg);
      continue;
    }
    const parts = seg.value.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part.length > 0) lines[lines.length - 1].push({ ...seg, value: part });
    });
  }
  return lines;
}

/** Regroupe les lignes en paragraphes (blocs), séparés par les lignes vides. */
function groupIntoBlocks(lines: ProseLine[]): ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let current: ProseLine[] | null = null;
  for (const line of lines) {
    if (line.length === 0) {
      if (current) {
        blocks.push({ kind: "para", lines: current });
        current = null;
      }
      blocks.push({ kind: "blank" });
    } else {
      if (!current) current = [];
      current.push(line);
    }
  }
  if (current) blocks.push({ kind: "para", lines: current });
  return blocks;
}

/**
 * Corps de texte CIF rendu en **paragraphes de niveau bloc** plutôt qu'en un seul
 * bloc `white-space: pre-wrap` géant.
 *
 * Motivation : Paged.js fragmente mal un unique bloc très haut truffé de `<br>`
 * (texte tronqué + dupliqué entre pages — cas des descriptions SCPI en annexe).
 * En isolant chaque paragraphe dans son propre bloc, le navigateur dispose de
 * points de coupe propres et la pagination redevient fiable. La hauteur reste
 * identique : chaque ligne source = une ligne rendue, lignes vides comprises.
 */
export function CifProse({ segments, className, onMissingVariableClick }: CifProseProps) {
  const blocks = groupIntoBlocks(splitIntoLines(segments));
  return (
    <div className={className}>
      {blocks.map((block, i) =>
        block.kind === "blank" ? (
          <div key={i} aria-hidden>
            <br />
          </div>
        ) : (
          <div key={i}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                <CifPreviewSegments
                  segments={line}
                  onMissingVariableClick={onMissingVariableClick}
                />
              </Fragment>
            ))}
          </div>
        )
      )}
    </div>
  );
}
