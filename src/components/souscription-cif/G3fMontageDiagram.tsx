import { cn } from "@/lib/utils";

type G3fMontageDiagramProps = {
  className?: string;
};

const TEAL = "#178a98";
const LINE = "#9aa3ad";
const LABEL = "#646c74";
const EURO_BG = "#eef0f2";
/** Recul avant le losange pour laisser la pointe de flèche visible. */
const TIP_INSET = 14;

type Point = { x: number; y: number };

type DiamondNodeProps = {
  center: Point;
  size: number;
  lines: string[];
  icon?: "investors" | "inter-invest";
};

function DiamondNode({ center, size, lines, icon }: DiamondNodeProps) {
  const half = size / 2;
  const lineHeight = 10.5;
  const textBlockHeight = lines.length * lineHeight;
  const startY = center.y - textBlockHeight / 2 + lineHeight * 0.38;

  return (
    <g>
      <rect
        x={center.x - half}
        y={center.y - half}
        width={size}
        height={size}
        fill={TEAL}
        transform={`rotate(45 ${center.x} ${center.y})`}
      />
      {icon === "investors" && (
        <g transform={`translate(${center.x - 15} ${center.y - 30})`} aria-hidden>
          <circle cx={6} cy={4.5} r={3} fill="white" />
          <circle cx={15.5} cy={4.5} r={3} fill="white" />
          <circle cx={25} cy={4.5} r={3} fill="white" />
          <path
            d="M1.5 13.5c0-2.8 2.2-4.5 4.5-4.5s4.5 1.7 4.5 4.5M10.5 13.5c0-2.8 2.2-4.5 4.5-4.5s4.5 1.7 4.5 4.5M19.5 13.5c0-2.8 2.2-4.5 4.5-4.5s4.5 1.7 4.5 4.5"
            fill="none"
            stroke="white"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </g>
      )}
      {icon === "inter-invest" && (
        <g transform={`translate(${center.x - 7} ${center.y + 16})`} aria-hidden>
          <rect x={0} y={0} width={3.5} height={12} rx={0.8} fill="white" />
          <rect x={9} y={0} width={3.5} height={12} rx={0.8} fill="white" />
        </g>
      )}
      {lines.map((line, index) => (
        <text
          key={`${line}-${index}`}
          x={center.x}
          y={startY + index * lineHeight}
          textAnchor="middle"
          fill="white"
          fontSize={8.5}
          fontWeight={700}
          letterSpacing={0.35}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function insetSegment(from: Point, to: Point, startInset = 0, endInset = 0): { from: Point; to: Point } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    from: { x: from.x + ux * startInset, y: from.y + uy * startInset },
    to: { x: to.x - ux * endInset, y: to.y - uy * endInset },
  };
}

function segmentAngle(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function ArrowHead({ tip, angleDeg }: { tip: Point; angleDeg: number }) {
  const size = 9;
  const rad = (angleDeg * Math.PI) / 180;
  const left = {
    x: tip.x - size * Math.cos(rad - Math.PI / 6),
    y: tip.y - size * Math.sin(rad - Math.PI / 6),
  };
  const right = {
    x: tip.x - size * Math.cos(rad + Math.PI / 6),
    y: tip.y - size * Math.sin(rad + Math.PI / 6),
  };
  return (
    <polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`} fill={LINE} />
  );
}

function EuroBadge({ at }: { at: Point }) {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <circle r={9} fill={EURO_BG} stroke={LINE} strokeWidth={1} />
      <text textAnchor="middle" dominantBaseline="central" fill={LABEL} fontSize={10} fontWeight={600}>
        €
      </text>
    </g>
  );
}

function FlowLabel({
  x,
  y,
  lines,
  anchor = "middle",
}: {
  x: number;
  y: number;
  lines: string[];
  anchor?: "middle" | "start" | "end";
}) {
  const lineHeight = 8.5;
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill={LABEL}
      fontSize={7}
      fontWeight={600}
      letterSpacing={0.12}
      stroke="white"
      strokeWidth={4}
      paintOrder="stroke fill"
    >
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

type FlowArrowProps = {
  from: Point;
  to: Point;
  bidirectional?: boolean;
  labelLines?: string[];
  labelPos?: Point;
  euroAt?: number;
  tipInset?: number;
  linesOnly?: boolean;
  tipsOnly?: boolean;
};

function FlowArrow({
  from,
  to,
  bidirectional = false,
  labelLines,
  labelPos,
  euroAt,
  tipInset = TIP_INSET,
  linesOnly = false,
  tipsOnly = false,
}: FlowArrowProps) {
  const seg = insetSegment(from, to, tipInset, tipInset);
  const angle = segmentAngle(from, to);
  const reverseAngle = angle + 180;

  return (
    <g>
      {!tipsOnly && (
        <line
          x1={seg.from.x}
          y1={seg.from.y}
          x2={seg.to.x}
          y2={seg.to.y}
          stroke={LINE}
          strokeWidth={1.35}
        />
      )}
      {!linesOnly && (
        <>
          <ArrowHead tip={seg.to} angleDeg={angle} />
          {bidirectional && <ArrowHead tip={seg.from} angleDeg={reverseAngle} />}
        </>
      )}
      {!tipsOnly && euroAt != null && (
        <EuroBadge
          at={{
            x: from.x + (to.x - from.x) * euroAt,
            y: from.y + (to.y - from.y) * euroAt,
          }}
        />
      )}
      {!tipsOnly && labelLines && labelPos && (
        <FlowLabel x={labelPos.x} y={labelPos.y} lines={labelLines} />
      )}
    </g>
  );
}

/** Schéma du montage Girardin industriel — annexes G3F. */
export function G3fMontageDiagram({ className }: G3fMontageDiagramProps) {
  const nodes = {
    investisseurs: { x: 112, y: 228 },
    etat: { x: 228, y: 78 },
    interInvest: { x: 228, y: 378 },
    snc: { x: 418, y: 228 },
    exploitant: { x: 584, y: 78 },
    banque: { x: 584, y: 378 },
    fournisseur: { x: 738, y: 228 },
  } as const;

  const edge = 46;
  /** Sommet droit des losanges Exploitant / Banque (carré demi-côté h, angle 45°). */
  const diamondEastX = (centerX: number, size: number) => centerX + (size / 2) * Math.SQRT2;
  const exploitantRouteStart = {
    x: diamondEastX(nodes.exploitant.x, 104) + 2,
    y: nodes.exploitant.y,
  };
  const banqueRouteEnd = {
    x: diamondEastX(nodes.banque.x, 92),
    y: nodes.banque.y,
  };
  const routeRightX = 778;
  /** Bracket Exploitant ↔ Banque — sommets est des losanges, trait en L. */
  const exploitantBanqueCornerTop = { x: routeRightX, y: exploitantRouteStart.y };
  const exploitantBanqueCornerBottom = { x: routeRightX, y: banqueRouteEnd.y };
  const exploitantBanquePathD = [
    `M ${exploitantRouteStart.x} ${exploitantRouteStart.y}`,
    `L ${exploitantBanqueCornerTop.x} ${exploitantBanqueCornerTop.y}`,
    `L ${exploitantBanqueCornerBottom.x} ${exploitantBanqueCornerBottom.y}`,
    `L ${banqueRouteEnd.x} ${banqueRouteEnd.y}`,
  ].join(" ");

  const links: FlowArrowProps[] = [
    {
      from: { x: nodes.etat.x - 16, y: nodes.etat.y + 32 },
      to: { x: nodes.investisseurs.x + 18, y: nodes.investisseurs.y - 32 },
      labelLines: ["RÉDUCTION D'IMPÔT", "ANNÉE N+1"],
      labelPos: { x: 148, y: 132 },
    },
    {
      from: { x: nodes.interInvest.x - 22, y: nodes.interInvest.y - 22 },
      to: { x: nodes.investisseurs.x + 12, y: nodes.investisseurs.y + 32 },
      labelLines: ["CESSION DE PARTS / ACTIONS"],
      labelPos: { x: 118, y: 318 },
    },
    {
      from: { x: nodes.investisseurs.x + edge, y: nodes.investisseurs.y },
      to: { x: nodes.snc.x - edge, y: nodes.snc.y },
      euroAt: 0.5,
    },
    {
      from: { x: nodes.snc.x + 12, y: nodes.snc.y - 32 },
      to: { x: nodes.exploitant.x - 12, y: nodes.exploitant.y + 32 },
      bidirectional: true,
      labelLines: ["CONTRAT DE LOCATION"],
      labelPos: { x: 498, y: 118 },
    },
    {
      from: { x: nodes.snc.x + 12, y: nodes.snc.y + 32 },
      to: { x: nodes.banque.x - 12, y: nodes.banque.y - 32 },
      bidirectional: true,
      labelLines: ["CONTRAT DE PRÊT"],
      labelPos: { x: 498, y: 352 },
    },
    {
      from: { x: nodes.snc.x + edge, y: nodes.snc.y },
      to: { x: nodes.fournisseur.x - edge, y: nodes.fournisseur.y },
      euroAt: 0.58,
    },
    {
      from: { x: nodes.exploitant.x + 28, y: nodes.exploitant.y + 28 },
      to: { x: nodes.fournisseur.x - 8, y: nodes.fournisseur.y - 28 },
      euroAt: 0.5,
      labelLines: ["DÉPÔT INITIAL"],
      labelPos: { x: 668, y: 148 },
    },
    {
      from: { x: nodes.banque.x + 28, y: nodes.banque.y - 28 },
      to: { x: nodes.fournisseur.x - 8, y: nodes.fournisseur.y + 28 },
      euroAt: 0.5,
      labelLines: ["PRÊT"],
      labelPos: { x: 668, y: 318 },
    },
  ];

  return (
    <figure
      className={cn(
        "cif-g3f-montage cif-document-comfortaa mt-[5mm] w-full font-comfortaa",
        className
      )}
      aria-label="Schéma du montage Girardin industriel"
    >
      <svg
        viewBox="0 0 820 480"
        className="mx-auto block h-auto w-full max-w-[185mm]"
        role="img"
        aria-hidden
      >
        <g className="g3f-montage-links">
          {links.map((link, index) => (
            <FlowArrow key={`line-${index}`} {...link} linesOnly />
          ))}

          <FlowLabel
            x={(nodes.snc.x + nodes.fournisseur.x) / 2}
            y={nodes.snc.y - 22}
            lines={["RÉTROCESSION DE L'AVANTAGE FISCAL", "AU LOCATAIRE"]}
          />

          <path
            d={exploitantBanquePathD}
            fill="none"
            stroke={LINE}
            strokeWidth={1.35}
          />

          <FlowLabel
            x={668}
            y={398}
            lines={[
              "CESSION DE CRÉANCES ET",
              "LIMITATION DE RECOURS",
              "CONTRE L'EMPRUNTEUR",
            ]}
            anchor="start"
          />
        </g>

        <g className="g3f-montage-nodes">
          <DiamondNode
            center={nodes.investisseurs}
            size={104}
            lines={["INVESTISSEURS"]}
            icon="investors"
          />
          <DiamondNode center={nodes.etat} size={92} lines={["ÉTAT"]} />
          <DiamondNode
            center={nodes.interInvest}
            size={104}
            lines={["INTER", "INVEST"]}
            icon="inter-invest"
          />
          <DiamondNode center={nodes.snc} size={118} lines={["SNC, SAS", "OU SA"]} />
          <DiamondNode center={nodes.exploitant} size={104} lines={["EXPLOITANT"]} />
          <DiamondNode center={nodes.banque} size={92} lines={["BANQUE"]} />
          <DiamondNode center={nodes.fournisseur} size={104} lines={["FOURNISSEUR"]} />
        </g>

        <g className="g3f-montage-arrow-tips" pointerEvents="none">
          {links.map((link, index) => (
            <FlowArrow key={`tip-${index}`} {...link} tipsOnly />
          ))}
          {/* Une pointe par extrémité du L (comme SNC ↔ Exploitant), pas par segment. */}
          <ArrowHead
            tip={insetSegment(exploitantRouteStart, exploitantBanqueCornerTop, TIP_INSET, 0).from}
            angleDeg={segmentAngle(exploitantRouteStart, exploitantBanqueCornerTop) + 180}
          />
          <ArrowHead
            tip={insetSegment(exploitantBanqueCornerBottom, banqueRouteEnd, 0, TIP_INSET).to}
            angleDeg={segmentAngle(exploitantBanqueCornerBottom, banqueRouteEnd)}
          />
        </g>
      </svg>
    </figure>
  );
}
