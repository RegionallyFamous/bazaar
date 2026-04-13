import type { Tool } from '../types.ts';

interface Props {
	tool:    Tool;
	onTool:  ( t: Tool ) => void;
	canUndo: boolean;
	canRedo: boolean;
	onUndo:  () => void;
	onRedo:  () => void;
	onClear: () => void;
}

const TOOLS: { id: Tool; label: string; icon: string; title: string }[] = [
	{ id: 'pencil',    label: '✏️', icon: '✏', title: 'Pencil (P)' },
	{ id: 'eraser',    label: '⬜', icon: '◻', title: 'Eraser (E)' },
	{ id: 'fill',      label: '🪣', icon: '▣', title: 'Fill Bucket (F)' },
	{ id: 'eyedropper',label: '🔬', icon: '◎', title: 'Eyedropper (I)' },
];

const BTN = 'toolbar__btn';

export default function Toolbar( { tool, onTool, canUndo, canRedo, onUndo, onRedo, onClear }: Props ) {
	return (
		<aside className="toolbar">
			<div className="toolbar__section">
			{ TOOLS.map( t => (
				<button
					key={ t.id }
					className={ `${ BTN }${ tool === t.id ? ` ${ BTN }--active` : '' }` }
					title={ t.title }
					aria-pressed={ tool === t.id }
					onClick={ () => onTool( t.id ) }
				>
					<span className="toolbar__icon">{ t.icon }</span>
				</button>
			) ) }
			</div>

			<div className="toolbar__divider" />

			<div className="toolbar__section">
				<button
					className={ `${ BTN }${ ! canUndo ? ` ${ BTN }--disabled` : '' }` }
					title="Undo (Ctrl+Z)"
					onClick={ onUndo }
					disabled={ ! canUndo }
				>
					<span className="toolbar__icon">↩</span>
				</button>
				<button
					className={ `${ BTN }${ ! canRedo ? ` ${ BTN }--disabled` : '' }` }
					title="Redo (Ctrl+Y)"
					onClick={ onRedo }
					disabled={ ! canRedo }
				>
					<span className="toolbar__icon">↪</span>
				</button>
			</div>

			<div className="toolbar__divider" />

			<div className="toolbar__section">
				<button
					className={ BTN }
					title="Clear canvas"
					onClick={ onClear }
				>
					<span className="toolbar__icon">🗑</span>
				</button>
			</div>
		</aside>
	);
}
