import { ReactNode } from "react";

interface SettingRowProps {
	name: ReactNode;
	desc?: ReactNode;
	/** Id du champ que le libellé désigne (accessibilité). */
	htmlFor?: string;
	children: ReactNode;
}

/**
 * Ligne de formulaire au rendu natif des réglages d'Obsidian (`setting-item`) :
 * libellé à gauche, contrôles à droite.
 */
export const SettingRow = ({ name, desc, htmlFor, children }: SettingRowProps) => (
	<div className="setting-item">
		<div className="setting-item-info">
			<label className="setting-item-name" htmlFor={htmlFor}>
				{name}
			</label>
			{desc && <div className="setting-item-description">{desc}</div>}
		</div>
		<div className="setting-item-control">{children}</div>
	</div>
);
