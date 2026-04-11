import { DEFAULT_PALETTE } from '../types.ts';

interface Props {
	primaryColor:    string;
	onColorChange:   ( hex: string ) => void;
	saveSlots:       { name: string; savedAt: string }[];
	saveName:        string;
	onSaveNameChange:( v: string ) => void;
	onSave:          () => void;
	onLoad:          ( index: number ) => void;
	onExport:        () => void;
}

export default function Palette( {
	primaryColor, onColorChange,
	saveSlots, saveName, onSaveNameChange, onSave, onLoad, onExport,
}: Props ) {
	return (
		<aside className="palette">
			<section className="palette__section">
				<h3 className="palette__heading">Colour</h3>
				<div className="palette__swatches">
					{ DEFAULT_PALETTE.map( hex => (
						<button
							key={ hex }
							className={ `palette__swatch${ hex === primaryColor ? ' palette__swatch--active' : '' }` }
							style={ { background: hex } }
							title={ hex }
							onClick={ () => onColorChange( hex ) }
						/>
					) ) }
				</div>
				<label className="palette__custom-label">
					Custom
					<input
						type="color"
						className="palette__custom-input"
						value={ primaryColor }
						onChange={ e => onColorChange( e.target.value ) }
					/>
				</label>
				<div
					className="palette__current"
					style={ { background: primaryColor } }
					title={ primaryColor }
				/>
			</section>

			<section className="palette__section">
				<h3 className="palette__heading">Export</h3>
				<button className="palette__action-btn" onClick={ onExport }>
					↓ Export PNG
				</button>
			</section>

			<section className="palette__section">
				<h3 className="palette__heading">Save</h3>
				<input
					className="palette__name-input"
					type="text"
					value={ saveName }
					onChange={ e => onSaveNameChange( e.target.value ) }
					placeholder="Artwork name…"
					maxLength={ 40 }
				/>
				<button className="palette__action-btn" onClick={ onSave }>
					Save slot
				</button>
				{ saveSlots.length > 0 && (
					<ul className="palette__slots">
						{ saveSlots.map( ( slot, i ) => (
							<li key={ slot.savedAt } className="palette__slot">
								<button
									className="palette__slot-btn"
									onClick={ () => onLoad( i ) }
									title={ `Saved ${ new Date( slot.savedAt ).toLocaleString() }` }
								>
									{ slot.name }
								</button>
							</li>
						) ) }
					</ul>
				) }
			</section>
		</aside>
	);
}
