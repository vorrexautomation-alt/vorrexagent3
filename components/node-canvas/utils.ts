// components/node-canvas/utils.ts

export const NODE_WIDTH = 190;
export const NODE_HEADER_HEIGHT = 44;
export const PORT_ROW_HEIGHT = 22;

let idCounter = 0;
/** Small dependency-free unique id for nodes/connections created on the
 * client (React Flow needs stable string ids we control). */
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export interface PortLayout {
  id: string;
  label?: string;
  y: number;
}

export interface NodeLayout {
  height: number;
  inputs: PortLayout[];
  outputs: PortLayout[];
}

/** Computes card height and each port's vertical offset from the top of the
 * card. Used by FlowNode.tsx to position stacked <Handle> elements (for
 * multi-output nodes like IF/Switch) consistently with the card's height. */
export function getNodeLayout(def: {
  inputs: Array<{ id: string; label?: string }>;
  outputs: Array<{ id: string; label?: string }>;
}): NodeLayout {
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  const bodyHeight = rows * PORT_ROW_HEIGHT + 16;
  const height = NODE_HEADER_HEIGHT + bodyHeight;
  const portY = (i: number) => NODE_HEADER_HEIGHT + 8 + i * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
  return {
    height,
    inputs: def.inputs.map((p, i) => ({ ...p, y: portY(i) })),
    outputs: def.outputs.map((p, i) => ({ ...p, y: portY(i) })),
  };
}
