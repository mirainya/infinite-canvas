import { useCallback, useEffect, useRef } from 'react';
import type { Node, NodeDragHandler } from 'reactflow';

const SNAP_THRESHOLD = 5;

export function useSnapAlign(nodes: Node[]) {
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shiftRef = useRef(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const ensureSvg = () => {
    if (svgRef.current) return svgRef.current;
    const vp = document.querySelector('.react-flow__viewport');
    if (!vp) return null;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'snap-guides');
    svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1000;overflow:visible';
    vp.appendChild(svg);
    svgRef.current = svg;
    return svg;
  };

  const drawGuides = useCallback((lines: { axis: 'x' | 'y'; pos: number }[]) => {
    const svg = ensureSvg();
    if (!svg) return;
    svg.innerHTML = '';
    for (const g of lines) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      if (g.axis === 'x') {
        line.setAttribute('x1', String(g.pos));
        line.setAttribute('y1', '-100000');
        line.setAttribute('x2', String(g.pos));
        line.setAttribute('y2', '100000');
      } else {
        line.setAttribute('x1', '-100000');
        line.setAttribute('y1', String(g.pos));
        line.setAttribute('x2', '100000');
        line.setAttribute('y2', String(g.pos));
      }
      line.setAttribute('stroke', '#6366f1');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '4 2');
      svg.appendChild(line);
    }
  }, []);

  const onNodeDrag: NodeDragHandler = useCallback((_event, dragNode) => {
    if (!shiftRef.current) return;
    const dw = dragNode.width ?? 200;
    const dh = dragNode.height ?? 100;
    const dLeft = dragNode.position.x;
    const dRight = dLeft + dw;
    const dCx = dLeft + dw / 2;
    const dTop = dragNode.position.y;
    const dBottom = dTop + dh;
    const dCy = dTop + dh / 2;

    const active: { axis: 'x' | 'y'; pos: number }[] = [];
    let snapX: number | null = null;
    let snapY: number | null = null;

    for (const n of nodesRef.current) {
      if (n.id === dragNode.id) continue;
      const w = n.width ?? 200;
      const h = n.height ?? 100;
      const nLeft = n.position.x;
      const nRight = nLeft + w;
      const nCx = nLeft + w / 2;
      const nTop = n.position.y;
      const nBottom = nTop + h;
      const nCy = nTop + h / 2;

      if (snapX === null) {
        const pairs = [[dLeft, nLeft], [dLeft, nRight], [dRight, nLeft], [dRight, nRight], [dCx, nCx]];
        for (const [drag, ref] of pairs) {
          if (Math.abs(drag - ref) < SNAP_THRESHOLD) {
            snapX = ref - (drag - dLeft);
            active.push({ axis: 'x', pos: ref });
            break;
          }
        }
      }

      if (snapY === null) {
        const pairs = [[dTop, nTop], [dTop, nBottom], [dBottom, nTop], [dBottom, nBottom], [dCy, nCy]];
        for (const [drag, ref] of pairs) {
          if (Math.abs(drag - ref) < SNAP_THRESHOLD) {
            snapY = ref - (drag - dTop);
            active.push({ axis: 'y', pos: ref });
            break;
          }
        }
      }

      if (snapX !== null && snapY !== null) break;
    }

    if (snapX !== null) dragNode.position.x = snapX;
    if (snapY !== null) dragNode.position.y = snapY;

    drawGuides(active);
  }, [drawGuides]);

  const onNodeDragStop: NodeDragHandler = useCallback(() => {
    drawGuides([]);
  }, [drawGuides]);

  return { onNodeDrag, onNodeDragStop };
}
