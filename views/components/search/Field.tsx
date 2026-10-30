import { ReactNode } from "react";

/** Champ de formulaire du panneau de recherche : libellé discret au-dessus, contrôle sur toute la largeur. */
export const Field = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) => (
	<div className="legifrance-field">
		<label htmlFor={htmlFor}>{label}</label>
		{children}
	</div>
);
