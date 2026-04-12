export type Tool       = 'pencil' | 'eraser' | 'fill' | 'eyedropper';
export type CanvasSize = 8 | 16 | 32 | 64;
export type ZoomLevel  = 1 | 2 | 4 | 8 | 16;

export interface SaveSlot {
	name:    string;
	data:    number[];   // RGBA array (JSON-serializable)
	size:    CanvasSize;
	savedAt: string;
}

export const DEFAULT_PALETTE: readonly string[] = [
	'#000000', '#ffffff', '#ff4455', '#ff8800',
	'#ffdd00', '#44ee66', '#00cc99', '#00aaff',
	'#4455ff', '#9944ff', '#ff44bb', '#884411',
	'#335533', '#113366', '#555566', '#99aabb',
];
